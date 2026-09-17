import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { parseJsonBody, quarterConfigSchema, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';
import type { Quarter } from '@/lib/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;
  const quarter = await (await getDb()).collection<Quarter>('quarters').findOne({ id }, { projection: { _id: 0 } });
  if (!quarter) return NextResponse.json({ error: 'Không tìm thấy quý' }, { status: 404 });
  return NextResponse.json({ quarter });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER') return NextResponse.json({ error: 'Chỉ Owner được cấu hình quý' }, { status: 403 });
    const { id } = await params;
    const body = await parseJsonBody(req, quarterConfigSchema);
    const db = await getDb();
    const current = await db.collection<Quarter>('quarters').findOne({ id });
    if (!current) return NextResponse.json({ error: 'Không tìm thấy quý' }, { status: 404 });
    if (current.status !== 'PLANNING' && current.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Không thể đổi cấu hình sau khi quyết toán quý' }, { status: 409 });
    }
    const { version, ...config } = body;
    const nextVersion = version + 1;
    const updated = await db.collection<Quarter>('quarters').findOneAndUpdate(
      { id, version }, { $set: { ...config, version: nextVersion } }, { returnDocument: 'after' }
    );
    if (!updated) return NextResponse.json({ error: 'Quý vừa được người khác cập nhật' }, { status: 409 });
    await db.collection('audit_logs').insertOne({
      id: `audit:quarter:config:${crypto.randomUUID()}`,
      entityType: 'QUARTER', entityId: id, action: 'UPDATE_CONFIG',
      oldData: { version, config: current }, newData: { version: nextVersion, config },
      userId: user.id, userName: user.name,
      requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, quarter: updated });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi cấu hình quý' }, { status: 500 });
  }
}
