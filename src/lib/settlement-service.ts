import type { ClientSession } from 'mongodb';
import { calculateSessionFinances } from './calculations';
import { ensureOperationalIndexes } from './db-indexes';
import { getMongoClient } from './db';
import { canTransitionSession, sessionVersionFilter } from './session-state';
import type { AuthSessionUser } from './auth';
import type {
  InventoryMovement,
  Session,
  SessionSettlement,
  SettlementTreasuryEntry,
  ShuttlecockBatch,
  SessionStatus,
} from './types';

export class SettlementError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SettlementError';
    this.status = status;
  }
}

type SettlementResult = {
  session: Session;
  calculation: ReturnType<typeof calculateSessionFinances>;
  settlementId: string;
  idempotent: boolean;
};

async function loadSession(id: string, mongoSession: ClientSession): Promise<Session> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  const session = await db.collection<Session>('sessions').findOne({ id }, { session: mongoSession });
  if (!session) throw new SettlementError('Không tìm thấy buổi đánh', 404);
  return session;
}

export async function settleSession(
  sessionId: string,
  user: AuthSessionUser,
  notes?: string
): Promise<SettlementResult> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);

  const mongoSession = client.startSession();
  let result: SettlementResult | undefined;

  try {
    await mongoSession.withTransaction(async () => {
      const session = await loadSession(sessionId, mongoSession);

      if (session.status === 'SETTLED' || session.isSettled) {
        if (!session.currentSettlementId) {
          throw new SettlementError('Buổi đã quyết toán theo dữ liệu cũ; cần migration trước khi thao tác lại', 409);
        }
        const existing = await db.collection<SessionSettlement>('session_settlements').findOne(
          { id: session.currentSettlementId, status: 'POSTED' },
          { session: mongoSession }
        );
        if (!existing) throw new SettlementError('Không tìm thấy snapshot quyết toán hiện tại', 409);
        result = {
          session,
          calculation: existing.calculation,
          settlementId: existing.id,
          idempotent: true,
        };
        return;
      }

      if (!canTransitionSession(session.status, 'SETTLED')) {
        throw new SettlementError(`Không thể quyết toán buổi ở trạng thái ${session.status}`, 409);
      }

      const calculation = calculateSessionFinances(session);
      if (calculation.activeCount === 0) {
        throw new SettlementError('Chưa có người chơi nào được điểm danh tham gia');
      }

      const nextSettlementVersion = (session.settlementVersion || 0) + 1;
      const settlementId = `settlement:${session.id}:v${nextSettlementVersion}`;
      const now = new Date().toISOString();

      for (const usage of session.shuttleUsages) {
        if (!usage.batchId || usage.ballsUsed <= 0) continue;
        const stockResult = await db.collection<ShuttlecockBatch>('shuttle_batches').updateOne(
          { id: usage.batchId, remainingBalls: { $gte: usage.ballsUsed } },
          { $inc: { remainingBalls: -usage.ballsUsed } },
          { session: mongoSession }
        );
        if (stockResult.modifiedCount !== 1) {
          throw new SettlementError(`Lô ${usage.brandName} không đủ ${usage.ballsUsed} quả cầu`, 409);
        }

        const movement: InventoryMovement = {
          id: `${settlementId}:usage:${usage.id}`,
          batchId: usage.batchId,
          sessionId: session.id,
          settlementId,
          usageId: usage.id,
          type: 'SESSION_USAGE',
          quantity: -usage.ballsUsed,
          unitCost: usage.pricePerBall,
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: now,
        };
        await db.collection<InventoryMovement>('inventory_movements').insertOne(movement, { session: mongoSession });
      }

      const settlement: SessionSettlement = {
        id: settlementId,
        sessionId: session.id,
        quarterId: session.quarterId,
        version: nextSettlementVersion,
        status: 'POSTED',
        calculation,
        notes,
        settledByUserId: user.id,
        settledByName: user.name,
        settledAt: now,
      };
      await db.collection<SessionSettlement>('session_settlements').insertOne(settlement, { session: mongoSession });

      if (calculation.existingGuests > 0 && session.guestSurcharge > 0) {
        const totalSurcharge = calculation.existingGuests * session.guestSurcharge;
        const treasuryEntry: SettlementTreasuryEntry = {
          id: `${settlementId}:guest-surcharge`,
          quarterId: session.quarterId,
          sessionId: session.id,
          settlementId,
          amount: totalSurcharge,
          type: 'GUEST_SURCHARGE',
          status: 'POSTED',
          description: `Phụ thu ${calculation.existingGuests} khách giao lưu tại buổi ${session.sessionCode}`,
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: now,
        };
        await db.collection<SettlementTreasuryEntry>('treasury').insertOne(treasuryEntry, { session: mongoSession });
      }

      const nextVersion = (session.version || 0) + 1;
      const updatedSession: Session = {
        ...session,
        status: 'SETTLED',
        isSettled: true,
        version: nextVersion,
        settlementVersion: nextSettlementVersion,
        currentSettlementId: settlementId,
        settledAt: now,
        settledByUserId: user.id,
        settledByName: user.name,
        settlementNotes: notes || session.settlementNotes,
        participants: calculation.participants,
        totalCourtFee: calculation.totalCourtFee,
        totalShuttleFee: calculation.totalShuttleFee,
        totalDrinkFee: calculation.totalDrinkFee,
        totalOtherFee: calculation.totalOtherFee,
        totalExpense: calculation.totalExpense,
        totalGuestRevenue: calculation.totalGuestRevenue,
        updatedAt: now,
      };
      const updateResult = await db.collection<Session>('sessions').replaceOne(
        sessionVersionFilter(session),
        updatedSession,
        { session: mongoSession }
      );
      if (updateResult.modifiedCount !== 1) {
        throw new SettlementError('Buổi đánh vừa được người khác cập nhật, vui lòng tải lại', 409);
      }

      await db.collection('audit_logs').insertOne({
        id: `audit:${settlementId}:settle`,
        entityType: 'SESSION',
        entityId: session.id,
        action: 'SETTLE',
        oldData: { status: session.status, version: session.version || 0 },
        newData: { status: 'SETTLED', settlementId, version: nextVersion },
        userId: user.id,
        userName: user.name,
        createdAt: now,
      }, { session: mongoSession });

      result = { session: updatedSession, calculation, settlementId, idempotent: false };
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await mongoSession.endSession();
  }

  if (!result) throw new SettlementError('Không thể hoàn tất quyết toán', 500);
  return result;
}

export async function reopenSession(
  sessionId: string,
  user: AuthSessionUser,
  reason?: string
): Promise<Session> {
  if (!reason?.trim()) throw new SettlementError('Vui lòng nhập lý do mở lại buổi đánh');

  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  let result: Session | undefined;

  try {
    await mongoSession.withTransaction(async () => {
      const session = await loadSession(sessionId, mongoSession);
      if (!canTransitionSession(session.status, 'REOPENED') || !session.currentSettlementId) {
        throw new SettlementError('Chỉ có thể mở lại một buổi đã quyết toán bằng hệ thống mới', 409);
      }

      const settlement = await db.collection<SessionSettlement>('session_settlements').findOne(
        { id: session.currentSettlementId, status: 'POSTED' },
        { session: mongoSession }
      );
      if (!settlement) throw new SettlementError('Quyết toán đã được đảo hoặc không tồn tại', 409);

      const now = new Date().toISOString();
      const movements = await db.collection<InventoryMovement>('inventory_movements')
        .find(
          { settlementId: settlement.id, type: 'SESSION_USAGE' },
          { session: mongoSession, projection: { _id: 0 } }
        )
        .toArray();

      for (const movement of movements) {
        const quantity = Math.abs(movement.quantity);
        await db.collection<ShuttlecockBatch>('shuttle_batches').updateOne(
          { id: movement.batchId },
          { $inc: { remainingBalls: quantity } },
          { session: mongoSession }
        );
        await db.collection<InventoryMovement>('inventory_movements').insertOne({
          ...movement,
          id: `reversal:${movement.id}`,
          type: 'REVERSAL',
          quantity,
          reversesMovementId: movement.id,
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: now,
        }, { session: mongoSession });
      }

      const treasuryEntries = await db.collection<SettlementTreasuryEntry>('treasury')
        .find(
          { settlementId: settlement.id, type: 'GUEST_SURCHARGE', status: 'POSTED' },
          { session: mongoSession, projection: { _id: 0 } }
        )
        .toArray();
      for (const entry of treasuryEntries) {
        await db.collection<SettlementTreasuryEntry>('treasury').insertOne({
          ...entry,
          id: `reversal:${entry.id}`,
          type: 'REVERSAL',
          amount: -entry.amount,
          status: 'POSTED',
          reversesEntryId: entry.id,
          description: `Đảo giao dịch: ${entry.description}`,
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: now,
        }, { session: mongoSession });
        await db.collection<SettlementTreasuryEntry>('treasury').updateOne(
          { id: entry.id },
          { $set: { status: 'REVERSED' } },
          { session: mongoSession }
        );
      }

      await db.collection<SessionSettlement>('session_settlements').updateOne(
        { id: settlement.id, status: 'POSTED' },
        { $set: {
          status: 'REVERSED',
          reversedAt: now,
          reversedByUserId: user.id,
          reversedByName: user.name,
          reversalReason: reason.trim(),
        } },
        { session: mongoSession }
      );

      const nextVersion = (session.version || 0) + 1;
      const updateResult = await db.collection<Session>('sessions').findOneAndUpdate(
        sessionVersionFilter(session),
        {
          $set: {
            status: 'REOPENED',
            isSettled: false,
            version: nextVersion,
            reopenedAt: now,
            reopenedByUserId: user.id,
            updatedAt: now,
          },
          $unset: {
            currentSettlementId: '',
            settledAt: '',
            settledByUserId: '',
            settledByName: '',
          },
        },
        { session: mongoSession, returnDocument: 'after' }
      );
      if (!updateResult) {
        throw new SettlementError('Buổi đánh vừa được người khác cập nhật, vui lòng tải lại', 409);
      }

      await db.collection('audit_logs').insertOne({
        id: `audit:${settlement.id}:reopen`,
        entityType: 'SESSION',
        entityId: session.id,
        action: 'REOPEN',
        oldData: { status: 'SETTLED', settlementId: settlement.id },
        newData: { status: 'REOPENED', reason: reason.trim(), version: nextVersion },
        userId: user.id,
        userName: user.name,
        createdAt: now,
      }, { session: mongoSession });

      result = updateResult;
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await mongoSession.endSession();
  }

  if (!result) throw new SettlementError('Không thể mở lại buổi đánh', 500);
  return result;
}

export async function transitionSessionState(
  sessionId: string,
  targetStatus: Extract<SessionStatus, 'OPEN' | 'LOCKED' | 'CANCELLED'>,
  user: AuthSessionUser,
  reason?: string
): Promise<Session> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  const mongoSession = client.startSession();
  let result: Session | undefined;

  try {
    await mongoSession.withTransaction(async () => {
      const session = await loadSession(sessionId, mongoSession);
      if (!canTransitionSession(session.status, targetStatus)) {
        throw new SettlementError(`Không thể chuyển từ ${session.status} sang ${targetStatus}`, 409);
      }
      if (targetStatus === 'CANCELLED' && session.currentSettlementId) {
        throw new SettlementError('Phải mở lại và đảo quyết toán trước khi hủy buổi', 409);
      }

      const now = new Date().toISOString();
      const nextVersion = (session.version || 0) + 1;
      const updateResult = await db.collection<Session>('sessions').findOneAndUpdate(
        sessionVersionFilter(session),
        { $set: { status: targetStatus, version: nextVersion, updatedAt: now } },
        { session: mongoSession, returnDocument: 'after' }
      );
      if (!updateResult) {
        throw new SettlementError('Buổi đánh vừa được người khác cập nhật, vui lòng tải lại', 409);
      }

      await db.collection('audit_logs').insertOne({
        id: `audit:${session.id}:state:${nextVersion}`,
        entityType: 'SESSION',
        entityId: session.id,
        action: 'STATE_TRANSITION',
        oldData: { status: session.status, version: session.version || 0 },
        newData: { status: targetStatus, version: nextVersion, reason: reason?.trim() },
        userId: user.id,
        userName: user.name,
        createdAt: now,
      }, { session: mongoSession });
      result = updateResult;
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await mongoSession.endSession();
  }

  if (!result) throw new SettlementError('Không thể chuyển trạng thái buổi đánh', 500);
  return result;
}
