import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { calculateSessionFinances } from '@/lib/calculations';
import { Session, SessionParticipant } from '@/lib/types';
import { isSessionMutable, sessionVersionFilter } from '@/lib/session-state';
import { guestSchema, parseJsonBody, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thêm người giao lưu' }, { status: 403 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }
    if (!isSessionMutable(session)) {
      return NextResponse.json({ error: 'Buổi đã khóa hoặc quyết toán, không thể thêm guest' }, { status: 409 });
    }

    const { name, phone } = await parseJsonBody(req, guestSchema);
    const duplicateGuest = session.participants.some((participant) =>
      participant.isGuest
      && (participant.userName.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')
        || Boolean(phone && participant.userPhone === phone))
    );
    if (duplicateGuest) {
      return NextResponse.json({ error: 'Guest đã tồn tại trong buổi đánh' }, { status: 409 });
    }

    const newGuest: SessionParticipant = {
      id: `p-guest-${crypto.randomUUID()}`,
      sessionId: id,
      userName: name,
      userPhone: phone || undefined,
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

    const previousVersion = session.version;
    session.version = (session.version || 0) + 1;
    session.updatedAt = new Date().toISOString();
    const updateResult = await db.collection<Session>('sessions').replaceOne(
      sessionVersionFilter({ ...session, version: previousVersion }), session
    );
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json({ error: 'Buổi vừa được cập nhật, vui lòng tải lại' }, { status: 409 });
    }

    return NextResponse.json({ success: true, guest: newGuest, calculation: calc });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi thêm khách giao lưu' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền xóa khách giao lưu' }, { status: 403 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }
    if (!isSessionMutable(session)) {
      return NextResponse.json({ error: 'Buổi đã khóa hoặc quyết toán, không thể xóa guest' }, { status: 409 });
    }

    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get('participantId');
    if (!participantId) {
      return NextResponse.json({ error: 'Thiếu mã người giao lưu' }, { status: 400 });
    }

    const guest = session.participants.find((p) => p.id === participantId && p.isGuest);
    if (!guest) {
      return NextResponse.json({ error: 'Không tìm thấy khách giao lưu' }, { status: 404 });
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

    const previousVersion = session.version;
    session.version = (session.version || 0) + 1;
    session.updatedAt = new Date().toISOString();
    const updateResult = await db.collection<Session>('sessions').replaceOne(
      sessionVersionFilter({ ...session, version: previousVersion }), session
    );
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json({ error: 'Buổi vừa được cập nhật, vui lòng tải lại' }, { status: 409 });
    }

    return NextResponse.json({ success: true, calculation: calc });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi xóa khách giao lưu' }, { status: 500 });
  }
}
