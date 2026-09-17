import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { calculateSessionFinances } from '@/lib/calculations';
import { Session } from '@/lib/types';
import { isSessionFinanciallyLocked, sessionVersionFilter } from '@/lib/session-state';
import { parseJsonBody, RequestValidationError, updateSessionSchema, validationErrorResponse } from '@/lib/api-validation';
import { sanitizeSessionForUser } from '@/lib/data-access';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });

    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }

    const calculation = calculateSessionFinances(session);
    const visibleSession = sanitizeSessionForUser(session, user);
    const visibleCalculation = {
      ...calculation,
      participants: sanitizeSessionForUser({ ...session, participants: calculation.participants }, user).participants,
    };
    return NextResponse.json({ session: visibleSession, calculation: visibleCalculation });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải buổi đánh' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền cập nhật buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    const existing = await db.collection<Session>('sessions').findOne({ id });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }
    if (isSessionFinanciallyLocked(existing)) {
      return NextResponse.json(
        { error: 'Buổi đã khóa hoặc quyết toán; hãy mở lại trước khi chỉnh sửa' },
        { status: 409 }
      );
    }

    const updatedData: Partial<Session> = await parseJsonBody(req, updateSessionSchema);
    updatedData.updatedAt = new Date().toISOString();

    const nextVenueId = updatedData.venueId || existing.venueId;
    const nextDate = updatedData.sessionDate || existing.sessionDate;
    const nextStart = updatedData.startTime || existing.startTime;
    const nextEnd = updatedData.endTime || existing.endTime;
    if (nextEnd <= nextStart) {
      return NextResponse.json({ error: 'Giờ kết thúc phải sau giờ bắt đầu' }, { status: 400 });
    }
    const conflictingSession = await db.collection<Session>('sessions').findOne({
      id: { $ne: id }, venueId: nextVenueId, sessionDate: nextDate,
      status: { $ne: 'CANCELLED' }, startTime: { $lt: nextEnd }, endTime: { $gt: nextStart },
    });
    if (conflictingSession) {
      return NextResponse.json(
        { error: `Trùng lịch với buổi ${conflictingSession.sessionCode} tại cùng địa điểm` },
        { status: 409 }
      );
    }

    // Tự động tính toán lại tài chính trước khi lưu
    const mergedSession = { ...existing, ...updatedData } as Session;
    const calc = calculateSessionFinances(mergedSession);

    mergedSession.totalCourtFee = calc.totalCourtFee;
    mergedSession.totalShuttleFee = calc.totalShuttleFee;
    mergedSession.totalDrinkFee = calc.totalDrinkFee;
    mergedSession.totalOtherFee = calc.totalOtherFee;
    mergedSession.totalExpense = calc.totalExpense;
    mergedSession.totalGuestRevenue = calc.totalGuestRevenue;
    mergedSession.participants = calc.participants;
    mergedSession.version = (existing.version || 0) + 1;

    const updateResult = await db.collection<Session>('sessions').replaceOne(
      sessionVersionFilter(existing), mergedSession
    );
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json({ error: 'Buổi vừa được cập nhật, vui lòng tải lại' }, { status: 409 });
    }
    await db.collection('audit_logs').insertOne({
      id: `audit:session:update:${crypto.randomUUID()}`,
      entityType: 'SESSION', entityId: id, action: 'UPDATE',
      oldData: { version: existing.version || 0 },
      newData: { version: mergedSession.version, fields: Object.keys(updatedData) },
      userId: user.id, userName: user.name,
      requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, session: mergedSession, calculation: calc });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi cập nhật buổi đánh' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Chỉ Chủ nhóm (Owner) mới có quyền xóa buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }
    const [settlementCount, treasuryCount, movementCount] = await Promise.all([
      db.collection('session_settlements').countDocuments({ sessionId: id }),
      db.collection('treasury').countDocuments({ sessionId: id }),
      db.collection('inventory_movements').countDocuments({ sessionId: id }),
    ]);
    if (session.isSettled || settlementCount + treasuryCount + movementCount > 0) {
      return NextResponse.json(
        { error: 'Không thể xóa buổi đã có giao dịch tài chính; hãy hủy buổi để giữ lịch sử' },
        { status: 409 }
      );
    }
    await db.collection<Session>('sessions').deleteOne(sessionVersionFilter(session));

    return NextResponse.json({ success: true, message: 'Đã xóa buổi đánh' });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi xóa buổi đánh' }, { status: 500 });
  }
}
