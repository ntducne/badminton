import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { calculateSessionFinances } from '@/lib/calculations';
import { Session } from '@/lib/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Chỉ Admin/Owner mới có quyền quyết toán hoặc mở lại buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }

    const { action, notes } = await req.json(); // action: 'SETTLE' | 'REOPEN'

    if (action === 'SETTLE') {
      // 1. Kiểm tra validation trước quyết toán
      const calc = calculateSessionFinances(session);
      if (calc.activeCount === 0) {
        return NextResponse.json({ error: 'Chưa có người chơi nào được điểm danh tham gia' }, { status: 400 });
      }

      // 2. Trừ tồn kho cầu nếu chưa trừ
      if (!session.isSettled) {
        for (const usage of session.shuttleUsages) {
          if (usage.batchId && usage.ballsUsed > 0) {
            await db.collection('shuttle_batches').updateOne(
              { id: usage.batchId },
              { $inc: { remainingBalls: -usage.ballsUsed } }
            );
          }
        }
      }

      // 3. Cập nhật trạng thái session thành SETTLED
      session.isSettled = true;
      session.status = 'SETTLED';
      session.settledAt = new Date().toISOString();
      session.settledByUserId = user.id;
      session.settledByName = user.name;
      session.settlementNotes = notes || session.settlementNotes;
      session.participants = calc.participants;
      session.totalCourtFee = calc.totalCourtFee;
      session.totalShuttleFee = calc.totalShuttleFee;
      session.totalDrinkFee = calc.totalDrinkFee;
      session.totalOtherFee = calc.totalOtherFee;
      session.totalExpense = calc.totalExpense;
      session.totalGuestRevenue = calc.totalGuestRevenue;

      await db.collection('sessions').updateOne({ id }, { $set: session });

      // 4. Ghi sổ quỹ nếu có phụ thu guest tăng quỹ
      if (calc.existingGuests > 0 && session.guestSurcharge > 0) {
        const totalSurcharge = calc.existingGuests * session.guestSurcharge;
        await db.collection('treasury').insertOne({
          id: `tr-${Date.now()}`,
          quarterId: session.quarterId,
          sessionId: session.id,
          amount: totalSurcharge,
          type: 'GUEST_SURCHARGE',
          description: `Phụ thu ${calc.existingGuests} khách giao lưu tại buổi ${session.sessionCode}`,
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: new Date().toISOString(),
        });
      }

      // 5. Ghi Audit Log
      await db.collection('audit_logs').insertOne({
        id: `audit-${Date.now()}`,
        entityType: 'SESSION',
        entityId: id,
        action: 'SETTLE',
        newData: JSON.stringify({ settledBy: user.name, notes }),
        userId: user.id,
        userName: user.name,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Buổi ${session.sessionCode} đã được quyết toán thành công!`,
        session,
        calculation: calc,
      });
    } else if (action === 'REOPEN') {
      // Mở lại buổi sau khi đã quyết toán
      const previousState = { ...session };
      session.isSettled = false;
      session.status = 'OPEN';
      session.reopenedAt = new Date().toISOString();
      session.reopenedByUserId = user.id;

      await db.collection('sessions').updateOne({ id }, { $set: session });

      // Ghi Audit Log bắt buộc khi reopen
      await db.collection('audit_logs').insertOne({
        id: `audit-${Date.now()}`,
        entityType: 'SESSION',
        entityId: id,
        action: 'REOPEN',
        oldData: JSON.stringify(previousState),
        newData: JSON.stringify({ reopenedBy: user.name, reason: notes }),
        userId: user.id,
        userName: user.name,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Đã mở lại buổi ${session.sessionCode} để chỉnh sửa. Lịch sử đã được lưu lại.`,
        session,
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi xử lý quyết toán' }, { status: 500 });
  }
}

