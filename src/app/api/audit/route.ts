import { NextRequest, NextResponse } from 'next/server';
import type { Filter } from 'mongodb';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { AuditLog } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Chỉ Owner được xem audit' }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  const filter: Filter<AuditLog> = {};
  if (params.get('entityType')) filter.entityType = params.get('entityType')!;
  if (params.get('entityId')) filter.entityId = params.get('entityId')!;
  const logs = await (await getDb()).collection<AuditLog>('audit_logs')
    .find(filter, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
  return NextResponse.json({ logs });
}
