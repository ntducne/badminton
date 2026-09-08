import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Badminton Club · Quản lý Đội nhóm & Quyết toán Cầu lông',
  description:
    'Ứng dụng điểm danh, quản lý quỹ, tồn kho cầu, chi phí sân nước và quyết toán tài chính đội nhóm cầu lông.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-emerald-100 selection:text-emerald-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
