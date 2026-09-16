import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getCurrentUser } from '@/lib/auth';
import { RequestValidationError, validationErrorResponse, vietQrQuerySchema } from '@/lib/api-validation';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const parsed = vietQrQuerySchema.safeParse({
      amount: searchParams.get('amount'),
      description: searchParams.get('description') || undefined,
    });
    if (!parsed.success) throw new RequestValidationError(parsed.error.issues);
    const { amount, description } = parsed.data;
    const bankId = process.env.VIETQR_BANK_ID;
    const accountNo = process.env.VIETQR_ACCOUNT_NO;
    const accountName = process.env.VIETQR_ACCOUNT_NAME;
    if (!bankId || !accountNo || !accountName) {
      return NextResponse.json({ error: 'VietQR chưa được cấu hình trên server' }, { status: 503 });
    }

    // Link ảnh chuẩn VietQR của cổng thanh toán quốc gia
    const vietQrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

    // Tạo thêm QR code fallback dạng data URL
    const qrDataUrl = await QRCode.toDataURL(vietQrUrl, {
      width: 320,
      margin: 1,
      color: { dark: '#0b3b24', light: '#ffffff' },
    });

    return NextResponse.json({
      success: true,
      vietQrUrl,
      qrDataUrl,
      bankId,
      accountNo,
      accountName,
      amount,
      description,
    });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return validationErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi sinh mã VietQR' }, { status: 500 });
  }
}
