import { NextRequest, NextResponse } from 'next/server';
import type { Filter } from 'mongodb';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { paymentOutstanding } from '@/lib/finance-service';
import type { Payment } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const filter: Filter<Payment> = {};
    const quarterId = searchParams.get('quarterId');
    const sessionId = searchParams.get('sessionId');
    if (quarterId) filter.quarterId = quarterId;
    if (sessionId) filter.sessionId = sessionId;
    if (user.role === 'MEMBER') filter.payerId = user.id;

    const db = await getDb();
    const payments = await db.collection<Payment>('payments')
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({
      payments: payments.map((payment) => ({
        ...payment,
        outstandingAmount: paymentOutstanding(payment),
        isOverdue: Boolean(
          payment.dueAt
          && new Date(payment.dueAt).getTime() < Date.now()
          && paymentOutstanding(payment) > 0
        ),
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải công nợ' }, { status: 500 });
  }
}
