import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { createAdjustment, FinanceError, paymentOutstanding, reverseTreasuryEntry } from '@/lib/finance-service';
import { parseJsonBody, RequestValidationError, treasuryActionSchema, validationErrorResponse } from '@/lib/api-validation';
import type { Payment, Quarter, TreasuryEntry, TreasuryEntryType } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const requestedQuarterId = searchParams.get('quarterId');
    const activeQuarter = requestedQuarterId
      ? null
      : await db.collection<Quarter>('quarters').findOne({ status: 'ACTIVE' });
    const quarterId = requestedQuarterId || activeQuarter?.id || 'q-2026-1';

    const quarter = activeQuarter || await db.collection<Quarter>('quarters').findOne({ id: quarterId });
    const [entries, payments] = await Promise.all([
      db.collection<TreasuryEntry>('treasury')
        .find({ quarterId, status: 'POSTED' }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray(),
      db.collection<Payment>('payments')
        .find({ quarterId, status: { $nin: ['CANCELLED', 'REFUNDED'] } }, { projection: { _id: 0 } })
        .toArray(),
    ]);

    const incomeByType: Partial<Record<TreasuryEntryType, number>> = {};
    const expenseByType: Partial<Record<TreasuryEntryType, number>> = {};
    let totalIncome = 0;
    let totalExpense = 0;
    for (const entry of entries) {
      const target = entry.direction === 'IN' ? incomeByType : expenseByType;
      target[entry.type] = (target[entry.type] || 0) + entry.amount;
      if (entry.direction === 'IN') totalIncome += entry.amount;
      else totalExpense += entry.amount;
    }

    const totalReceivable = payments
      .filter((payment) => payment.direction === 'RECEIVABLE')
      .reduce((sum, payment) => sum + paymentOutstanding(payment), 0);
    const totalPayable = payments
      .filter((payment) => payment.direction === 'PAYABLE')
      .reduce((sum, payment) => sum + paymentOutstanding(payment), 0);
    const startingBalance = quarter?.startingBalance || 0;

    return NextResponse.json({
      quarterName: quarter?.name || 'Quý hiện tại',
      startingBalance,
      totalMemberPaid: incomeByType.QUARTER_FEE || 0,
      totalGuestRevenue: incomeByType.GUEST_PAYMENT || 0,
      totalSessionsExpense: totalExpense,
      totalAdvancedByMembers: totalPayable,
      currentFundBalance: startingBalance + totalIncome - totalExpense,
      totalIncome,
      totalExpense,
      totalReceivable,
      totalPayable,
      incomeByType,
      expenseByType,
      recentLogs: entries.slice(0, 100),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải thông tin quỹ chung' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin/Owner được điều chỉnh sổ quỹ' }, { status: 403 });
    }
    const body = await parseJsonBody(req, treasuryActionSchema);
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const entry = body.action === 'ADJUSTMENT'
      ? await createAdjustment(body.quarterId, body.amount, body.direction, body.description, user, requestId)
      : await reverseTreasuryEntry(body.entryId, body.description, user, requestId);
    return NextResponse.json({ success: true, entry });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi cập nhật sổ quỹ' },
      { status: error instanceof FinanceError ? error.status : 500 }
    );
  }
}
