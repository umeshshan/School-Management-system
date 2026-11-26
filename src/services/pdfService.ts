import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { db } from '../db/index.ts';
import {
  academicYears,
  schoolSettings,
  terms,
} from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  computeClassExamResults,
  getStudentAttendanceStats,
  StudentExamSummary,
} from './gradingService.ts';

function renderStudentPage(
  doc: PDFKit.PDFDocument,
  data: {
    school: typeof schoolSettings.$inferSelect | undefined;
    yearName: string;
    termName: string;
    examName: string;
    className: string;
    grade: number;
    rankingsPublished: boolean;
    student: StudentExamSummary;
    attendancePercentage: number;
    eligibleDays: number;
    presentDays: number;
  }
) {
  const pageWidth = doc.page.width;
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;

  // Crest logo if available
  const crestPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/1000195705_95727674.jpg'
  );
  if (fs.existsSync(crestPath)) {
    try {
      doc.image(crestPath, margin, 36, { width: 52, height: 52 });
    } catch {
      // ignore image decode fallback
    }
  }

  // School Header
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#0F172A')
    .text(
      data.school?.schoolName || 'Ke/De Nakkavita Kanishta Vidyalaya',
      margin + 64,
      40
    );
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#475569')
    .text(
      `${data.school?.schoolAddress || ''}  |  ${data.school?.schoolPhone || ''}  |  ${data.school?.schoolEmail || ''}`,
      margin + 64,
      61
    );
  doc
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor('#64748B')
    .text(data.school?.academicMotto || '', margin + 64, 75);

  doc
    .moveTo(margin, 98)
    .lineTo(pageWidth - margin, 98)
    .strokeColor('#CBD5E1')
    .lineWidth(1)
    .stroke();

  // Title Banner
  doc
    .rect(margin, 108, contentWidth, 26)
    .fill('#0F172A');
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#FFFFFF')
    .text('OFFICIAL STUDENT EXAMINATION REPORT CARD', margin + 12, 115);

  // Student & Exam Metadata Grid
  const metaY = 146;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#334155');
  doc.text('Student Name:', margin, metaY);
  doc.font('Helvetica').fillColor('#0F172A').text(data.student.studentName, margin + 95, metaY);

  doc.font('Helvetica-Bold').fillColor('#334155').text('Admission No:', margin + 275, metaY);
  doc.font('Helvetica').fillColor('#0F172A').text(data.student.admissionNo, margin + 365, metaY);

  doc.font('Helvetica-Bold').fillColor('#334155').text('Grade & Class:', margin, metaY + 18);
  doc.font('Helvetica').fillColor('#0F172A').text(data.className, margin + 95, metaY + 18);

  doc.font('Helvetica-Bold').fillColor('#334155').text('Academic Year:', margin + 275, metaY + 18);
  doc.font('Helvetica').fillColor('#0F172A').text(`${data.yearName} (${data.termName})`, margin + 365, metaY + 18);

  doc.font('Helvetica-Bold').fillColor('#334155').text('Examination:', margin, metaY + 36);
  doc.font('Helvetica').fillColor('#0F172A').text(data.examName, margin + 95, metaY + 36);

  doc.font('Helvetica-Bold').fillColor('#334155').text('Attendance:', margin + 275, metaY + 36);
  doc
    .font('Helvetica')
    .fillColor('#0F172A')
    .text(
      `${data.attendancePercentage}% (${data.presentDays}/${data.eligibleDays} days)`,
      margin + 365,
      metaY + 36
    );

  // Marks Table
  let tableY = 216;
  const colX = [margin, margin + 70, margin + 275, margin + 335, margin + 395, margin + 445];
  doc.rect(margin, tableY, contentWidth, 22).fill('#F1F5F9');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A');
  doc.text('Code', colX[0] + 6, tableY + 7);
  doc.text('Subject', colX[1] + 6, tableY + 7);
  doc.text('Max', colX[2] + 6, tableY + 7);
  doc.text('Marks', colX[3] + 6, tableY + 7);
  doc.text('Grade', colX[4] + 6, tableY + 7);
  doc.text('Outcome', colX[5] + 6, tableY + 7);

  tableY += 22;
  for (let i = 0; i < data.student.subjectMarks.length; i++) {
    const sm = data.student.subjectMarks[i];
    if (i % 2 === 1) {
      doc.rect(margin, tableY, contentWidth, 21).fill('#F8FAFC');
    }
    const marksDisplay = sm.isAbsent
      ? 'AB'
      : sm.marksObtained !== null
      ? String(sm.marksObtained)
      : '-';
    const outcome = sm.isAbsent
      ? 'Absent'
      : sm.marksObtained === null
      ? 'Pending'
      : sm.marksObtained >= sm.passMarks
      ? 'Pass'
      : 'Needs Support';

    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(sm.subjectCode, colX[0] + 6, tableY + 6, { width: 60 });
    doc.fillColor('#0F172A').text(sm.subjectName, colX[1] + 6, tableY + 6, { width: 195 });
    doc.fillColor('#475569').text(String(sm.maxMarks), colX[2] + 6, tableY + 6);
    doc.font('Helvetica-Bold').fillColor('#0F172A').text(marksDisplay, colX[3] + 6, tableY + 6);
    doc.text(sm.gradeLetter, colX[4] + 6, tableY + 6);
    doc
      .font('Helvetica')
      .fillColor(outcome === 'Pass' ? '#15803D' : outcome === 'Absent' ? '#B45309' : '#B91C1C')
      .text(outcome, colX[5] + 6, tableY + 6);

    doc
      .moveTo(margin, tableY + 21)
      .lineTo(pageWidth - margin, tableY + 21)
      .strokeColor('#E2E8F0')
      .lineWidth(0.5)
      .stroke();
    tableY += 21;
  }

  // Summary KPI Box
  const sumY = tableY + 18;
  doc.rect(margin, sumY, contentWidth, 46).fillAndStroke('#F8FAFC', '#CBD5E1');
  const thirdW = contentWidth / 4;
  const kpis = [
    { label: 'Total Marks', value: `${data.student.totalMarks} / ${data.student.totalMaxMarks}` },
    { label: 'Average (%)', value: `${data.student.averageMarks}%` },
    { label: 'Overall Grade', value: data.student.overallGrade },
    {
      label: 'Class Rank',
      value:
        data.rankingsPublished && data.student.classRank
          ? `#${data.student.classRank}`
          : 'Pending',
    },
  ];
  kpis.forEach((k, idx) => {
    const x = margin + idx * thirdW + 12;
    doc.font('Helvetica').fontSize(8).fillColor('#64748B').text(k.label, x, sumY + 8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0F172A').text(k.value, x, sumY + 22);
  });

  // Remarks
  const remY = sumY + 64;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#334155').text('Class Teacher Remarks:', margin, remY);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#0F172A')
    .text(data.student.teacherRemarks || 'Consistent effort encouraged across all subjects.', margin, remY + 14, {
      width: contentWidth,
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#334155')
    .text('Principal Remarks:', margin, remY + 46);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#0F172A')
    .text(
      data.student.principalRemarks || 'Official academic transcript verified by Examination Office.',
      margin,
      remY + 60,
      { width: contentWidth }
    );

  // Footer / Signatures
  const footY = doc.page.height - 92;
  doc
    .moveTo(margin, footY)
    .lineTo(margin + 150, footY)
    .strokeColor('#94A3B8')
    .stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text('Class Teacher Signature', margin, footY + 6);

  doc
    .moveTo(pageWidth - margin - 150, footY)
    .lineTo(pageWidth - margin, footY)
    .strokeColor('#94A3B8')
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#475569')
    .text(data.school?.principalName || 'Principal', pageWidth - margin - 150, footY + 6);

  doc
    .fontSize(8)
    .fillColor('#94A3B8')
    .text(
      `Published: ${new Date().toISOString().slice(0, 10)}`,
      margin,
      doc.page.height - 46
    );
}

export async function generateReportCardPdfBuffer(params: {
  examId: number;
  classId: number;
  enrollmentId?: number;
  approvedOnly: boolean;
}): Promise<{ buffer: Buffer; filename: string }> {
  const result = await computeClassExamResults(params.examId, params.classId, {
    approvedOnly: params.approvedOnly,
  });

  if (!result.exam || !result.classRoom) {
    throw new Error('Examination or class not found.');
  }

  const [year] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.id, result.exam.academicYearId));
  const [term] = await db
    .select()
    .from(terms)
    .where(eq(terms.id, result.exam.termId));
  const [school] = await db.select().from(schoolSettings);

  const targetStudents = params.enrollmentId
    ? result.students.filter((s) => s.enrollmentId === params.enrollmentId)
    : result.students;

  if (targetStudents.length === 0) {
    throw new Error('No matching student enrollment records found for report card generation.');
  }

  const doc = new PDFDocument({ size: 'A4', margin: 46 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  for (let i = 0; i < targetStudents.length; i++) {
    const st = targetStudents[i];
    if (i > 0) doc.addPage();
    const att = await getStudentAttendanceStats(
      st.studentId,
      result.exam.academicYearId,
      result.exam.termId
    );
    renderStudentPage(doc, {
      school,
      yearName: year?.name || '',
      termName: term?.name || '',
      examName: result.exam.name,
      className: result.classRoom.name,
      grade: result.classRoom.grade,
      rankingsPublished: result.rankingsPublished,
      student: st,
      attendancePercentage: att.percentage,
      eligibleDays: att.eligibleDays,
      presentDays: att.presentDays + att.lateDays + att.excusedDays,
    });
  }

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

  const filename = params.enrollmentId
    ? `ReportCard_${targetStudents[0].admissionNo}_${result.exam.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
    : `ClassReportCards_${result.classRoom.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${result.exam.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

  return { buffer, filename };
}
