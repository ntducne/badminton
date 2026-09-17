import { getMongoClient } from './db.ts';
import { ensureOperationalIndexes } from './db-indexes.ts';
import type { InventoryMovement, Payment, Quarter, Session, ShuttlecockBatch } from './types.ts';

const apply = process.argv.includes('--apply');
const rollbackIndex = process.argv.indexOf('--rollback');
const rollbackId = rollbackIndex >= 0 ? process.argv[rollbackIndex + 1] : undefined;
const client = await getMongoClient();
const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');

async function rollback() {
  if (!rollbackId) throw new Error('Thiếu backup ID cho --rollback');
  const backup = await db.collection('migration_backups_stage567').findOne({ id: rollbackId });
  if (!backup) throw new Error(`Không tìm thấy backup ${rollbackId}`);
  const mongoSession = client.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      for (const name of ['shuttle_batches', 'inventory_movements', 'quarters', 'payments', 'sessions', 'audit_logs']) {
        await db.collection(name).deleteMany({}, { session: mongoSession });
        const documents = backup[name] || [];
        if (documents.length) await db.collection(name).insertMany(documents, { session: mongoSession });
      }
      await db.collection('migration_backups_stage567').updateOne(
        { id: rollbackId }, { $set: { rolledBackAt: new Date().toISOString() } }, { session: mongoSession }
      );
    });
  } finally {
    await mongoSession.endSession();
  }
  console.log(JSON.stringify({ database: db.databaseName, rolledBackBackupId: rollbackId }, null, 2));
}

async function migrate() {
  const [batches, existingMovements, quarters, payments, sessions, auditLogs] = await Promise.all([
    db.collection<ShuttlecockBatch>('shuttle_batches').find({}).toArray(),
    db.collection<InventoryMovement>('inventory_movements').find({}).toArray(),
    db.collection<Quarter>('quarters').find({}).toArray(),
    db.collection<Payment>('payments').find({}).toArray(),
    db.collection<Session>('sessions').find({}).toArray(),
    db.collection('audit_logs').find({}).toArray(),
  ]);
  const movementsToInsert: InventoryMovement[] = [];
  for (const batch of batches) {
    const batchMovements = existingMovements.filter((movement) => movement.batchId === batch.id);
    if (!batchMovements.some((movement) => movement.type === 'PURCHASE')) {
      movementsToInsert.push({
        id: `migration:inventory:purchase:${batch.id}`,
        batchId: batch.id,
        type: 'PURCHASE',
        quantity: batch.totalBalls,
        unitCost: batch.pricePerBall,
        reason: 'Backfill lô cầu hiện hữu',
        createdByUserId: 'migration-stage567',
        createdByName: 'Migration Giai đoạn 5-7',
        createdAt: `${batch.purchaseDate}T00:00:00.000Z`,
      });
    }
    const projected = [...batchMovements, ...movementsToInsert.filter((movement) => movement.batchId === batch.id)]
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const difference = batch.remainingBalls - projected;
    if (difference !== 0) {
      movementsToInsert.push({
        id: `migration:inventory:adjustment:${batch.id}`,
        batchId: batch.id,
        type: 'ADJUSTMENT',
        quantity: difference,
        unitCost: batch.pricePerBall,
        reason: 'Đối chiếu tồn kho khi migration',
        createdByUserId: 'migration-stage567',
        createdByName: 'Migration Giai đoạn 5-7',
        createdAt: new Date().toISOString(),
      });
    }
  }

  const report = {
    database: db.databaseName,
    mode: apply ? 'APPLY' : 'DRY_RUN',
    batchesToVersion: batches.filter((batch) => batch.version === undefined).length,
    inventoryMovementsToInsert: movementsToInsert.length,
    quartersToConfigure: quarters.filter((quarter) => quarter.version === undefined || quarter.roundingUnit === undefined).length,
    paymentsToVersion: payments.filter((payment) => payment.version === undefined).length,
    auditsToTag: auditLogs.filter((log) => !log.requestId).length,
  };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const runId = `stage567:${new Date().toISOString()}`;
  const mongoSession = client.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      await db.collection('migration_backups_stage567').insertOne({
        id: runId, createdAt: new Date().toISOString(),
        shuttle_batches: batches,
        inventory_movements: existingMovements,
        quarters,
        payments,
        sessions,
        audit_logs: auditLogs,
      }, { session: mongoSession });
      for (const movement of movementsToInsert) {
        await db.collection<InventoryMovement>('inventory_movements').updateOne(
          { id: movement.id }, { $setOnInsert: movement }, { upsert: true, session: mongoSession }
        );
      }
      await db.collection<ShuttlecockBatch>('shuttle_batches').updateMany(
        { version: { $exists: false } },
        { $set: { version: 0, updatedAt: new Date().toISOString() } },
        { session: mongoSession }
      );
      await db.collection<Quarter>('quarters').updateMany({}, [{
        $set: {
          absenceDeadlineHours: { $ifNull: ['$absenceDeadlineHours', 6] },
          courtFeePolicy: { $ifNull: ['$courtFeePolicy', 'LIABLE_MEMBERS_AND_GUESTS'] },
          roundingUnit: { $ifNull: ['$roundingUnit', 1000] },
          cancellationFeePolicy: { $ifNull: ['$cancellationFeePolicy', 'NONE'] },
          memberJoinPolicy: { $ifNull: ['$memberJoinPolicy', 'PRORATED_BY_SESSION'] },
          balanceCarryPolicy: { $ifNull: ['$balanceCarryPolicy', 'SETTLE_NOW'] },
        },
      }], { session: mongoSession });
      await db.collection<Quarter>('quarters').updateMany(
        { version: { $exists: false } }, { $set: { version: 0 } }, { session: mongoSession }
      );
      for (const payment of payments) {
        const dueAt = payment.dueAt || new Date(new Date(payment.createdAt).getTime() + 7 * 86_400_000).toISOString();
        await db.collection<Payment>('payments').updateOne(
          { id: payment.id }, { $set: { version: payment.version || 0, dueAt } }, { session: mongoSession }
        );
      }
      await db.collection<Session>('sessions').updateMany(
        { 'participants.totalReimbursed': { $exists: false } },
        { $set: { 'participants.$[].totalReimbursed': 0 } },
        { session: mongoSession }
      );
      for (const log of auditLogs.filter((item) => !item.requestId)) {
        await db.collection('audit_logs').updateOne(
          { _id: log._id }, { $set: { requestId: `legacy:${log.id || String(log._id)}` } }, { session: mongoSession }
        );
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    await ensureOperationalIndexes(db);
  } finally {
    await mongoSession.endSession();
  }
  console.log(JSON.stringify({ ...report, backupId: runId }, null, 2));
}

try {
  if (rollbackIndex >= 0) await rollback();
  else await migrate();
  await client.close();
} catch (error) {
  console.error('Stage 5-7 migration failed:', error);
  await client.close();
  process.exit(1);
}
