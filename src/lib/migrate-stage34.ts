import { getMongoClient } from './db.ts';
import { ensureOperationalIndexes } from './db-indexes.ts';
import type { Payment, QuarterMember, Session, TreasuryEntry } from './types.ts';

const apply = process.argv.includes('--apply');
const rollbackFlagIndex = process.argv.indexOf('--rollback');
const rollbackId = rollbackFlagIndex >= 0 ? process.argv[rollbackFlagIndex + 1] : undefined;

async function migrateStage34() {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  if (rollbackFlagIndex >= 0) {
    if (!rollbackId) throw new Error('Thiếu backup ID cho --rollback');
    const backup = await db.collection('migration_backups_stage34').findOne({ id: rollbackId });
    if (!backup) throw new Error(`Không tìm thấy backup ${rollbackId}`);
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await db.collection('payments').deleteMany({}, { session: mongoSession });
        await db.collection('treasury').deleteMany({}, { session: mongoSession });
        if (backup.existingPayments?.length) {
          await db.collection('payments').insertMany(backup.existingPayments, { session: mongoSession });
        }
        if (backup.existingTreasury?.length) {
          await db.collection('treasury').insertMany(backup.existingTreasury, { session: mongoSession });
        }
        for (const originalSession of backup.existingSessions || []) {
          await db.collection('sessions').replaceOne(
            { _id: originalSession._id }, originalSession, { session: mongoSession }
          );
        }
        await db.collection('migration_backups_stage34').updateOne(
          { id: rollbackId }, { $set: { rolledBackAt: new Date().toISOString() } }, { session: mongoSession }
        );
      });
    } finally {
      await mongoSession.endSession();
    }
    console.log(JSON.stringify({ database: db.databaseName, rolledBackBackupId: rollbackId }, null, 2));
    await client.close();
    return;
  }
  const [members, sessions, legacyTreasury] = await Promise.all([
    db.collection<QuarterMember>('quarter_members').find({ paidAmount: { $gt: 0 } }).toArray(),
    db.collection<Session>('sessions').find({ status: 'SETTLED', currentSettlementId: { $type: 'string' } }).toArray(),
    db.collection('treasury').find({ direction: { $exists: false } }).toArray(),
  ]);

  const payments: Payment[] = [];
  const entries: TreasuryEntry[] = [];
  const sessionUpdates: Session[] = [];

  for (const member of members) {
    const createdAt = new Date().toISOString();
    const paymentId = `migration:quarter-fee:${member.id}`;
    payments.push({
      id: paymentId,
      payerType: 'MEMBER',
      payerId: member.userId,
      payerName: member.userName,
      quarterId: member.quarterId,
      direction: 'RECEIVABLE',
      expectedAmount: member.fixedCourtFee,
      paidAmount: member.paidAmount,
      refundedAmount: 0,
      method: 'BANK_TRANSFER',
      status: member.paidAmount >= member.fixedCourtFee ? 'PAID' : 'PARTIAL',
      reference: 'MIGRATED_QUARTER_FEE',
      confirmedBy: 'migration-stage34',
      confirmedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
    entries.push({
      id: `migration:treasury:quarter-fee:${member.id}`,
      quarterId: member.quarterId,
      paymentId,
      type: 'QUARTER_FEE',
      amount: member.paidAmount,
      direction: 'IN',
      status: 'POSTED',
      description: `Phí quý đã thu của ${member.userName}`,
      createdByUserId: 'migration-stage34',
      createdByName: 'Migration Giai đoạn 3-4',
      createdAt,
    });
  }

  for (const session of sessions) {
    let changed = false;
    const participants = session.participants.map((participant) => {
      const net = participant.netSettlement || 0;
      const alreadyPaid = participant.totalPaid || 0;
      if (net === 0 && alreadyPaid === 0) return participant;
      const paymentId = `${session.currentSettlementId}:payment:${participant.id}`;
      const createdAt = session.settledAt || session.updatedAt || new Date().toISOString();
      if (net >= 0) {
        payments.push({
          id: paymentId,
          payerType: participant.isGuest ? 'GUEST' : 'MEMBER',
          payerId: participant.userId,
          payerName: participant.userName,
          participantId: participant.id,
          sessionId: session.id,
          settlementId: session.currentSettlementId,
          quarterId: session.quarterId,
          direction: 'RECEIVABLE',
          expectedAmount: net + alreadyPaid,
          paidAmount: alreadyPaid,
          refundedAmount: 0,
          method: alreadyPaid > 0 ? 'BANK_TRANSFER' : undefined,
          status: net === 0 ? 'PAID' : alreadyPaid > 0 ? 'PARTIAL' : 'PENDING',
          reference: 'MIGRATED_SESSION_PAYMENT',
          confirmedBy: alreadyPaid > 0 ? 'migration-stage34' : undefined,
          confirmedAt: alreadyPaid > 0 ? createdAt : undefined,
          createdAt,
          updatedAt: createdAt,
        });
      } else {
        payments.push({
          id: paymentId,
          payerType: participant.isGuest ? 'GUEST' : 'MEMBER',
          payerId: participant.userId,
          payerName: participant.userName,
          participantId: participant.id,
          sessionId: session.id,
          settlementId: session.currentSettlementId,
          quarterId: session.quarterId,
          direction: 'PAYABLE',
          expectedAmount: Math.abs(net),
          paidAmount: 0,
          refundedAmount: 0,
          status: 'PENDING',
          reference: 'MIGRATED_SESSION_PAYABLE',
          createdAt,
          updatedAt: createdAt,
        });
      }
      if (alreadyPaid > 0) {
        entries.push({
          id: `migration:treasury:session-payment:${session.id}:${participant.id}`,
          quarterId: session.quarterId,
          sessionId: session.id,
          settlementId: session.currentSettlementId,
          paymentId,
          type: participant.isGuest ? 'GUEST_PAYMENT' : 'MEMBER_PAYMENT',
          amount: alreadyPaid,
          direction: 'IN',
          status: 'POSTED',
          description: `Khoản đã thu của ${participant.userName} tại ${session.sessionCode}`,
          createdByUserId: 'migration-stage34',
          createdByName: 'Migration Giai đoạn 3-4',
          createdAt,
        });
      }
      changed = true;
      return { ...participant, paymentId };
    });
    if (changed) {
      const cleanSession = { ...session } as Session & { _id?: unknown };
      delete cleanSession._id;
      sessionUpdates.push({ ...cleanSession, participants });
    }
  }

  const report = {
    database: db.databaseName,
    mode: apply ? 'APPLY' : 'DRY_RUN',
    quarterPayments: members.length,
    settledSessions: sessions.length,
    paymentsToUpsert: payments.length,
    ledgerEntriesToUpsert: entries.length,
    legacyTreasuryEntriesToRetire: legacyTreasury.length,
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    await client.close();
    return;
  }

  const mongoSession = client.startSession();
  const runId = `stage34:${new Date().toISOString()}`;
  try {
    await mongoSession.withTransaction(async () => {
      await db.collection('migration_backups_stage34').insertOne({
        id: runId,
        createdAt: new Date().toISOString(),
        legacyTreasury,
        existingPayments: await db.collection('payments').find({}, { session: mongoSession }).toArray(),
        existingTreasury: await db.collection('treasury').find({}, { session: mongoSession }).toArray(),
        existingSessions: sessions,
      }, { session: mongoSession });

      for (const payment of payments) {
        await db.collection<Payment>('payments').updateOne(
          { id: payment.id }, { $setOnInsert: payment }, { upsert: true, session: mongoSession }
        );
      }
      for (const entry of entries) {
        await db.collection<TreasuryEntry>('treasury').updateOne(
          { id: entry.id }, { $setOnInsert: entry }, { upsert: true, session: mongoSession }
        );
      }
      for (const oldEntry of legacyTreasury) {
        await db.collection('treasury').updateOne(
          { _id: oldEntry._id, direction: { $exists: false } },
          { $set: { direction: 'IN', type: 'ADJUSTMENT', status: 'REVERSED', migrationRunId: runId } },
          { session: mongoSession }
        );
      }
      for (const session of sessionUpdates) {
        await db.collection<Session>('sessions').replaceOne(
          { id: session.id }, session, { session: mongoSession }
        );
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    await ensureOperationalIndexes(db);
  } finally {
    await mongoSession.endSession();
  }
  console.log(JSON.stringify({ ...report, backupId: runId }, null, 2));
  await client.close();
}

migrateStage34().catch((error: unknown) => {
  console.error('Stage 3-4 migration failed:', error);
  process.exit(1);
});
