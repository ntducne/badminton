import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, signToken } from '@/lib/auth';
import { loginSchema, parseJsonBody, RequestValidationError, validationErrorResponse } from '@/lib/api-validation';

export async function POST(req: NextRequest) {
  try {
    const { phone, password } = await parseJsonBody(req, loginSchema);

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
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Đăng nhập thất bại' }, { status: 500 });
  }
}
