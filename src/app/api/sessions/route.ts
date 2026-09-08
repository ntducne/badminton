import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Session, SessionCourt } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const quarterId = searchParams.get('quarterId');

    const filter: any = {};
    if (quarterId) {
      filter.quarterId = quarterId;
    }

    const sessions = await db
      .collection<Session>('sessions')
      .find(filter)
      .sort({ sessionDate: -1, startTime: -1 })
      .toArray();

    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tải danh sách buổi đánh' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền tạo buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    const body = await req.json();

    const quarterId = body.quarterId || 'q-2026-1';
    const venueId = body.venueId || 'v-star';
    const venueName = body.venueName || 'Sân Cầu Lông Ngôi Sao';
    const sessionDate = body.sessionDate;
    const startTime = body.startTime || '18:00';
    const endTime = body.endTime || '20:00';
    const targetPlayers = Number(body.targetPlayers) || 8;
    const guestSurcharge = Number(body.guestSurcharge) || 10000;
    const hourlyRate = Number(body.hourlyRate) || 100000;
    const courtNumbers = body.courtNumbers || 'Sân 1';

    if (!sessionDate) {
      return NextResponse.json({ error: 'Vui lòng chọn ngày đánh' }, { status: 400 });
    }

    // Đếm số buổi hiện tại để sinh mã B-X
    const count = await db.collection('sessions').countDocuments({ quarterId });
    const sessionCode = `B-${count + 1}`;

    // Lấy danh sách thành viên cố định trong quý để đưa vào điểm danh mặc định
    const quarterMembers = await db.collection('quarter_members').find({ quarterId, isActive: true }).toArray();

    const participants = quarterMembers.map((qm: any) => ({
      id: `p-${Date.now()}-${qm.userId}`,
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
      id: `sc-${Date.now()}-${idx}`,
      sessionId: '',
      courtName: c.trim(),
      hours: 2,
      hourlyRate,
      totalCost: 2 * hourlyRate,
    }));

    const totalCourtFee = courts.reduce((sum, c) => sum + c.totalCost, 0);

    const newSession: Session = {
      id: `session-${Date.now()}`,
      quarterId,
      venueId,
      venueName,
      sessionCode,
      sessionDate,
      startTime,
      endTime,
      status: 'OPEN',
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
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tạo buổi đánh' }, { status: 500 });
  }
}
