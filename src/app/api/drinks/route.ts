import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { DrinkItem } from '@/lib/types';

export async function GET() {
  try {
    const db = await getDb();
    const drinks = await db.collection<DrinkItem>('drink_items').find({ isActive: true }).toArray();
    return NextResponse.json({ drinks });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi tải danh mục nước' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thêm loại nước' }, { status: 403 });
    }

    const db = await getDb();
    const { name, unitPrice, isSharedPitcher } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên loại nước' }, { status: 400 });
    }

    const newDrink: DrinkItem = {
      id: `drink-${Date.now()}`,
      name: name.trim(),
      unitPrice: Number(unitPrice) || 10000,
      isSharedPitcher: Boolean(isSharedPitcher),
      isActive: true,
    };

    await db.collection('drink_items').insertOne(newDrink);

    return NextResponse.json({ success: true, drink: newDrink });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi thêm loại nước' }, { status: 500 });
  }
}

