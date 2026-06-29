function escapePdf(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function text(x: number, y: number, value: unknown, size = 9, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
}

function wrapText(value: string, maxCharacters: number) {
  const lines: string[] = [];
  let current = "";
  const words = value.trim().split(/\s+/);
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let offset = 0; offset < word.length; offset += maxCharacters) {
        const chunk = word.slice(offset, offset + maxCharacters);
        if (chunk.length === maxCharacters) lines.push(chunk);
        else current = chunk;
      }
      continue;
    }
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxCharacters) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildPdf(pages: string[][]) {
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  for (const commands of pages) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${pageId + 2} 0 R /F2 ${pageId + 3} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const content = commands.join("\n");
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%LUMEN-FINANCE\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1)
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "latin1");
}

export interface FinancePdfData {
  title: string;
  school: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  reference?: string;
  student: { name: string; admissionNo: string };
  generatedAt: string;
  lines: {
    label: string;
    context?: string;
    debit?: number;
    credit?: number;
    balance?: number;
  }[];
  totals: { label: string; value: number }[];
  footer?: string;
}

export function generateFinancePdf(data: FinancePdfData) {
  const chunks: (typeof data.lines)[] = [];
  for (let i = 0; i < data.lines.length; i += 26)
    chunks.push(data.lines.slice(i, i + 26));
  if (!chunks.length) chunks.push([]);
  const pages = chunks.map((lines, pageIndex) => {
    const commands = [
      text(45, 805, data.school.name, 18, true),
      text(45, 785, data.title, 13, true),
    ];
    if (data.reference) commands.push(text(390, 785, data.reference, 9, true));
    commands.push(text(45, 758, `Student: ${data.student.name}`, 9, true));
    commands.push(text(330, 758, `Admission: ${data.student.admissionNo}`, 9));
    commands.push(text(45, 742, `Generated: ${data.generatedAt}`, 8));
    commands.push(text(470, 742, `Page ${pageIndex + 1}/${chunks.length}`, 8));
    commands.push(
      text(45, 715, "Description", 8, true),
      text(345, 715, "Debit", 8, true),
      text(415, 715, "Credit", 8, true),
      text(485, 715, "Balance", 8, true),
    );
    let y = 695;
    for (const line of lines) {
      commands.push(text(45, y, line.label.slice(0, 48), 8));
      if (line.context)
        commands.push(text(45, y - 11, line.context.slice(0, 60), 6));
      commands.push(
        text(
          345,
          y,
          line.debit == null ? "-" : `GHS ${line.debit.toFixed(2)}`,
          8,
        ),
      );
      commands.push(
        text(
          415,
          y,
          line.credit == null ? "-" : `GHS ${line.credit.toFixed(2)}`,
          8,
        ),
      );
      commands.push(
        text(
          485,
          y,
          line.balance == null ? "-" : `GHS ${line.balance.toFixed(2)}`,
          8,
        ),
      );
      y -= 23;
    }
    if (pageIndex === chunks.length - 1) {
      y = Math.max(85, y - 10);
      for (const total of data.totals) {
        commands.push(
          text(340, y, total.label, 9, true),
          text(475, y, `GHS ${total.value.toFixed(2)}`, 9, true),
        );
        y -= 17;
      }
    }
    if (data.footer) {
      const footerLines = wrapText(data.footer, 90);
      let footerY = 38 + Math.max(0, footerLines.length - 1) * 9;
      for (const footerLine of footerLines) {
        commands.push(text(45, footerY, footerLine, 7));
        footerY -= 9;
      }
    }
    return commands;
  });
  return buildPdf(pages);
}
