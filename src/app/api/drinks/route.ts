import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { DrinkItem } from '@/lib/types';
import { drinkSchema, parseJsonBody, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const db = await getDb();
    const drinks = await db.collection<DrinkItem>('drink_items').find({ isActive: true }).toArray();
    return NextResponse.json({ drinks });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải danh mục nước' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền thêm loại nước' }, { status: 403 });
    }

    const db = await getDb();
    const { name, unitPrice, isSharedPitcher } = await parseJsonBody(req, drinkSchema);

    const newDrink: DrinkItem = {
      id: `drink-${crypto.randomUUID()}`,
      name,
      unitPrice,
      isSharedPitcher,
      isActive: true,
    };

    await db.collection('drink_items').insertOne(newDrink);

    return NextResponse.json({ success: true, drink: newDrink });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi thêm loại nước' }, { status: 500 });
  }
}
