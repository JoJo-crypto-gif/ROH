import test from "node:test";
import assert from "node:assert/strict";
import { generateReportPdf, type ReportSnapshot } from "./report-pdf.service.js";

const snapshot: ReportSnapshot = {
  school: { name: "Lumen Community School", motto: "Knowledge and Service" },
  student: { name: "Kofi Mensah", admissionNo: "ADM/2026/1001", sectionName: "Basic 1 A", gradeLevelName: "Basic 1" },
  academic: { academicYear: "2026 / 2027", term: "Term 1", generatedAt: new Date().toISOString(), version: 1 },
  components: [{ id: "ca", name: "Class Score", maxScore: 40 }, { id: "exam", name: "Exam", maxScore: 60 }],
  subjects: [{ name: "Mathematics", scores: [{ componentId: "ca", score: 35 }, { componentId: "exam", score: 52 }], totalScore: 87, grade: "A", remark: "Excellent", position: 1 }],
  attendance: { present: 50, absent: 1, late: 2, excused: 0, total: 53 },
  summary: { totalScore: 87, averageScore: 87, position: 1, conduct: "Good", attitude: "Focused", teacherRemarks: "Excellent work", headteacherRemark: "Keep it up" },
};

test("report generator creates a valid PDF and draft watermark", async () => {
  const published = await generateReportPdf(snapshot, false);
  const draft = await generateReportPdf(snapshot, true);
  assert.equal(published.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(published.toString("latin1"), /Kofi Mensah/);
  assert.doesNotMatch(published.toString("latin1"), /\(DRAFT\)/);
  assert.match(draft.toString("latin1"), /\(DRAFT\)/);
});
