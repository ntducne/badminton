import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { User, QuarterMember, Session } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const quarterId = searchParams.get('quarterId') || 'q-2026-1';

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

    // Lấy thông tin tài khoản user
    const users = await db
      .collection<User>('users')
      .find({ isActive: true }, { projection: { password: 0 } })
      .toArray();

    const userMap = new Map(users.map((u) => [u.id, u]));

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

          totalSessionDebt += participant.debtAmount || 0;
          totalAdvanced += participant.totalAdvanced || 0;
        }
      }

      // Hoàn tiền sân cho các buổi nghỉ hợp lệ (deadline 6h)
      // Giả sử mỗi buổi tiền sân chia đều ~25k
      const estimatedRefundPerValidSession = 25000;
      const estimatedQuarterRefund = absentValidCount * estimatedRefundPerValidSession;

      const isMe = currentUser.id === qm.userId;
      const isAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

      return {
        id: qm.id,
        userId: qm.userId,
        name: qm.userName,
        phone: qm.userPhone,
        role: user?.role || 'MEMBER',
        bankAccount: user?.bankAccount,
        bankName: user?.bankName,
        attendedCount,
        absentValidCount,
        absentLateCount,
        fixedCourtFee: qm.fixedCourtFee,
        paidCourtFee: qm.paidAmount,
        estimatedQuarterRefund,
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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tải thống kê thành viên' }, { status: 500 });
  }
}

