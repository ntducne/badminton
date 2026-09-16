import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkIsBeforeDeadline, calculateSessionFinances } from '@/lib/calculations';
import { Session, AttendanceStatus } from '@/lib/types';
import { isSessionMutable, sessionVersionFilter } from '@/lib/session-state';
import { attendanceSchema, parseJsonBody, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Vui lòng đăng nhập để điểm danh' }, { status: 401 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }
    if (!isSessionMutable(session)) {
      return NextResponse.json({ error: 'Buổi đã khóa hoặc quyết toán, không thể sửa điểm danh' }, { status: 409 });
    }

    const { participantId, status } = await parseJsonBody(req, attendanceSchema);

    // Tìm người tham gia
    const participantIndex = session.participants.findIndex(
      (p) => p.id === participantId || (p.userId === user.id && !participantId)
    );

    if (participantIndex === -1) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin thành viên trong buổi' }, { status: 404 });
    }

    const targetParticipant = session.participants[participantIndex];

    // Quyền: Member chỉ được tự sửa của mình; Admin/Owner sửa được của bất kỳ ai
    if (user.role === 'MEMBER' && targetParticipant.userId !== user.id) {
      return NextResponse.json({ error: 'Bạn chỉ có thể cập nhật điểm danh của chính mình' }, { status: 403 });
    }

    let finalStatus: AttendanceStatus = 'ATTENDING';

    if (status === 'ABSENT') {
      const isBeforeDeadline = checkIsBeforeDeadline(session.sessionDate, session.startTime);
      if (isBeforeDeadline || user.role === 'OWNER' || user.role === 'ADMIN') {
        // Báo trước 6 tiếng hoặc Admin override
        finalStatus = 'ABSENT_VALID';
      } else {
        // Báo muộn < 6 tiếng
        finalStatus = 'ABSENT_LATE';
      }
    } else {
      finalStatus = 'ATTENDING';
    }

    targetParticipant.attendanceStatus = finalStatus;
    targetParticipant.confirmedAt = new Date().toISOString();
    targetParticipant.confirmedBy = user.name;

    // Tính toán lại tài chính
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

    return NextResponse.json({
      success: true,
      participant: targetParticipant,
      calculation: calc,
      message:
        finalStatus === 'ABSENT_VALID'
          ? 'Đã báo nghỉ hợp lệ (trước deadline 6 tiếng, được trừ tiền sân cuối quý)'
          : finalStatus === 'ABSENT_LATE'
          ? 'Báo nghỉ muộn sau deadline 6 tiếng (không được hoàn tiền sân cố định)'
          : 'Đã xác nhận tham gia buổi đánh',
    });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi cập nhật điểm danh' }, { status: 500 });
  }
}
