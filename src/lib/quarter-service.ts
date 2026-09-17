import type { AuthSessionUser } from './auth';
import { getMongoClient } from './db';
import { ensureOperationalIndexes } from './db-indexes';
import { paymentOutstanding } from './finance-service';
import type {
  Payment,
  Quarter,
  QuarterMember,
  QuarterSettlement,
  QuarterSettlementLine,
  Session,
} from './types';

export class QuarterSettlementError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'QuarterSettlementError';
  }
}

function roundUp(amount: number, unit: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / unit) * unit;
}

export function calculateQuarterSettlement(
  quarter: Quarter,
  members: QuarterMember[],
  sessions: Session[]
): QuarterSettlementLine[] {
  const roundingUnit = quarter.roundingUnit || 1000;
  const settledSessions = sessions.filter((session) => session.status === 'SETTLED');
  const cancelledSessions = quarter.cancellationFeePolicy === 'ACTUAL_COST'
    ? sessions.filter((session) => session.status === 'CANCELLED' && session.totalCourtFee > 0)
    : [];

  return members.map((member) => {
    const details: QuarterSettlementLine['details'] = [];
    let attendedCount = 0;
    let absentValidCount = 0;
    let absentLateCount = 0;
    let actualCourtObligation = 0;
    const eligible = (session: Session) => session.sessionDate >= member.joinedDate
      && (!member.leftDate || session.sessionDate <= member.leftDate);

    for (const session of settledSessions.filter(eligible)) {
      const participant = session.participants.find((item) => item.userId === member.userId);
      if (!participant) continue;
      if (participant.attendanceStatus === 'ATTENDING') attendedCount += 1;
      if (participant.attendanceStatus === 'ABSENT_VALID') absentValidCount += 1;
      if (participant.attendanceStatus === 'ABSENT_LATE') absentLateCount += 1;
      const courtFeeShare = participant.attendanceStatus === 'ATTENDING'
        || participant.attendanceStatus === 'ABSENT_LATE'
        ? participant.courtFeeShare || 0
        : 0;
      actualCourtObligation += courtFeeShare;
      details.push({
        sessionId: session.id,
        sessionCode: session.sessionCode,
        sessionDate: session.sessionDate,
        attendanceStatus: participant.attendanceStatus,
        courtFeeShare,
      });
    }

    for (const session of cancelledSessions.filter(eligible)) {
      const eligibleMembers = members.filter((candidate) => session.sessionDate >= candidate.joinedDate
        && (!candidate.leftDate || session.sessionDate <= candidate.leftDate));
      const courtFeeShare = eligibleMembers.length > 0
        ? roundUp(session.totalCourtFee / eligibleMembers.length, roundingUnit)
        : 0;
      actualCourtObligation += courtFeeShare;
      details.push({
        sessionId: session.id,
        sessionCode: session.sessionCode,
        sessionDate: session.sessionDate,
        attendanceStatus: 'NOT_CONFIRMED',
        courtFeeShare,
      });
    }

    actualCourtObligation = roundUp(actualCourtObligation, roundingUnit);
    const quarterFeePaid = member.paidAmount || 0;
    const additionalPaid = 0;
    return {
      quarterMemberId: member.id,
      userId: member.userId,
      userName: member.userName,
      joinedDate: member.joinedDate,
      leftDate: member.leftDate,
      liableSessionCount: details.filter((item) => item.courtFeeShare > 0).length,
      attendedCount,
      absentValidCount,
      absentLateCount,
      actualCourtObligation,
      quarterFeePaid,
      additionalPaid,
      finalBalance: actualCourtObligation - quarterFeePaid - additionalPaid,
      details,
    };
  });
}

export async function previewQuarterSettlement(quarterId: string) {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  const quarter = await db.collection<Quarter>('quarters').findOne({ id: quarterId });
  if (!quarter) throw new QuarterSettlementError('Không tìm thấy quý', 404);
  const [members, sessions] = await Promise.all([
    db.collection<QuarterMember>('quarter_members').find({ quarterId }).toArray(),
    db.collection<Session>('sessions').find({ quarterId }).toArray(),
  ]);
  const lines = calculateQuarterSettlement(quarter, members, sessions);
  return {
    quarter,
    lines,
    totalObligation: lines.reduce((sum, line) => sum + line.actualCourtObligation, 0),
    totalQuarterFeesPaid: lines.reduce((sum, line) => sum + line.quarterFeePaid, 0),
    totalReceivable: lines.reduce((sum, line) => sum + Math.max(0, line.finalBalance), 0),
    totalPayable: lines.reduce((sum, line) => sum + Math.max(0, -line.finalBalance), 0),
  };
}

export async function settleQuarter(
  quarterId: string,
  user: AuthSessionUser,
  requestId: string,
  notes?: string
): Promise<QuarterSettlement> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  await ensureOperationalIndexes(db);
  const mongoSession = client.startSession();
  let result: QuarterSettlement | undefined;
  try {
    await mongoSession.withTransaction(async () => {
      const quarter = await db.collection<Quarter>('quarters').findOne({ id: quarterId }, { session: mongoSession });
      if (!quarter) throw new QuarterSettlementError('Không tìm thấy quý', 404);
      if (quarter.status === 'SETTLED' && quarter.currentSettlementId) {
        const existing = await db.collection<QuarterSettlement>('quarter_settlements').findOne(
          { id: quarter.currentSettlementId, status: 'POSTED' }, { session: mongoSession }
        );
        if (existing) {
          result = existing;
          return;
        }
      }
      if (quarter.status !== 'ACTIVE') throw new QuarterSettlementError('Chỉ có thể quyết toán quý đang hoạt động', 409);

      const [members, sessions] = await Promise.all([
        db.collection<QuarterMember>('quarter_members').find({ quarterId }).toArray(),
        db.collection<Session>('sessions').find({ quarterId }).toArray(),
      ]);
      if (sessions.some((session) => !['SETTLED', 'CANCELLED'].includes(session.status))) {
        throw new QuarterSettlementError('Mọi buổi trong quý phải được quyết toán hoặc hủy trước khi chốt quý', 409);
      }
      const lines = calculateQuarterSettlement(quarter, members, sessions);
      const version = (quarter.settlementVersion || 0) + 1;
      const settlementId = `quarter-settlement:${quarter.id}:v${version}`;
      const now = new Date().toISOString();
      const dueAt = new Date(Date.now() + 14 * 86_400_000).toISOString();

      for (const line of lines) {
        if (line.finalBalance === 0) continue;
        if (quarter.balanceCarryPolicy === 'CARRY_FORWARD') {
          await db.collection('quarter_balance_carryovers').insertOne({
            id: `${settlementId}:carry:${line.userId}`,
            sourceQuarterId: quarter.id,
            quarterSettlementId: settlementId,
            userId: line.userId,
            userName: line.userName,
            amount: line.finalBalance,
            status: 'PENDING_TRANSFER',
            createdAt: now,
          }, { session: mongoSession });
          continue;
        }
        const paymentId = `${settlementId}:payment:${line.userId}`;
        const payment: Payment = {
          id: paymentId,
          payerType: 'MEMBER',
          payerId: line.userId,
          payerName: line.userName,
          quarterId,
          quarterSettlementId: settlementId,
          direction: line.finalBalance > 0 ? 'RECEIVABLE' : 'PAYABLE',
          expectedAmount: Math.abs(line.finalBalance),
          paidAmount: 0,
          refundedAmount: 0,
          status: 'PENDING',
          reference: `QUARTER_SETTLEMENT:${quarter.id}`,
          dueAt,
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection<Payment>('payments').insertOne(payment, { session: mongoSession });
        line.paymentId = paymentId;
      }

      result = {
        id: settlementId,
        quarterId,
        version,
        status: 'POSTED',
        lines,
        totalObligation: lines.reduce((sum, line) => sum + line.actualCourtObligation, 0),
        totalQuarterFeesPaid: lines.reduce((sum, line) => sum + line.quarterFeePaid, 0),
        totalReceivable: lines.reduce((sum, line) => sum + Math.max(0, line.finalBalance), 0),
        totalPayable: lines.reduce((sum, line) => sum + Math.max(0, -line.finalBalance), 0),
        settledByUserId: user.id,
        settledByName: user.name,
        settledAt: now,
      };
      await db.collection<QuarterSettlement>('quarter_settlements').insertOne(
        { ...result, notes }, { session: mongoSession }
      );
      const quarterUpdate = await db.collection<Quarter>('quarters').updateOne(
        { id: quarter.id, version: quarter.version || 0, status: 'ACTIVE' },
        { $set: {
          status: 'SETTLED', currentSettlementId: settlementId, settlementVersion: version,
          settledAt: now, settledByUserId: user.id, version: (quarter.version || 0) + 1,
        } },
        { session: mongoSession }
      );
      if (quarterUpdate.modifiedCount !== 1) throw new QuarterSettlementError('Quý vừa được cập nhật', 409);
      for (const line of lines) {
        await db.collection<QuarterMember>('quarter_members').updateOne(
          { id: line.quarterMemberId },
          { $set: { refundAmount: Math.max(0, -line.finalBalance) } },
          { session: mongoSession }
        );
      }
      await db.collection('audit_logs').insertOne({
        id: `audit:${settlementId}`,
        entityType: 'QUARTER', entityId: quarter.id, action: 'SETTLE',
        oldData: { status: quarter.status, version: quarter.version || 0 },
        newData: { status: 'SETTLED', settlementId, version: (quarter.version || 0) + 1 },
        reason: notes, userId: user.id, userName: user.name, requestId, createdAt: now,
      }, { session: mongoSession });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await mongoSession.endSession();
  }
  if (!result) throw new QuarterSettlementError('Không thể quyết toán quý', 500);
  return result;
}

export async function changeQuarterSettlementState(
  quarterId: string,
  action: 'CLOSE' | 'REOPEN',
  user: AuthSessionUser,
  requestId: string,
  reason?: string
): Promise<Quarter> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGO_DB_DATABASE || 'badminton_db');
  const mongoSession = client.startSession();
  let result: Quarter | undefined;
  try {
    await mongoSession.withTransaction(async () => {
      const quarter = await db.collection<Quarter>('quarters').findOne({ id: quarterId }, { session: mongoSession });
      if (!quarter || !quarter.currentSettlementId) throw new QuarterSettlementError('Quý chưa được quyết toán', 409);
      const settlement = await db.collection<QuarterSettlement>('quarter_settlements').findOne(
        { id: quarter.currentSettlementId, status: 'POSTED' }, { session: mongoSession }
      );
      if (!settlement) throw new QuarterSettlementError('Không tìm thấy quyết toán quý hiện tại', 409);
      const payments = await db.collection<Payment>('payments').find(
        { quarterSettlementId: settlement.id }, { session: mongoSession }
      ).toArray();
      const now = new Date().toISOString();
      if (action === 'CLOSE') {
        if (quarter.status !== 'SETTLED') throw new QuarterSettlementError('Quý không ở trạng thái chờ đóng', 409);
        if (payments.some((payment) => paymentOutstanding(payment) > 0)) {
          throw new QuarterSettlementError('Còn công nợ chưa hoàn tất nên chưa thể đóng quý', 409);
        }
        result = { ...quarter, status: 'CLOSED', version: (quarter.version || 0) + 1 };
      } else {
        if (!reason?.trim()) throw new QuarterSettlementError('Bắt buộc nhập lý do mở lại');
        if (quarter.status !== 'SETTLED') throw new QuarterSettlementError('Chỉ mở lại quý đang chờ đóng', 409);
        for (const payment of payments) {
          await db.collection<Payment>('payments').updateOne(
            { id: payment.id, version: payment.version || 0 },
            { $set: { status: 'CANCELLED', cancelledAt: now, cancelledReason: reason.trim(), updatedAt: now }, $inc: { version: 1 } },
            { session: mongoSession }
          );
        }
        await db.collection<QuarterSettlement>('quarter_settlements').updateOne(
          { id: settlement.id, status: 'POSTED' },
          { $set: { status: 'REVERSED', reversedAt: now, reversalReason: reason.trim() } },
          { session: mongoSession }
        );
        result = {
          ...quarter, status: 'ACTIVE', version: (quarter.version || 0) + 1,
          currentSettlementId: undefined, settledAt: undefined, settledByUserId: undefined,
        };
      }
      const quarterUpdate = await db.collection<Quarter>('quarters').replaceOne(
        { id: quarter.id, version: quarter.version || 0 }, result, { session: mongoSession }
      );
      if (quarterUpdate.modifiedCount !== 1) throw new QuarterSettlementError('Quý vừa được cập nhật', 409);
      await db.collection('audit_logs').insertOne({
        id: `audit:quarter:${action.toLowerCase()}:${crypto.randomUUID()}`,
        entityType: 'QUARTER', entityId: quarter.id, action,
        oldData: { status: quarter.status, version: quarter.version || 0 },
        newData: { status: result.status, version: result.version },
        reason, userId: user.id, userName: user.name, requestId, createdAt: now,
      }, { session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }
  if (!result) throw new QuarterSettlementError('Không thể cập nhật trạng thái quý', 500);
  return result;
}
