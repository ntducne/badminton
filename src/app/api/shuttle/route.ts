import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { InventoryMovement, ShuttlecockBatch } from '@/lib/types';
import { adjustShuttleStock, InventoryError, purchaseShuttleBatch } from '@/lib/inventory-service';
import { inventoryActionSchema, parseJsonBody, RequestValidationError, shuttleBatchSchema, validationErrorResponse } from '@/lib/api-validation';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const db = await getDb();
    const batches = await db
      .collection<ShuttlecockBatch>('shuttle_batches')
      .find({})
      .sort({ purchaseDate: -1 })
      .toArray();

    // Tính tổng tồn kho quả cầu
    const totalRemaining = batches.reduce((sum, b) => sum + (b.remainingBalls || 0), 0);
    const movements = await db.collection<InventoryMovement>('inventory_movements')
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    const movementStock = movements.reduce((sum, movement) => sum + movement.quantity, 0);

    return NextResponse.json({
      batches,
      totalRemaining,
      movements: movements.slice(0, 200),
      movementStock,
      isReconciled: movementStock === totalRemaining,
      lowStock: totalRemaining < Number(process.env.LOW_STOCK_THRESHOLD || 12),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải tồn kho cầu' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền nhập kho cầu' }, { status: 403 });
    }

    const body = await parseJsonBody(req, shuttleBatchSchema);
    const batch = await purchaseShuttleBatch(body, user, req.headers.get('x-request-id') || crypto.randomUUID());
    return NextResponse.json({ success: true, batch });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi nhập kho cầu' },
      { status: error instanceof InventoryError ? error.status : 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền điều chỉnh kho' }, { status: 403 });
    }
    const body = await parseJsonBody(req, inventoryActionSchema);
    const batch = await adjustShuttleStock(body, user, req.headers.get('x-request-id') || crypto.randomUUID());
    return NextResponse.json({ success: true, batch });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi điều chỉnh kho cầu' },
      { status: error instanceof InventoryError ? error.status : 500 }
    );
  }
}
