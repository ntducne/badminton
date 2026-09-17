import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { applyPaymentAction, FinanceError } from '@/lib/finance-service';
import { parseJsonBody, paymentActionSchema, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin/Owner được xác nhận hoặc hoàn tiền' }, { status: 403 });
    }
    const body = await parseJsonBody(req, paymentActionSchema);
    const payment = await applyPaymentAction(
      id,
      body.action,
      body.amount,
      body.method,
      body.reference,
      user,
      req.headers.get('x-request-id') || crypto.randomUUID()
    );
    return NextResponse.json({ success: true, payment });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi cập nhật thanh toán' },
      { status: error instanceof FinanceError ? error.status : 500 }
    );
  }
}
