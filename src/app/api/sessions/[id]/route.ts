import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { calculateSessionFinances } from '@/lib/calculations';
import { Session } from '@/lib/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const session = await db.collection<Session>('sessions').findOne({ id });

    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }

    // Luôn tính toán lại số liệu tài chính thời gian thực
    const calculation = calculateSessionFinances(session);

    return NextResponse.json({ session, calculation });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tải buổi đánh' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Không có quyền cập nhật buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    const existing = await db.collection<Session>('sessions').findOne({ id });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy buổi đánh' }, { status: 404 });
    }

    const body = await req.json();

    // Cập nhật các trường được phép
    const updatedData: Partial<Session> = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // Nếu buổi đã SETTLED mà sửa, bắt buộc ghi vết AuditLog
    if (existing.isSettled) {
      await db.collection('audit_logs').insertOne({
        id: `audit-${Date.now()}`,
        entityType: 'SESSION',
        entityId: id,
        action: 'UPDATE_AFTER_SETTLED',
        oldData: JSON.stringify(existing),
        newData: JSON.stringify(updatedData),
        userId: user.id,
        userName: user.name,
        createdAt: new Date().toISOString(),
      });
    }

    // Tự động tính toán lại tài chính trước khi lưu
    const mergedSession = { ...existing, ...updatedData } as Session;
    const calc = calculateSessionFinances(mergedSession);

    mergedSession.totalCourtFee = calc.totalCourtFee;
    mergedSession.totalShuttleFee = calc.totalShuttleFee;
    mergedSession.totalDrinkFee = calc.totalDrinkFee;
    mergedSession.totalOtherFee = calc.totalOtherFee;
    mergedSession.totalExpense = calc.totalExpense;
    mergedSession.totalGuestRevenue = calc.totalGuestRevenue;
    mergedSession.participants = calc.participants;

    await db.collection('sessions').updateOne({ id }, { $set: mergedSession });

    return NextResponse.json({ success: true, session: mergedSession, calculation: calc });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi cập nhật buổi đánh' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Chỉ Chủ nhóm (Owner) mới có quyền xóa buổi đánh' }, { status: 403 });
    }

    const db = await getDb();
    await db.collection('sessions').deleteOne({ id });

    return NextResponse.json({ success: true, message: 'Đã xóa buổi đánh' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi xóa buổi đánh' }, { status: 500 });
  }
}

