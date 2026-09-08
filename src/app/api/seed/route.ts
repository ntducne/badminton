import { NextResponse } from 'next/server';
import { seedMongo } from '@/lib/seed-mongo';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('confirm') === 'yes') {
    try {
      await seedMongo();
      return NextResponse.json({
        success: true,
        message: 'Khởi tạo dữ liệu mẫu thành công trên MongoDB!',
      });
    } catch (error: any) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Seed failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    message: 'Truy cập URL với ?confirm=yes hoặc gửi POST request để khởi tạo dữ liệu mẫu.',
  });
}

export async function POST() {
  try {
    await seedMongo();
    return NextResponse.json({
      success: true,
      message: 'Khởi tạo dữ liệu mẫu thành công trên MongoDB!',
    });
  } catch (error: any) {
    console.error('Error seeding data:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to seed data' },
      { status: 500 }
    );
  }
}
