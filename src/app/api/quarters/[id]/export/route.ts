import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { previewQuarterSettlement } from '@/lib/quarter-service';
import { quarterSettlementCsv, quarterSettlementPdf } from '@/lib/report-export';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;
  const report = await previewQuarterSettlement(id);
  const lines = user.role === 'MEMBER'
    ? report.lines.filter((line) => line.userId === user.id)
    : report.lines;
  const format = new URL(req.url).searchParams.get('format') || 'csv';
  if (format === 'pdf') {
    const pdf = quarterSettlementPdf(`Quyet toan ${report.quarter.name}`, lines);
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="quarter-${id}.pdf"`,
      },
    });
  }
  return new NextResponse(quarterSettlementCsv(lines), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="quarter-${id}.csv"`,
    },
  });
}
