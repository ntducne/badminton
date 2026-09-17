import type { ClientSession } from 'mongodb';
import { calculateSessionFinances } from './calculations';
import { ensureOperationalIndexes } from './db-indexes';
import { getMongoClient } from './db';
import { canTransitionSession, sessionVersionFilter } from './session-state';
import type { AuthSessionUser } from './auth';
import type {
  InventoryMovement,
  Payment,
  Session,
  SessionSettlement,
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
  notes?: string,
  requestId = crypto.randomUUID()
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

      const stockAllocations: Array<{
        usageId: string;
        batchId: string;
        brandName: string;
        quantity: number;
        unitCost: number;
      }> = [];
      const resolvedUsages = [];
      for (const usage of session.shuttleUsages) {
        let remaining = usage.ballsUsed;
        const candidates = usage.batchId && usage.batchId !== 'FIFO'
          ? await db.collection<ShuttlecockBatch>('shuttle_batches')
            .find({ id: usage.batchId }, { session: mongoSession }).toArray()
          : await db.collection<ShuttlecockBatch>('shuttle_batches')
            .find({ remainingBalls: { $gt: 0 } }, { session: mongoSession })
            .sort({ purchaseDate: 1, createdAt: 1, id: 1 }).toArray();
        let totalCost = 0;
        for (const batch of candidates) {
          if (remaining <= 0) break;
          const quantity = Math.min(remaining, batch.remainingBalls);
          if (quantity <= 0) continue;
          stockAllocations.push({
            usageId: usage.id,
            batchId: batch.id,
            brandName: batch.brandName,
            quantity,
            unitCost: batch.pricePerBall,
          });
          totalCost += quantity * batch.pricePerBall;
          remaining -= quantity;
        }
        if (remaining > 0) {
          throw new SettlementError(`Không đủ ${usage.ballsUsed} quả cầu cho ${usage.brandName}`, 409);
        }
        resolvedUsages.push({
          ...usage,
          pricePerBall: usage.ballsUsed > 0 ? Math.ceil(totalCost / usage.ballsUsed) : 0,
          totalCost,
        });
      }

      const sessionForCalculation = { ...session, shuttleUsages: resolvedUsages };
      const calculation = calculateSessionFinances(sessionForCalculation);
      if (calculation.activeCount === 0) {
        throw new SettlementError('Chưa có người chơi nào được điểm danh tham gia');
      }

      const nextSettlementVersion = (session.settlementVersion || 0) + 1;
      const settlementId = `settlement:${session.id}:v${nextSettlementVersion}`;
      const now = new Date().toISOString();

      for (const allocation of stockAllocations) {
        const stockResult = await db.collection<ShuttlecockBatch>('shuttle_batches').updateOne(
          { id: allocation.batchId, remainingBalls: { $gte: allocation.quantity } },
          { $inc: { remainingBalls: -allocation.quantity, version: 1 }, $set: { updatedAt: now } },
          { session: mongoSession }
        );
        if (stockResult.modifiedCount !== 1) {
          throw new SettlementError(`Lô ${allocation.brandName} không đủ ${allocation.quantity} quả cầu`, 409);
        }

        const movement: InventoryMovement = {
          id: `${settlementId}:usage:${allocation.usageId}:batch:${allocation.batchId}`,
          batchId: allocation.batchId,
          sessionId: session.id,
          settlementId,
          usageId: allocation.usageId,
          type: 'SESSION_USAGE',
          quantity: -allocation.quantity,
          unitCost: allocation.unitCost,
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

      const participantsWithPayments = [];
      for (const participant of calculation.participants) {
        if (participant.netSettlement === 0) {
          participantsWithPayments.push(participant);
          continue;
        }
        const paymentId = `${settlementId}:payment:${participant.id}`;
        const payment: Payment = {
          id: paymentId,
          payerType: participant.isGuest ? 'GUEST' : 'MEMBER',
          payerId: participant.userId,
          payerName: participant.userName,
          participantId: participant.id,
          sessionId: session.id,
          settlementId,
          quarterId: session.quarterId,
          direction: participant.netSettlement > 0 ? 'RECEIVABLE' : 'PAYABLE',
          expectedAmount: Math.abs(participant.netSettlement),
          paidAmount: 0,
          refundedAmount: 0,
          status: 'PENDING',
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection<Payment>('payments').insertOne(payment, { session: mongoSession });
        participantsWithPayments.push({ ...participant, paymentId });
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
        shuttleUsages: resolvedUsages,
        participants: participantsWithPayments,
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
        requestId,
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
  reason?: string,
  requestId = crypto.randomUUID()
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
          { $inc: { remainingBalls: quantity, version: 1 }, $set: { updatedAt: now } },
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

      const payments = await db.collection<Payment>('payments').find(
        { settlementId: settlement.id },
        { session: mongoSession }
      ).toArray();
      for (const payment of payments) {
        const paymentUpdate = await db.collection<Payment>('payments').updateOne(
          { id: payment.id, status: payment.status, version: payment.version || 0 },
          {
            $set: { status: 'CANCELLED', cancelledAt: now, cancelledReason: reason.trim(), updatedAt: now },
            $inc: { version: 1 },
          },
          { session: mongoSession }
        );
        if (paymentUpdate.modifiedCount !== 1) {
          throw new SettlementError('Công nợ vừa được cập nhật, vui lòng thử lại', 409);
        }
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
            participants: session.participants.map((participant) => {
              const mutableParticipant = { ...participant };
              delete mutableParticipant.paymentId;
              return mutableParticipant;
            }),
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
        requestId,
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
  reason?: string,
  requestId = crypto.randomUUID()
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
        requestId,
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
