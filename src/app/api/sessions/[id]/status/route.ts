import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { SettlementError, transitionSessionState } from '@/lib/settlement-service';
import { parseJsonBody, RequestValidationError, statusTransitionSchema, validationErrorResponse } from '@/lib/api-validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin/Owner mới có quyền đổi trạng thái buổi' }, { status: 403 });
    }

    const { status, reason } = await parseJsonBody(req, statusTransitionSchema);

    const session = await transitionSessionState(
      id,
      status,
      user,
      reason
    );
    return NextResponse.json({ success: true, session });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    const status = error instanceof SettlementError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không thể đổi trạng thái buổi' },
      { status }
    );
  }
}
