import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { paymentOutstanding } from '@/lib/finance-service';
import type { Payment } from '@/lib/types';
import { RequestValidationError, validationErrorResponse, vietQrQuerySchema } from '@/lib/api-validation';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const requestedAmount = searchParams.get('amount');
    const parsed = vietQrQuerySchema.safeParse({
      paymentId: searchParams.get('paymentId') || undefined,
      amount: requestedAmount === null ? undefined : requestedAmount,
      description: searchParams.get('description') || undefined,
    });
    if (!parsed.success) throw new RequestValidationError(parsed.error.issues);
    let { amount, description } = parsed.data;
    if (parsed.data.paymentId) {
      const db = await getDb();
      const payment = await db.collection<Payment>('payments').findOne({ id: parsed.data.paymentId });
      if (!payment || payment.direction !== 'RECEIVABLE' || payment.status === 'CANCELLED') {
        return NextResponse.json({ error: 'Khoản phải thu không tồn tại hoặc đã bị hủy' }, { status: 404 });
      }
      if (user.role === 'MEMBER' && payment.payerId !== user.id) {
        return NextResponse.json({ error: 'Không có quyền xem khoản thanh toán này' }, { status: 403 });
      }
      amount = paymentOutstanding(payment);
      description = `${payment.payerName} ${payment.sessionId || payment.quarterId || 'cau long'}`
        .replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 80);
      if (amount <= 0) {
        return NextResponse.json({ error: 'Khoản thanh toán đã hoàn tất' }, { status: 409 });
      }
    }
    if (!amount) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 });
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
