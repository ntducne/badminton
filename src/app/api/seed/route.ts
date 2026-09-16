import { NextResponse } from 'next/server';
import { seedMongo } from '@/lib/seed-mongo';

function isHttpSeedEnabled() {
  return process.env.ALLOW_HTTP_SEED === 'true'
    && process.env.NODE_ENV !== 'production'
    && Boolean(process.env.SEED_TOKEN);
}

function hasValidSeedToken(req: Request) {
  return req.headers.get('x-seed-token') === process.env.SEED_TOKEN;
}

export async function GET(req: Request) {
  if (!isHttpSeedEnabled()) {
    return NextResponse.json({ error: 'HTTP seed đang bị tắt' }, { status: 404 });
  }
  if (!hasValidSeedToken(req)) {
    return NextResponse.json({ error: 'Seed token không hợp lệ' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  if (searchParams.get('confirm') === 'yes') {
    try {
      await seedMongo();
      return NextResponse.json({
        success: true,
        message: 'Khởi tạo dữ liệu mẫu thành công trên MongoDB!',
      });
    } catch (error: unknown) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Seed failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    message: 'Truy cập URL với ?confirm=yes hoặc gửi POST request để khởi tạo dữ liệu mẫu.',
  });
}

export async function POST(req: Request) {
  if (!isHttpSeedEnabled()) {
    return NextResponse.json({ error: 'HTTP seed đang bị tắt' }, { status: 404 });
  }
  if (!hasValidSeedToken(req)) {
    return NextResponse.json({ error: 'Seed token không hợp lệ' }, { status: 401 });
  }
  try {
    await seedMongo();
    return NextResponse.json({
      success: true,
      message: 'Khởi tạo dữ liệu mẫu thành công trên MongoDB!',
    });
  } catch (error: unknown) {
    console.error('Error seeding data:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to seed data' },
      { status: 500 }
    );
  }
}
