import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { phone, password } = await req.json();

    if (!phone || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập số điện thoại và mật khẩu' }, { status: 400 });
    }

    const user = await authenticateUser(phone.trim(), password);
    if (!user) {
      return NextResponse.json({ error: 'Số điện thoại hoặc mật khẩu không chính xác' }, { status: 401 });
    }

    const token = signToken({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      email: user.email,
      avatarUrl: user.avatarUrl,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        email: user.email,
      },
    });

    res.cookies.set('badminton_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return res;
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Đăng nhập thất bại' }, { status: 500 });
  }
}

