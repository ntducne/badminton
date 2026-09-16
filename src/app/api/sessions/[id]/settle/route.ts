import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { reopenSession, settleSession, SettlementError } from '@/lib/settlement-service';
import { parseJsonBody, RequestValidationError, settleSchema, validationErrorResponse } from '@/lib/api-validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Chỉ Admin/Owner mới có quyền quyết toán hoặc mở lại buổi đánh' },
        { status: 403 }
      );
    }

    const { action, notes } = await parseJsonBody(req, settleSchema);

    if (action === 'SETTLE') {
      const result = await settleSession(id, user, notes);
      return NextResponse.json({
        success: true,
        message: result.idempotent
          ? `Buổi ${result.session.sessionCode} đã được quyết toán trước đó.`
          : `Buổi ${result.session.sessionCode} đã được quyết toán thành công!`,
        ...result,
      });
    }

    if (action === 'REOPEN') {
      const session = await reopenSession(id, user, notes);
      return NextResponse.json({
        success: true,
        message: `Đã mở lại buổi ${session.sessionCode}; kho và quỹ đã được đảo giao dịch.`,
        session,
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    const status = error instanceof SettlementError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi xử lý quyết toán' },
      { status }
    );
  }
}
