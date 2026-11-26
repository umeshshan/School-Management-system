import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { db } from '../db/index.ts';
import {
  academicYears,
  classes,
  enrollments,
  examSubjects,
  exams,
  markImportRows,
  markImports,
  marks,
  notifications,
  schoolSettings,
  studentSubjects,
  students,
  subjects,
  teacherAssignments,
  terms,
  users,
} from '../db/schema.ts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getActiveGradeScales, resolveGradeLetter } from './gradingService.ts';
import { logAudit } from '../lib/security.ts';

export const EXPECTED_EXCEL_HEADERS = [
  'Student ID',
  'Student Name',
  'Grade',
  'Class',
  'Subject Code',
  'Subject Name',
  'Examination',
  'Maximum Marks',
  'Marks',
];

export async function verifyTeacherAccess(params: {
  teacherId?: number | null;
  isAdmin: boolean;
  classId: number;
  subjectId: number;
  academicYearId: number;
}): Promise<boolean> {
  if (params.isAdmin) return true;
  if (!params.teacherId) return false;
  const [assignment] = await db
    .select()
    .from(teacherAssignments)
    .where(
      and(
        eq(teacherAssignments.teacherId, params.teacherId),
        eq(teacherAssignments.classId, params.classId),
        eq(teacherAssignments.subjectId, params.subjectId),
        eq(teacherAssignments.academicYearId, params.academicYearId)
      )
    );
  return Boolean(assignment);
}

export async function generateMarksTemplateBuffer(params: {
  academicYearId: number;
  classId: number;
  examId: number;
  subjectId: number;
  teacherId?: number | null;
  isAdmin: boolean;
}): Promise<{ buffer: Buffer; filename: string }> {
  const allowed = await verifyTeacherAccess(params);
  if (!allowed) {
    throw new Error(
      'Forbidden: You are not assigned to this class and subject.'
    );
  }

  const [year] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.id, params.academicYearId));
  const [classRoom] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, params.classId));
  const [exam] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, params.examId));
  const [subject] = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, params.subjectId));

  if (!year || !classRoom || !exam || !subject) {
    throw new Error('Selected academic year, class, exam, or subject not found.');
  }

  const [term] = await db
    .select()
    .from(terms)
    .where(eq(terms.id, exam.termId));

  const [examSubj] = await db
    .select()
    .from(examSubjects)
    .where(
      and(
        eq(examSubjects.examId, exam.id),
        eq(examSubjects.grade, classRoom.grade),
        eq(examSubjects.subjectId, subject.id)
      )
    );

  if (!examSubj) {
    throw new Error(
      `Subject "${subject.name}" is not configured for Grade ${classRoom.grade} in examination "${exam.name}".`
    );
  }

  const [settings] = await db.select().from(schoolSettings);

  // Fetch enrolled students in this class & year
  const classEnrollments = await db
    .select({
      enrollment: enrollments,
      student: students,
    })
    .from(enrollments)
    .innerJoin(students, eq(enrollments.studentId, students.id))
    .where(
      and(
        eq(enrollments.classId, classRoom.id),
        eq(enrollments.academicYearId, year.id),
        eq(enrollments.status, 'active')
      )
    )
    .orderBy(asc(students.admissionNo));

  const enrollmentIds = classEnrollments.map((e) => e.enrollment.id);
  const ssRows =
    enrollmentIds.length > 0
      ? await db
          .select()
          .from(studentSubjects)
          .where(inArray(studentSubjects.enrollmentId, enrollmentIds))
      : [];

  const studentSubjMap = new Map<number, Set<number>>();
  for (const ss of ssRows) {
    if (!studentSubjMap.has(ss.enrollmentId)) {
      studentSubjMap.set(ss.enrollmentId, new Set());
    }
    studentSubjMap.get(ss.enrollmentId)!.add(ss.subjectId);
  }

  // Filter students taking this subject (if studentSubjects exist for student, check membership)
  const eligibleStudents = classEnrollments.filter(({ enrollment }) => {
    const selected = studentSubjMap.get(enrollment.id);
    if (!selected || selected.size === 0) return true;
    return selected.has(subject.id);
  });

  // Load any existing non-null marks to display current state (if draft/submitted)
  const existingMarks =
    enrollmentIds.length > 0
      ? await db
          .select()
          .from(marks)
          .where(
            and(
              eq(marks.examId, exam.id),
              eq(marks.classId, classRoom.id),
              eq(marks.subjectId, subject.id)
            )
          )
      : [];
  const markMap = new Map<number, typeof marks.$inferSelect>();
  for (const m of existingMarks) {
    markMap.set(m.enrollmentId, m);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings?.schoolName || 'Ke/De Nakkavita Kanishta Vidyalaya';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Marks Entry');
  sheet.views = [{ state: 'frozen', ySplit: 5 }];

  // Metadata banner (Rows 1-4)
  sheet.mergeCells('A1:I1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${settings?.schoolName || 'Ke/De Nakkavita Kanishta Vidyalaya'} — Official Examination Marks Entry Sheet`;
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:I2');
  const metaCell = sheet.getCell('A2');
  metaCell.value = `Year: ${year.name} | Term: ${term?.name || ''} | Examination: ${exam.name} | Class: ${classRoom.name} | Subject: ${subject.code} - ${subject.name} | Max Marks: ${examSubj.maxMarks} | Pass Marks: ${examSubj.passMarks}`;
  metaCell.font = { bold: true, size: 10, color: { argb: 'FF1E293B' } };
  metaCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  sheet.getRow(2).height = 22;

  sheet.mergeCells('A3:I3');
  const instrCell = sheet.getCell('A3');
  instrCell.value = `INSTRUCTIONS: Enter numeric marks between 0 and ${examSubj.maxMarks} in the "Marks" column (Column I), OR type "AB" for absent students. Do NOT edit locked student information columns (A–H).`;
  instrCell.font = { italic: true, size: 10, color: { argb: 'FF92400E' } };
  instrCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' },
  };
  sheet.getRow(3).height = 22;

  sheet.getRow(4).height = 8;

  // Row 5: Exact Required Column Headers
  const headerRow = sheet.getRow(5);
  headerRow.values = EXPECTED_EXCEL_HEADERS;
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colNumber === 9 ? 'FF1D4ED8' : 'FF334155' },
    };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 9 ? 'center' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Column widths
  sheet.columns = [
    { width: 16 }, // Student ID
    { width: 28 }, // Student Name
    { width: 10 }, // Grade
    { width: 14 }, // Class
    { width: 15 }, // Subject Code
    { width: 24 }, // Subject Name
    { width: 24 }, // Examination
    { width: 16 }, // Maximum Marks
    { width: 14 }, // Marks
  ];

  // Populate student rows starting at Row 6
  const startRow = 6;
  eligibleStudents.forEach(({ enrollment, student }, idx) => {
    const rowIdx = startRow + idx;
    const existing = markMap.get(enrollment.id);
    const existingVal = existing
      ? existing.isAbsent
        ? 'AB'
        : existing.marksObtained
      : '';

    const row = sheet.getRow(rowIdx);
    row.values = [
      student.admissionNo,
      `${student.firstName} ${student.lastName}`,
      `Grade ${classRoom.grade}`,
      classRoom.name,
      subject.code,
      subject.name,
      exam.name,
      examSubj.maxMarks,
      existingVal,
    ];
    row.height = 21;

    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (colNumber === 9) {
        // Unlocked editable Marks cell
        cell.protection = { locked: false };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEFCE8' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        // Data validation: allow 0..maxMarks OR 'AB'
        cell.dataValidation = {
          type: 'custom',
          allowBlank: false,
          formulae: [
            `OR(UPPER(I${rowIdx})="AB",AND(ISNUMBER(I${rowIdx}),I${rowIdx}>=0,I${rowIdx}<=${examSubj.maxMarks}))`,
          ],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Invalid Marks Entry',
          error: `Marks must be between 0 and ${examSubj.maxMarks}, or "AB" for Absent.`,
        };
      } else {
        cell.protection = { locked: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.font = { size: 10, color: { argb: 'FF334155' } };
      }
    });
  });

  if (eligibleStudents.length > 0) {
    const endRow = startRow + eligibleStudents.length - 1;
    // Conditional formatting to highlight invalid marks in red
    sheet.addConditionalFormatting({
      ref: `I${startRow}:I${endRow}`,
      rules: [
        {
          type: 'expression',
          priority: 1,
          formulae: [
            `AND(I${startRow}<>"",UPPER(I${startRow})<>"AB",OR(NOT(ISNUMBER(I${startRow})),I${startRow}<0,I${startRow}>${examSubj.maxMarks}))`,
          ],
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFEE2E2' },
            },
            font: { color: { argb: 'FFB91C1C' }, bold: true },
          },
        },
      ],
    });
  }

  // Protect worksheet while allowing editing ONLY unlocked Column I cells
  await sheet.protect('AcadexiaLock2026', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    insertRows: false,
    deleteRows: false,
    insertColumns: false,
    deleteColumns: false,
  });

  // Sheet 2: Instructions
  const guide = workbook.addWorksheet('Instructions');
  guide.getColumn(1).width = 90;
  const guideLines = [
    `${settings?.schoolName || 'School Portal'} — Excel Marks Entry Guidelines`,
    '',
    '1. Only edit the yellow "Marks" column (Column I) on the "Marks Entry" tab.',
    `2. Valid numeric range is 0 to ${examSubj.maxMarks}. Decimal marks (e.g., 78.5) are supported.`,
    '3. Type AB (case-insensitive) if the student was Absent. Do NOT enter 0 for absent students.',
    '4. Do not add, remove, or reorder student rows, and do not modify Student IDs.',
    '5. Save the file in .xlsx format and upload it back to the Teacher Excel Marks portal.',
    '6. The portal validates every record against the school database and shows a full Import Preview before saving.',
  ];
  guideLines.forEach((line, i) => {
    const r = guide.getRow(i + 1);
    r.getCell(1).value = line;
    if (i === 0) r.getCell(1).font = { bold: true, size: 13 };
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const safeClass = classRoom.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSubj = subject.code.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeExam = exam.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `MarksTemplate_${safeClass}_${safeSubj}_${safeExam}.xlsx`;

  return {
    buffer: Buffer.from(arrayBuffer),
    filename,
  };
}

export interface PreviewValidationResult {
  importId: number;
  filename: string;
  fileHash: string;
  duplicateFileDetected: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingMarksRows: number;
  duplicateRows: number;
  existingMarksRows: number;
  approvedLockedRows: number;
  canConfirm: boolean;
  structuralErrors: string[];
  rows: Array<{
    rowNumber: number;
    admissionNo: string;
    studentName: string;
    rawMarks: string;
    parsedMarks: number | null;
    isAbsent: boolean;
    isValid: boolean;
    hasExistingMark: boolean;
    existingIsApproved: boolean;
    errorMessage: string | null;
    actionTaken: string;
  }>;
}

export async function validateAndPreviewExcelUpload(params: {
  buffer: Buffer;
  filename: string;
  teacherUserId: number;
  teacherId?: number | null;
  isAdmin: boolean;
  academicYearId: number;
  classId: number;
  termId: number;
  examId: number;
  subjectId: number;
}): Promise<PreviewValidationResult> {
  const allowed = await verifyTeacherAccess({
    teacherId: params.teacherId,
    isAdmin: params.isAdmin,
    classId: params.classId,
    subjectId: params.subjectId,
    academicYearId: params.academicYearId,
  });
  if (!allowed) {
    throw new Error(
      'Unauthorized subject/class upload: You are not assigned to this class and subject.'
    );
  }

  const [classRoom] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, params.classId));
  const [exam] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, params.examId));
  const [subject] = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, params.subjectId));

  if (!classRoom || !exam || !subject) {
    throw new Error('Selected class, examination, or subject does not exist.');
  }
  if (exam.academicYearId !== params.academicYearId || exam.termId !== params.termId) {
    throw new Error('Examination does not belong to the selected Academic Year and Term.');
  }
  if (classRoom.academicYearId !== params.academicYearId) {
    throw new Error('Class does not belong to the selected Academic Year.');
  }

  const [examSubj] = await db
    .select()
    .from(examSubjects)
    .where(
      and(
        eq(examSubjects.examId, exam.id),
        eq(examSubjects.grade, classRoom.grade),
        eq(examSubjects.subjectId, subject.id)
      )
    );
  if (!examSubj) {
    throw new Error(
      `Subject "${subject.name}" is not configured for Grade ${classRoom.grade} in "${exam.name}".`
    );
  }

  const fileHash = crypto.createHash('sha256').update(params.buffer).digest('hex');

  // Check if same file hash was already confirmed for this exam/class/subject
  const [dupImport] = await db
    .select()
    .from(markImports)
    .where(
      and(
        eq(markImports.fileHash, fileHash),
        eq(markImports.examId, exam.id),
        eq(markImports.classId, classRoom.id),
        eq(markImports.subjectId, subject.id),
        inArray(markImports.importStatus, ['uploaded', 'under_review', 'approved', 'completed'])
      )
    );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(params.buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet('Marks Entry') || workbook.worksheets[0];

  if (!sheet) {
    throw new Error('Invalid workbook: No worksheets found.');
  }

  // Locate header row (Row 5 in template, or scan first 10 rows for 'Student ID')
  let headerRowNumber = -1;
  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    const firstCell = String(sheet.getRow(r).getCell(1).value ?? '').trim();
    if (firstCell.toLowerCase() === 'student id') {
      headerRowNumber = r;
      break;
    }
  }

  const structuralErrors: string[] = [];
  if (headerRowNumber === -1) {
    structuralErrors.push(
      'Missing expected header row ("Student ID | Student Name | ... | Marks"). Please use the official downloaded Excel template.'
    );
  } else {
    const headerRow = sheet.getRow(headerRowNumber);
    for (let c = 0; c < EXPECTED_EXCEL_HEADERS.length; c++) {
      const actual = String(headerRow.getCell(c + 1).value ?? '').trim();
      if (actual.toLowerCase() !== EXPECTED_EXCEL_HEADERS[c].toLowerCase()) {
        structuralErrors.push(
          `Column ${c + 1} header mismatch: expected "${EXPECTED_EXCEL_HEADERS[c]}", found "${actual || '(empty)'}".`
        );
      }
    }
  }

  // Preload enrolled students in this class & academic year
  const classEnrollments = await db
    .select({
      enrollment: enrollments,
      student: students,
    })
    .from(enrollments)
    .innerJoin(students, eq(enrollments.studentId, students.id))
    .where(
      and(
        eq(enrollments.classId, classRoom.id),
        eq(enrollments.academicYearId, params.academicYearId)
      )
    );

  const enrolledByAdmission = new Map<
    string,
    { enrollment: typeof enrollments.$inferSelect; student: typeof students.$inferSelect }
  >();
  for (const item of classEnrollments) {
    enrolledByAdmission.set(item.student.admissionNo.trim().toUpperCase(), item);
  }

  const enrollmentIds = classEnrollments.map((e) => e.enrollment.id);
  const ssRows =
    enrollmentIds.length > 0
      ? await db
          .select()
          .from(studentSubjects)
          .where(inArray(studentSubjects.enrollmentId, enrollmentIds))
      : [];
  const studentSubjMap = new Map<number, Set<number>>();
  for (const ss of ssRows) {
    if (!studentSubjMap.has(ss.enrollmentId)) {
      studentSubjMap.set(ss.enrollmentId, new Set());
    }
    studentSubjMap.get(ss.enrollmentId)!.add(ss.subjectId);
  }

  // Existing marks in DB
  const existingMarkRows = await db
    .select()
    .from(marks)
    .where(
      and(
        eq(marks.examId, exam.id),
        eq(marks.classId, classRoom.id),
        eq(marks.subjectId, subject.id)
      )
    );
  const existingMarkMap = new Map<number, typeof marks.$inferSelect>();
  for (const m of existingMarkRows) {
    existingMarkMap.set(m.enrollmentId, m);
  }

  const parsedRows: PreviewValidationResult['rows'] = [];
  const seenAdmissions = new Set<string>();

  let validRows = 0;
  let invalidRows = 0;
  let missingMarksRows = 0;
  let duplicateRows = 0;
  let existingMarksRows = 0;
  let approvedLockedRows = 0;

  if (structuralErrors.length === 0) {
    for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const rawId = String(row.getCell(1).text ?? row.getCell(1).value ?? '').trim();
      const rawName = String(row.getCell(2).text ?? row.getCell(2).value ?? '').trim();
      const rawSubjCode = String(row.getCell(5).text ?? row.getCell(5).value ?? '').trim();
      const rawExamName = String(row.getCell(7).text ?? row.getCell(7).value ?? '').trim();
      const cell9 = row.getCell(9).value;
      const rawMarks =
        cell9 !== null && cell9 !== undefined
          ? String(typeof cell9 === 'object' && 'result' in cell9 ? cell9.result : cell9).trim()
          : '';

      if (!rawId && !rawName && !rawMarks) {
        continue; // Skip blank trailing rows
      }

      const errors: string[] = [];
      const normId = rawId.toUpperCase();
      let isDuplicate = false;
      let isMissingMark = false;
      let isAbsent = false;
      let parsedMarks: number | null = null;
      let hasExistingMark = false;
      let existingIsApproved = false;

      if (!rawId) {
        errors.push('Missing Student ID (Admission Number).');
      } else if (seenAdmissions.has(normId)) {
        isDuplicate = true;
        duplicateRows += 1;
        errors.push(`Duplicate Student ID "${rawId}" in Excel file.`);
      } else {
        seenAdmissions.add(normId);
      }

      // Verify against DB (never trust Excel metadata blindly!)
      const matched = normId ? enrolledByAdmission.get(normId) : undefined;
      if (rawId && !matched) {
        errors.push(
          `Student "${rawId}" is not enrolled in ${classRoom.name} for the selected Academic Year.`
        );
      } else if (matched) {
        const selectedSubjs = studentSubjMap.get(matched.enrollment.id);
        if (selectedSubjs && selectedSubjs.size > 0 && !selectedSubjs.has(subject.id)) {
          errors.push(
            `Student "${rawId}" is not registered for subject ${subject.code} (${subject.name}).`
          );
        }

        const existing = existingMarkMap.get(matched.enrollment.id);
        if (existing) {
          hasExistingMark = true;
          existingMarksRows += 1;
          if (existing.status === 'approved') {
            existingIsApproved = true;
            approvedLockedRows += 1;
            if (!params.isAdmin) {
              errors.push(
                'Approved mark already exists in database. Admin authorization is required to modify approved marks.'
              );
            }
          }
        }
      }

      if (rawSubjCode && rawSubjCode.toUpperCase() !== subject.code.toUpperCase()) {
        errors.push(
          `Subject code mismatch in row: file has "${rawSubjCode}", expected "${subject.code}".`
        );
      }
      if (rawExamName && rawExamName.toLowerCase() !== exam.name.toLowerCase()) {
        errors.push(
          `Examination mismatch in row: file has "${rawExamName}", expected "${exam.name}".`
        );
      }

      // Validate Marks value
      if (rawMarks === '') {
        isMissingMark = true;
        missingMarksRows += 1;
        errors.push('Missing mark value (enter 0..' + examSubj.maxMarks + ' or "AB").');
      } else if (rawMarks.toUpperCase() === 'AB' || rawMarks.toUpperCase() === 'ABSENT') {
        isAbsent = true;
        parsedMarks = null;
      } else {
        const num = Number(rawMarks);
        if (!Number.isFinite(num)) {
          errors.push(`Invalid non-numeric mark "${rawMarks}".`);
        } else if (num < 0) {
          errors.push(`Negative mark "${num}" is not permitted.`);
        } else if (num > examSubj.maxMarks) {
          errors.push(
            `Mark "${num}" exceeds maximum marks (${examSubj.maxMarks}).`
          );
        } else {
          parsedMarks = Number(num.toFixed(2));
        }
      }

      const isValid = errors.length === 0 && !isDuplicate && !isMissingMark;
      if (isValid) {
        validRows += 1;
      } else {
        invalidRows += 1;
      }

      parsedRows.push({
        rowNumber: r,
        admissionNo: rawId || '(blank)',
        studentName: matched
          ? `${matched.student.firstName} ${matched.student.lastName}`
          : rawName || '(unknown)',
        rawMarks: rawMarks || '(blank)',
        parsedMarks,
        isAbsent,
        isValid,
        hasExistingMark,
        existingIsApproved,
        errorMessage: errors.length > 0 ? errors.join(' ') : null,
        actionTaken: isValid
          ? hasExistingMark
            ? existingIsApproved
              ? 'Admin Override'
              : 'Update Draft/Submitted'
            : 'Insert New Mark'
          : 'Skipped (Error)',
      });
    }
  }

  // Persist preview import session so error reports can be downloaded & confirmed cleanly
  const [importRecord] = await db
    .insert(markImports)
    .values({
      teacherUserId: params.teacherUserId,
      teacherId: params.teacherId ?? null,
      academicYearId: params.academicYearId,
      classId: params.classId,
      termId: params.termId,
      examId: params.examId,
      subjectId: params.subjectId,
      originalFilename: params.filename,
      fileHash,
      totalRows: parsedRows.length,
      validRows,
      invalidRows,
      missingMarksRows,
      duplicateRows,
      existingMarksRows,
      importStatus: 'pending_upload',
      approvalStatus: 'pending',
      uploadedFileBase64: params.buffer.toString('base64'),
    })
    .returning();

  if (parsedRows.length > 0) {
    await db.insert(markImportRows).values(
      parsedRows.map((r) => ({
        importId: importRecord.id,
        rowNumber: r.rowNumber,
        admissionNo: r.admissionNo,
        studentName: r.studentName,
        rawMarks: r.rawMarks,
        parsedMarks: r.parsedMarks,
        isAbsent: r.isAbsent,
        isValid: r.isValid,
        hasExistingMark: r.hasExistingMark,
        errorMessage: r.errorMessage,
        actionTaken: r.actionTaken,
      }))
    );
  }

  const canConfirm =
    structuralErrors.length === 0 &&
    validRows > 0 &&
    !dupImport;

  return {
    importId: importRecord.id,
    filename: params.filename,
    fileHash,
    duplicateFileDetected: Boolean(dupImport),
    totalRows: parsedRows.length,
    validRows,
    invalidRows,
    missingMarksRows,
    duplicateRows,
    existingMarksRows,
    approvedLockedRows,
    canConfirm,
    structuralErrors,
    rows: parsedRows,
  };
}

export async function confirmExcelImport(params: {
  importId: number;
  userId: number;
  userEmail: string;
  userRole: string;
  isAdmin: boolean;
  allowOverwriteApproved?: boolean;
  ipAddress?: string;
}) {
  const [imp] = await db
    .select()
    .from(markImports)
    .where(eq(markImports.id, params.importId));

  if (!imp) {
    throw new Error('Import preview record not found.');
  }
  if (!params.isAdmin && imp.teacherUserId !== params.userId) {
    throw new Error('Forbidden: You can only confirm your own upload preview.');
  }
  if (imp.importStatus !== 'pending_upload') {
    throw new Error('This Excel import has already been processed.');
  }

  // Prevent duplicate confirmed import of exact same file hash
  const [dupConfirmed] = await db
    .select()
    .from(markImports)
    .where(
      and(
        eq(markImports.fileHash, imp.fileHash),
        eq(markImports.examId, imp.examId),
        eq(markImports.classId, imp.classId),
        eq(markImports.subjectId, imp.subjectId),
        inArray(markImports.importStatus, ['uploaded', 'under_review', 'approved', 'completed'])
      )
    );
  if (dupConfirmed) {
    throw new Error(
      'Duplicate import blocked: This exact Excel file has already been submitted for this examination and subject.'
    );
  }

  const rows = await db
    .select()
    .from(markImportRows)
    .where(eq(markImportRows.importId, imp.id))
    .orderBy(asc(markImportRows.rowNumber));

  const validRows = rows.filter((r) => r.isValid);
  if (validRows.length === 0) {
    throw new Error('No valid rows found to save. Please fix errors and re-upload.');
  }

  const [classRoom] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, imp.classId));
  const [subject] = await db
    .select()
    .from(subjects)
    .where(eq(subjects.id, imp.subjectId));
  const [examSubj] = await db
    .select()
    .from(examSubjects)
    .where(
      and(
        eq(examSubjects.examId, imp.examId),
        eq(examSubjects.grade, classRoom.grade),
        eq(examSubjects.subjectId, imp.subjectId)
      )
    );

  if (!classRoom || !subject || !examSubj) {
    throw new Error('Target class, subject, or examination configuration missing.');
  }

  const scales = await getActiveGradeScales();

  const classEnrollments = await db
    .select({
      enrollment: enrollments,
      student: students,
    })
    .from(enrollments)
    .innerJoin(students, eq(enrollments.studentId, students.id))
    .where(
      and(
        eq(enrollments.classId, imp.classId),
        eq(enrollments.academicYearId, imp.academicYearId)
      )
    );
  const enrollMap = new Map<
    string,
    { enrollment: typeof enrollments.$inferSelect; student: typeof students.$inferSelect }
  >();
  for (const e of classEnrollments) {
    enrollMap.set(e.student.admissionNo.trim().toUpperCase(), e);
  }

  let savedCount = 0;

  await db.transaction(async (tx) => {
    for (const row of validRows) {
      const target = enrollMap.get(row.admissionNo.trim().toUpperCase());
      if (!target) continue;

      const [existing] = await tx
        .select()
        .from(marks)
        .where(
          and(
            eq(marks.examId, imp.examId),
            eq(marks.enrollmentId, target.enrollment.id),
            eq(marks.subjectId, imp.subjectId)
          )
        );

      if (existing && existing.status === 'approved' && !(params.isAdmin && params.allowOverwriteApproved)) {
        continue; // Never overwrite approved marks automatically
      }

      const gradeLetter = resolveGradeLetter(
        row.parsedMarks,
        row.isAbsent,
        examSubj.maxMarks,
        scales
      );

      if (existing) {
        await tx
          .update(marks)
          .set({
            marksObtained: row.isAbsent ? null : row.parsedMarks,
            isAbsent: row.isAbsent,
            gradeLetter,
            subjectNameSnapshot: subject.name,
            subjectCodeSnapshot: subject.code,
            status: 'submitted',
            submittedBy: params.userId,
            importId: imp.id,
            updatedAt: new Date(),
          })
          .where(eq(marks.id, existing.id));
      } else {
        await tx.insert(marks).values({
          examId: imp.examId,
          examSubjectId: examSubj.id,
          enrollmentId: target.enrollment.id,
          studentId: target.student.id,
          classId: imp.classId,
          subjectId: imp.subjectId,
          subjectNameSnapshot: subject.name,
          subjectCodeSnapshot: subject.code,
          marksObtained: row.isAbsent ? null : row.parsedMarks,
          isAbsent: row.isAbsent,
          gradeLetter,
          status: 'submitted',
          submittedBy: params.userId,
          importId: imp.id,
        });
      }
      savedCount += 1;
    }

    await tx
      .update(markImports)
      .set({
        importStatus: 'under_review',
        approvalStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(markImports.id, imp.id));
  });

  // Notify admins of new marks submission
  await db.insert(notifications).values({
    targetRole: 'admin',
    title: 'New Excel Marks Submission',
    message: `${params.userEmail} submitted ${savedCount} mark(s) for ${classRoom.name} — ${subject.code} (${subject.name}). Pending review and approval.`,
    type: 'action',
    createdBy: params.userId,
  });

  await logAudit({
    userId: params.userId,
    userEmail: params.userEmail,
    userRole: params.userRole,
    action: 'CONFIRM_EXCEL_IMPORT',
    entityType: 'mark_imports',
    entityId: imp.id,
    details: { savedCount, classId: imp.classId, subjectId: imp.subjectId, examId: imp.examId },
    ipAddress: params.ipAddress,
  });

  return { importId: imp.id, savedCount, status: 'under_review' };
}

export async function generateErrorReportBuffer(importId: number): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const [imp] = await db
    .select()
    .from(markImports)
    .where(eq(markImports.id, importId));
  if (!imp) {
    throw new Error('Import record not found.');
  }

  const rows = await db
    .select()
    .from(markImportRows)
    .where(eq(markImportRows.importId, importId))
    .orderBy(asc(markImportRows.rowNumber));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import Validation Report');
  sheet.addRow([
    'Row Number',
    'Student ID',
    'Student Name',
    'Entered Marks',
    'Validation Status',
    'Action',
    'Error Description',
  ]);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
  });

  for (const r of rows) {
    const added = sheet.addRow([
      r.rowNumber,
      r.admissionNo,
      r.studentName || '',
      r.rawMarks || '',
      r.isValid ? 'VALID' : 'ERROR',
      r.actionTaken || '',
      r.errorMessage || 'OK',
    ]);
    if (!r.isValid) {
      added.getCell(5).font = { bold: true, color: { argb: 'FFB91C1C' } };
      added.getCell(7).font = { color: { argb: 'FFB91C1C' } };
    }
  }

  sheet.columns = [
    { width: 12 },
    { width: 18 },
    { width: 26 },
    { width: 15 },
    { width: 18 },
    { width: 22 },
    { width: 55 },
  ];

  const arr = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arr),
    filename: `ErrorReport_Import_${importId}.xlsx`,
  };
}
