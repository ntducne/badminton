import type { QuarterSettlementLine } from './types';

export function quarterSettlementCsv(lines: QuarterSettlementLine[]): string {
  const rows = [
    ['Thành viên', 'Số buổi chịu phí', 'Tham gia', 'Nghỉ hợp lệ', 'Nghỉ muộn', 'Nghĩa vụ thực tế', 'Đã đóng quý', 'Số cuối kỳ'],
    ...lines.map((line) => [
      line.userName, line.liableSessionCount, line.attendedCount, line.absentValidCount,
      line.absentLateCount, line.actualCourtObligation, line.quarterFeePaid, line.finalBalance,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
}

function ascii(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function quarterSettlementPdf(title: string, lines: QuarterSettlementLine[]): Uint8Array {
  const reportLines = [
    title,
    'Thanh vien | Buoi tinh phi | Nghia vu | Da dong | Cuoi ky',
    ...lines.map((line) => `${line.userName} | ${line.liableSessionCount} | ${line.actualCourtObligation} | ${line.quarterFeePaid} | ${line.finalBalance}`),
  ].slice(0, 45);
  const content = reportLines.map((line, index) =>
    `BT /F1 ${index === 0 ? 16 : 10} Tf 40 ${800 - index * 17} Td (${ascii(line)}) Tj ET`
  ).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
