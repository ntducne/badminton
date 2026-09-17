import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { paymentOutstanding } from '@/lib/finance-service';
import { calculateQuarterSettlement } from '@/lib/quarter-service';
import { User, Quarter, QuarterMember, Session, Payment } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
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

    // Lấy danh sách thành viên cố định trong quý
    const quarterMembers = await db
      .collection<QuarterMember>('quarter_members')
      .find({ quarterId, isActive: true })
      .toArray();

    // Lấy tất cả các buổi đánh trong quý để tổng hợp công nợ
    const sessions = await db
      .collection<Session>('sessions')
      .find({ quarterId })
      .toArray();
    const payments = await db.collection<Payment>('payments')
      .find({ quarterId, status: { $nin: ['CANCELLED', 'REFUNDED'] } })
      .toArray();

    // Lấy thông tin tài khoản user
    const users = await db
      .collection<User>('users')
      .find({ isActive: true }, { projection: { password: 0 } })
      .toArray();

    const userMap = new Map(users.map((u) => [u.id, u]));
    const quarterLines = quarter
      ? calculateQuarterSettlement(quarter, quarterMembers, sessions)
      : [];
    const quarterLineMap = new Map(quarterLines.map((line) => [line.userId, line]));

    // Thống kê từng người:
    // - Số buổi đi
    // - Số buổi nghỉ hợp lệ
    // - Số buổi nghỉ muộn
    // - Tổng nợ buổi
    // - Tổng tiền đã ứng hộ nhóm
    // - Tiền sân quý đã đóng
    const membersReport = quarterMembers.map((qm) => {
      const user = userMap.get(qm.userId);
      let attendedCount = 0;
      let absentValidCount = 0;
      let absentLateCount = 0;
      let totalSessionDebt = 0;
      let totalAdvanced = 0;

      for (const s of sessions) {
        const participant = s.participants.find((p) => p.userId === qm.userId);
        if (participant) {
          if (participant.attendanceStatus === 'ATTENDING') attendedCount++;
          if (participant.attendanceStatus === 'ABSENT_VALID') absentValidCount++;
          if (participant.attendanceStatus === 'ABSENT_LATE') absentLateCount++;

        }
      }
      for (const payment of payments) {
        if (payment.payerId !== qm.userId) continue;
        if (payment.direction === 'RECEIVABLE') totalSessionDebt += paymentOutstanding(payment);
        else totalAdvanced += paymentOutstanding(payment);
      }

      const quarterLine = quarterLineMap.get(qm.userId);
      const estimatedQuarterRefund = Math.max(0, -(quarterLine?.finalBalance || 0));

      const isMe = currentUser.id === qm.userId;
      const isAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

      return {
        id: qm.id,
        userId: qm.userId,
        name: qm.userName,
        phone: qm.userPhone,
        role: user?.role || 'MEMBER',
        bankAccount: isMe || isAdmin ? user?.bankAccount : undefined,
        bankName: isMe || isAdmin ? user?.bankName : undefined,
        attendedCount,
        absentValidCount,
        absentLateCount,
        fixedCourtFee: qm.fixedCourtFee,
        paidCourtFee: qm.paidAmount,
        estimatedQuarterRefund,
        actualQuarterObligation: quarterLine?.actualCourtObligation || 0,
        quarterBalance: quarterLine?.finalBalance || 0,
        // Bảo mật: Thành viên chỉ nhìn thấy nợ của chính mình; Admin nhìn thấy tất cả
        totalSessionDebt: isMe || isAdmin ? totalSessionDebt : null,
        totalAdvanced: isMe || isAdmin ? totalAdvanced : null,
        netDebt: isMe || isAdmin ? totalSessionDebt - totalAdvanced : null,
        isMe,
      };
    });

    return NextResponse.json({
      members: membersReport,
      totalCount: quarterMembers.length,
      currentUserId: currentUser.id,
      currentUserRole: currentUser.role,
      quarterName: quarter?.name,
      quarterId,
      quarterStatus: quarter?.status,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải thống kê thành viên' }, { status: 500 });
  }
}
