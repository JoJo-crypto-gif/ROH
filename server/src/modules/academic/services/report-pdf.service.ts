export interface ReportSnapshot {
  school: { name: string; motto?: string | null; address?: string | null; phone?: string | null; email?: string | null; headteacherName?: string | null; reportFooter?: string | null };
  student: { name: string; admissionNo: string; sectionName: string; gradeLevelName: string };
  academic: { academicYear: string; term: string; generatedAt: string; version: number };
  components: { id: string; name: string; maxScore: number }[];
  subjects: { name: string; scores: { componentId: string; score: number }[]; totalScore: number; grade: string; remark: string; position: number | null }[];
  attendance: { present: number; absent: number; late: number; excused: number; total: number };
  summary: { totalScore: number; averageScore: number; position: number | null; conduct: string; attitude: string; teacherRemarks: string; headteacherRemark: string };
}

function pdfText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function text(x: number, y: number, value: unknown, size = 9, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `${x1} ${y1} m ${x2} ${y2} l S`;
}

function buildPdf(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let output = "%PDF-1.4\n%LUMEN\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, "latin1");
}

export async function generateReportPdf(snapshot: ReportSnapshot, draft = false): Promise<Buffer> {
  const commands: string[] = ["0.2 w", "0 G"];
  commands.push(text(50, 808, snapshot.school.name, 18, true));
  if (snapshot.school.motto) commands.push(text(50, 790, snapshot.school.motto, 9));
  commands.push(text(50, 770, "TERMINAL REPORT CARD", 14, true));
  commands.push(text(50, 744, `Student: ${snapshot.student.name}`, 9, true));
  commands.push(text(330, 744, `Admission No: ${snapshot.student.admissionNo}`, 9));
  commands.push(text(50, 728, `Class: ${snapshot.student.sectionName} (${snapshot.student.gradeLevelName})`, 9));
  commands.push(text(330, 728, `Academic Year: ${snapshot.academic.academicYear}`, 9));
  commands.push(text(50, 712, `Term: ${snapshot.academic.term}`, 9));
  commands.push(text(330, 712, `Report Version: ${snapshot.academic.version}`, 9));
  commands.push(line(45, 700, 550, 700));

  const columnLabels = ["Subject", ...snapshot.components.map((component) => `${component.name} /${component.maxScore}`), "Total", "Grade", "Pos"];
  const columnWidths = [150, ...snapshot.components.map(() => Math.max(58, 175 / Math.max(1, snapshot.components.length))), 48, 42, 35];
  let x = 48;
  for (let index = 0; index < columnLabels.length; index++) {
    commands.push(text(x, 682, columnLabels[index], 7, true));
    x += columnWidths[index];
  }
  commands.push(line(45, 674, 550, 674));
  let y = 658;
  for (const subject of snapshot.subjects.slice(0, 18)) {
    const values = [
      subject.name,
      ...snapshot.components.map((component) => subject.scores.find((score) => score.componentId === component.id)?.score ?? "-"),
      subject.totalScore.toFixed(1), subject.grade, subject.position ?? "-",
    ];
    x = 48;
    for (let index = 0; index < values.length; index++) {
      commands.push(text(x, y, values[index], 8));
      x += columnWidths[index];
    }
    commands.push(line(45, y - 5, 550, y - 5));
    y -= 24;
  }

  y -= 6;
  commands.push(text(50, y, `Average: ${snapshot.summary.averageScore.toFixed(1)}%     Overall position: ${snapshot.summary.position ?? "-"}`, 9, true));
  y -= 18;
  commands.push(text(50, y, `Attendance - Present: ${snapshot.attendance.present}  Absent: ${snapshot.attendance.absent}  Late: ${snapshot.attendance.late}  Excused: ${snapshot.attendance.excused}`, 8));
  y -= 18;
  commands.push(text(50, y, `Conduct: ${snapshot.summary.conduct || "-"}     Attitude: ${snapshot.summary.attitude || "-"}`, 8));
  y -= 24;
  commands.push(text(50, y, "Class Teacher's Remark", 9, true));
  y -= 15;
  commands.push(text(50, y, snapshot.summary.teacherRemarks || "-", 8));
  if (snapshot.summary.headteacherRemark) {
    y -= 24;
    commands.push(text(50, y, "Headteacher's Remark", 9, true));
    y -= 15;
    commands.push(text(50, y, snapshot.summary.headteacherRemark, 8));
  }
  commands.push(text(350, 80, `Headteacher: ${snapshot.school.headteacherName ?? "________________"}`, 8));
  if (snapshot.school.reportFooter) commands.push(text(50, 48, snapshot.school.reportFooter, 7));
  if (draft) {
    commands.push("0.85 g");
    commands.push(text(190, 410, "DRAFT", 62, true));
    commands.push("0 G");
  }
  return buildPdf(commands.join("\n"));
}
