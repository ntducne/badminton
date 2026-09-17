import type { ClientSession, Db } from 'mongodb';
import type { AuthSessionUser } from './auth';
import { ensureOperationalIndexes } from './db-indexes';
import { getMongoClient } from './db';
import { sessionVersionFilter } from './session-state';
import type {
  Payment,
  PaymentEvent,
  PaymentMethod,
  Session,
  SessionParticipant,
  TreasuryDirection,
  TreasuryEntry,
  TreasuryEntryType,
} from './types';

export class FinanceError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'FinanceError';
  }
}

export function paymentOutstanding(payment: Payment): number {
  if (payment.status === 'CANCELLED' || payment.status === 'REFUNDED') return 0;
  return Math.max(0, payment.expectedAmount - payment.paidAmount + payment.refundedAmount);
}

export function paymentStatus(payment: Payment): Payment['status'] {
  if (payment.status === 'CANCELLED') return 'CANCELLED';
  const netPaid = payment.paidAmount - payment.refundedAmount;
  if (payment.refundedAmount > 0 && netPaid === 0) return 'REFUNDED';
  if (netPaid <= 0) return 'PENDING';
  return netPaid >= payment.expectedAmount ? 'PAID' : 'PARTIAL';
}

function entryTypeFor(payment: Payment): TreasuryEntryType {
  if (payment.direction === 'PAYABLE') return 'ADVANCE_REFUND';
  return payment.payerType === 'GUEST' ? 'GUEST_PAYMENT' : 'MEMBER_PAYMENT';
}

async function updateParticipantTotals(
  db: Db,
  payment: Payment,
  delta: number,
  mongoSession: ClientSession
) {
  if (!payment.sessionId || !payment.participantId) return;
  const session = await db.collection<Session>('sessions').findOne(
    { id: payment.sessionId },
    { session: mongoSession }
  );
  if (!session) throw new FinanceError('Không tìm thấy buổi đánh của khoản thanh toán', 409);

  let found = false;
  const participants = session.participants.map((participant): SessionParticipant => {
    if (participant.id !== payment.participantId) return participant;
    found = true;
    if (payment.direction === 'RECEIVABLE') {
      const netSettlement = participant.netSettlement - delta;
      return {
        ...participant,
        totalPaid: Math.max(0, (participant.totalPaid || 0) + delta),
        netSettlement,
        debtAmount: Math.max(0, netSettlement),
        paymentStatus: netSettlement > 0 ? 'PARTIAL' : netSettlement < 0 ? 'OVERPAID' : 'PAID',
      };
    }
    const netSettlement = participant.netSettlement + delta;
    return {
      ...participant,
      totalReimbursed: Math.max(0, (participant.totalReimbursed || 0) + delta),
      netSettlement,
      debtAmount: Math.max(0, netSettlement),
      paymentStatus: netSettlement === 0 ? 'PAID' : participant.paymentStatus,
    };
  });
  if (!found) throw new FinanceError('Không tìm thấy người thanh toán trong buổi đánh', 409);

  const result = await db.collection<Session>('sessions').updateOne(
    sessionVersionFilter(session),
    {
      $set: {
        participants,
        version: (session.version || 0) + 1,
        updatedAt: new Date().toISOString(),
      },
    },
    { session: mongoSession }
  );
  if (result.modifiedCount !== 1) {
    throw new FinanceError('Buổi đánh vừa được cập nhật, vui lòng thử lại', 409);
  }
}

export async function applyPaymentAction(
  paymentId: string,
  action: 'CONFIRM' | 'REFUND',
  amount: number,
  method: PaymentMethod,
  reference: string | undefined,
  user: AuthSessionUser,
  requestId = crypto.randomUUID()
): Promise<Payment> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  let result: Payment | undefined;

  try {
    await mongoSession.withTransaction(async () => {
      const payment = await db.collection<Payment>('payments').findOne(
        { id: paymentId },
        { session: mongoSession }
      );
      if (!payment) throw new FinanceError('Không tìm thấy khoản thanh toán', 404);
      if (payment.status === 'CANCELLED') throw new FinanceError('Khoản thanh toán đã bị hủy', 409);

      if (action === 'CONFIRM' && payment.direction === 'PAYABLE' && amount > paymentOutstanding(payment)) {
        throw new FinanceError('Số tiền hoàn khoản ứng vượt quá công nợ', 409);
      }
      if (action === 'REFUND') {
        if (payment.direction !== 'RECEIVABLE') {
          throw new FinanceError('Chỉ khoản tiền đã thu mới có thể hoàn', 409);
        }
        if (amount > payment.paidAmount - payment.refundedAmount) {
          throw new FinanceError('Số tiền hoàn vượt quá số thực nhận', 409);
        }
      }

      const now = new Date().toISOString();
      const eventId = `payment-event:${crypto.randomUUID()}`;
      const event: PaymentEvent = {
        id: eventId,
        paymentId,
        action,
        amount,
        method,
        reference,
        confirmedBy: user.id,
        confirmedByName: user.name,
        createdAt: now,
      };
      await db.collection<PaymentEvent>('payment_events').insertOne(event, { session: mongoSession });

      const direction: TreasuryDirection = action === 'REFUND'
        ? 'OUT'
        : payment.direction === 'RECEIVABLE' ? 'IN' : 'OUT';
      const type: TreasuryEntryType = action === 'REFUND' ? 'MEMBER_REFUND' : entryTypeFor(payment);
      const entry: TreasuryEntry = {
        id: `treasury:${eventId}`,
        quarterId: payment.quarterId || 'unassigned',
        sessionId: payment.sessionId,
        settlementId: payment.settlementId,
        paymentId,
        type,
        amount,
        direction,
        status: 'POSTED',
        description: action === 'REFUND'
          ? `Hoàn tiền cho ${payment.payerName}`
          : `${direction === 'IN' ? 'Thu từ' : 'Hoàn khoản ứng cho'} ${payment.payerName}`,
        createdByUserId: user.id,
        createdByName: user.name,
        createdAt: now,
      };
      await db.collection<TreasuryEntry>('treasury').insertOne(entry, { session: mongoSession });

      await updateParticipantTotals(db, payment, action === 'REFUND' ? -amount : amount, mongoSession);

      const nextPayment: Payment = {
        ...payment,
        paidAmount: payment.paidAmount + (action === 'CONFIRM' ? amount : 0),
        refundedAmount: payment.refundedAmount + (action === 'REFUND' ? amount : 0),
        method,
        reference,
        confirmedBy: user.id,
        confirmedAt: now,
        updatedAt: now,
        version: (payment.version || 0) + 1,
      };
      nextPayment.status = paymentStatus(nextPayment);
      const update = await db.collection<Payment>('payments').replaceOne(
        {
          id: payment.id,
          paidAmount: payment.paidAmount,
          refundedAmount: payment.refundedAmount,
          status: payment.status,
          version: payment.version || 0,
        },
        nextPayment,
        { session: mongoSession }
      );
      if (update.modifiedCount !== 1) {
        throw new FinanceError('Khoản thanh toán vừa được cập nhật, vui lòng thử lại', 409);
      }

      await db.collection('audit_logs').insertOne({
        id: `audit:${eventId}`,
        entityType: 'PAYMENT',
        entityId: payment.id,
        action,
        oldData: { paidAmount: payment.paidAmount, refundedAmount: payment.refundedAmount, status: payment.status },
        newData: { paidAmount: nextPayment.paidAmount, refundedAmount: nextPayment.refundedAmount, status: nextPayment.status },
        userId: user.id,
        userName: user.name,
        requestId,
        createdAt: now,
      }, { session: mongoSession });
      result = nextPayment;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await mongoSession.endSession();
  }

  if (!result) throw new FinanceError('Không thể cập nhật thanh toán', 500);
  return result;
}

export async function createAdjustment(
  quarterId: string,
  amount: number,
  direction: TreasuryDirection,
  description: string,
  user: AuthSessionUser,
  requestId = crypto.randomUUID()
): Promise<TreasuryEntry> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  const entry: TreasuryEntry = {
    id: `treasury:adjustment:${crypto.randomUUID()}`,
    quarterId,
    type: 'ADJUSTMENT',
    amount,
    direction,
    status: 'POSTED',
    description,
    createdByUserId: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString(),
  };
  try {
    await mongoSession.withTransaction(async () => {
      await db.collection<TreasuryEntry>('treasury').insertOne(entry, { session: mongoSession });
      await db.collection('audit_logs').insertOne({
        id: `audit:${entry.id}`,
        entityType: 'TREASURY_ENTRY',
        entityId: entry.id,
        action: 'ADJUSTMENT',
        newData: entry,
        userId: user.id,
        userName: user.name,
        requestId,
        createdAt: entry.createdAt,
      }, { session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }
  return entry;
}

export async function reverseTreasuryEntry(
  entryId: string,
  description: string,
  user: AuthSessionUser,
  requestId = crypto.randomUUID()
): Promise<TreasuryEntry> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  let reversal: TreasuryEntry | undefined;
  try {
    await mongoSession.withTransaction(async () => {
      const original = await db.collection<TreasuryEntry>('treasury').findOne(
        { id: entryId, status: 'POSTED' },
        { session: mongoSession }
      );
      if (!original) throw new FinanceError('Bút toán không tồn tại hoặc đã được đảo', 409);
      const existingReversal = await db.collection<TreasuryEntry>('treasury').findOne(
        { reversesEntryId: original.id, status: 'POSTED' },
        { session: mongoSession }
      );
      if (existingReversal) throw new FinanceError('Bút toán đã được đảo trước đó', 409);
      const now = new Date().toISOString();
      const originalData = { ...original } as TreasuryEntry & { _id?: unknown };
      delete originalData._id;
      reversal = {
        ...originalData,
        id: `treasury:reversal:${crypto.randomUUID()}`,
        type: 'REVERSAL',
        direction: original.direction === 'IN' ? 'OUT' : 'IN',
        status: 'POSTED',
        reversesEntryId: original.id,
        description,
        createdByUserId: user.id,
        createdByName: user.name,
        createdAt: now,
      } as TreasuryEntry;
      await db.collection<TreasuryEntry>('treasury').insertOne(reversal, { session: mongoSession });
      await db.collection('audit_logs').insertOne({
        id: `audit:${reversal.id}`,
        entityType: 'TREASURY_ENTRY',
        entityId: original.id,
        action: 'REVERSE',
        oldData: originalData,
        newData: reversal,
        userId: user.id,
        userName: user.name,
        requestId,
        createdAt: now,
      }, { session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }
  if (!reversal) throw new FinanceError('Không thể đảo bút toán', 500);
  return reversal;
}
