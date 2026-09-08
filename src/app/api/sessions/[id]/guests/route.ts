import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { calculateSessionFinances } from '@/lib/calculations';
import { Session, SessionParticipant } from '@/lib/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thêm người giao lưu' }, { status: 403 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }

    const { name, phone } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên người giao lưu' }, { status: 400 });
    }

    const newGuest: SessionParticipant = {
      id: `p-guest-${Date.now()}`,
      sessionId: id,
      userName: name.trim(),
      userPhone: phone ? phone.trim() : undefined,
      isGuest: true,
      attendanceStatus: 'ATTENDING',
      confirmedAt: new Date().toISOString(),
      confirmedBy: user.name,
      courtFeeShare: 0,
      shuttleFeeShare: 0,
      drinkFeeShare: 0,
      otherFeeShare: 0,
      guestSurcharge: session.guestSurcharge || 10000,
      totalCost: 0,
      totalAdvanced: 0,
      totalPaid: 0,
      debtAmount: 0,
      netSettlement: 0,
      paymentStatus: 'UNPAID',
    };

    session.participants.push(newGuest);

    const calc = calculateSessionFinances(session);
    session.participants = calc.participants;
    session.totalCourtFee = calc.totalCourtFee;
    session.totalShuttleFee = calc.totalShuttleFee;
    session.totalDrinkFee = calc.totalDrinkFee;
    session.totalOtherFee = calc.totalOtherFee;
    session.totalExpense = calc.totalExpense;
    session.totalGuestRevenue = calc.totalGuestRevenue;

    await db.collection('sessions').updateOne({ id }, { $set: session });

    return NextResponse.json({ success: true, guest: newGuest, calculation: calc });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi thêm khách giao lưu' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền xóa khách giao lưu' }, { status: 403 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get('participantId');
    if (!participantId) {
      return NextResponse.json({ error: 'Thiếu mã người giao lưu' }, { status: 400 });
    }

    session.participants = session.participants.filter((p) => p.id !== participantId);

    const calc = calculateSessionFinances(session);
    session.participants = calc.participants;
    session.totalCourtFee = calc.totalCourtFee;
    session.totalShuttleFee = calc.totalShuttleFee;
    session.totalDrinkFee = calc.totalDrinkFee;
    session.totalOtherFee = calc.totalOtherFee;
    session.totalExpense = calc.totalExpense;
    session.totalGuestRevenue = calc.totalGuestRevenue;

    await db.collection('sessions').updateOne({ id }, { $set: session });

    return NextResponse.json({ success: true, calculation: calc });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi xóa khách giao lưu' }, { status: 500 });
  }
}

