import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { Filter } from 'mongodb';
import { Session, SessionCourt, QuarterMember } from '@/lib/types';
import { createSessionSchema, parseJsonBody, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';
import { sanitizeSessionForUser } from '@/lib/data-access';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const quarterId = searchParams.get('quarterId');

    const filter: Filter<Session> = {};
    if (quarterId) {
      filter.quarterId = quarterId;
    }

    const sessions = await db
      .collection<Session>('sessions')
      .find(filter)
      .sort({ sessionDate: -1, startTime: -1 })
      .toArray();

    return NextResponse.json({ sessions: sessions.map((session) => sanitizeSessionForUser(session, user)) });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải danh sách buổi đánh' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền tạo buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    const body = await parseJsonBody(req, createSessionSchema);
    const quarterId = body.quarterId || 'q-2026-1';
    const venueId = body.venueId || 'v-star';
    const venueName = body.venueName || 'Sân Cầu Lông Ngôi Sao';
    const { sessionDate, startTime, endTime, targetPlayers, guestSurcharge, hourlyRate, courtNumbers } = body;

    const conflictingSession = await db.collection<Session>('sessions').findOne({
      venueId,
      sessionDate,
      status: { $ne: 'CANCELLED' },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });
    if (conflictingSession) {
      return NextResponse.json(
        { error: `Trùng lịch với buổi ${conflictingSession.sessionCode} tại cùng địa điểm` },
        { status: 409 }
      );
    }

    // Đếm số buổi hiện tại để sinh mã B-X
    const count = await db.collection('sessions').countDocuments({ quarterId });
    const sessionCode = `B-${count + 1}`;

    // Lấy danh sách thành viên cố định trong quý để đưa vào điểm danh mặc định
    const quarterMembers = await db.collection<QuarterMember>('quarter_members').find({ quarterId, isActive: true }).toArray();

    const participants = quarterMembers.map((qm) => ({
      id: `p-${crypto.randomUUID()}`,
      sessionId: '',
      userId: qm.userId,
      userName: qm.userName,
      userPhone: qm.userPhone,
      isGuest: false,
      attendanceStatus: 'ATTENDING' as const,
      courtFeeShare: 0,
      shuttleFeeShare: 0,
      drinkFeeShare: 0,
      otherFeeShare: 0,
      guestSurcharge: 0,
      totalCost: 0,
      totalAdvanced: 0,
      totalPaid: 0,
      debtAmount: 0,
      netSettlement: 0,
      paymentStatus: 'PAID' as const,
    }));

    const courts: SessionCourt[] = courtNumbers.split(',').map((c: string, idx: number) => ({
      id: `sc-${crypto.randomUUID()}-${idx}`,
      sessionId: '',
      courtName: c.trim(),
      hours: 2,
      hourlyRate,
      totalCost: 2 * hourlyRate,
    }));

    const totalCourtFee = courts.reduce((sum, c) => sum + c.totalCost, 0);

    const newSession: Session = {
      id: `session-${crypto.randomUUID()}`,
      quarterId,
      venueId,
      venueName,
      sessionCode,
      sessionDate,
      startTime,
      endTime,
      status: 'OPEN',
      version: 0,
      settlementVersion: 0,
      targetPlayers,
      guestSurcharge,
      totalCourtFee,
      totalShuttleFee: 0,
      totalDrinkFee: 0,
      totalOtherFee: 0,
      totalExpense: totalCourtFee,
      totalGuestRevenue: 0,
      isSettled: false,
      courts,
      participants,
      shuttleUsages: [],
      drinks: [],
      expenses: [],
      advances: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Update sessionId in children
    newSession.courts.forEach((c) => (c.sessionId = newSession.id));
    newSession.participants.forEach((p) => (p.sessionId = newSession.id));

    await db.collection('sessions').insertOne(newSession);

    return NextResponse.json({ success: true, session: newSession });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tạo buổi đánh' }, { status: 500 });
  }
}
