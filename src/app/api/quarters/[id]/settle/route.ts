import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { parseJsonBody, quarterSettlementSchema, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';
import { changeQuarterSettlementState, previewQuarterSettlement, QuarterSettlementError, settleQuarter } from '@/lib/quarter-service';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const { id } = await params;
    const preview = await previewQuarterSettlement(id);
    if (user.role === 'MEMBER') {
      preview.lines = preview.lines.filter((line) => line.userId === user.id);
    }
    return NextResponse.json(preview);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi xem quyết toán quý' },
      { status: error instanceof QuarterSettlementError ? error.status : 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin/Owner được quyết toán quý' }, { status: 403 });
    }
    const { id } = await params;
    const body = await parseJsonBody(req, quarterSettlementSchema);
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    if (body.action === 'SETTLE') {
      const settlement = await settleQuarter(id, user, requestId, body.notes);
      return NextResponse.json({ success: true, settlement });
    }
    if (body.action === 'REOPEN' && user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Chỉ Owner được mở lại quyết toán quý' }, { status: 403 });
    }
    const quarter = await changeQuarterSettlementState(id, body.action, user, requestId, 'reason' in body ? body.reason : undefined);
    return NextResponse.json({ success: true, quarter });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi quyết toán quý' },
      { status: error instanceof QuarterSettlementError ? error.status : 500 }
    );
  }
}
