import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ShuttlecockBatch } from '@/lib/types';

export async function GET() {
  try {
    const db = await getDb();
    const batches = await db
      .collection<ShuttlecockBatch>('shuttle_batches')
      .find({})
      .sort({ purchaseDate: -1 })
      .toArray();

    // Tính tổng tồn kho quả cầu
    const totalRemaining = batches.reduce((sum, b) => sum + (b.remainingBalls || 0), 0);

    return NextResponse.json({ batches, totalRemaining });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tải tồn kho cầu' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền nhập kho cầu' }, { status: 403 });
    }

    const db = await getDb();
    const body = await req.json();

    const brandName = body.brandName || 'Yonex AS-50';
    const tubeQuantity = Number(body.tubeQuantity) || 1;
    const ballsPerTube = Number(body.ballsPerTube) || 12;
    const pricePerTube = Number(body.pricePerTube) || 310000;
    const payerUserId = body.payerUserId || user.id;
    const payerName = body.payerName || user.name;
    const isPaidFromTreasury = Boolean(body.isPaidFromTreasury);
    const notes = body.notes || '';

    const totalBalls = tubeQuantity * ballsPerTube;
    const pricePerBall = Math.ceil(pricePerTube / ballsPerTube);

    const newBatch: ShuttlecockBatch = {
      id: `batch-${Date.now()}`,
      brandName,
      batchCode: `BATCH-${Date.now().toString().slice(-6)}`,
      tubeQuantity,
      ballsPerTube,
      totalBalls,
      remainingBalls: totalBalls,
      pricePerTube,
      pricePerBall,
      purchaseDate: new Date().toISOString().slice(0, 10),
      payerUserId,
      payerName,
      isPaidFromTreasury,
      notes,
    };

    await db.collection('shuttle_batches').insertOne(newBatch);

    return NextResponse.json({ success: true, batch: newBatch });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi nhập kho cầu' }, { status: 500 });
  }
}

