import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const amount = Number(searchParams.get('amount')) || 0;
    const description = searchParams.get('description') || 'Tien cau long';
    const bankId = searchParams.get('bankId') || process.env.VIETQR_BANK_ID || '970422';
    const accountNo = searchParams.get('accountNo') || process.env.VIETQR_ACCOUNT_NO || '0988888888';
    const accountName = searchParams.get('accountName') || process.env.VIETQR_ACCOUNT_NAME || 'NGUYEN DUC TUNG';

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
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi sinh mã VietQR' }, { status: 500 });
  }
}

