import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Quarter, Session, QuarterMember } from '@/lib/types';

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
    const members = await db.collection<QuarterMember>('quarter_members').find({ quarterId }).toArray();
    const sessions = await db.collection<Session>('sessions').find({ quarterId }).toArray();
    const treasuryLogs = await db.collection('treasury').find({ quarterId }).sort({ createdAt: -1 }).toArray();

    // 1. Tổng tiền thành viên đóng quý
    const totalMemberPaid = members.reduce((sum, m) => sum + (m.paidAmount || 0), 0);

    // 2. Tổng thu từ guest (bao gồm cả phụ thu)
    const totalGuestRevenue = sessions.reduce((sum, s) => sum + (s.totalGuestRevenue || 0), 0);

    // 3. Tổng chi phí các buổi
    const totalSessionsExpense = sessions.reduce((sum, s) => sum + (s.totalExpense || 0), 0);

    // 4. Tổng tiền các thành viên đã ứng cho nhóm
    let totalAdvancedByMembers = 0;
    for (const s of sessions) {
      for (const adv of s.advances || []) {
        totalAdvancedByMembers += adv.amount || 0;
      }
    }

    // 5. Số dư ước tính
    const startingBalance = quarter?.startingBalance || 0;
    const currentFundBalance = startingBalance + totalMemberPaid + totalGuestRevenue - totalSessionsExpense;

    return NextResponse.json({
      quarterName: quarter?.name || 'Quý 1/2026',
      startingBalance,
      totalMemberPaid,
      totalGuestRevenue,
      totalSessionsExpense,
      totalAdvancedByMembers,
      currentFundBalance,
      recentLogs: treasuryLogs,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải thông tin quỹ chung' }, { status: 500 });
  }
}
