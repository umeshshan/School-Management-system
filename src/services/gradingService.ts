import { db } from '../db/index.ts';
import {
  attendanceRecords,
  attendanceSessions,
  classes,
  enrollments,
  examSubjects,
  exams,
  gradeScales,
  marks,
  reportRemarks,
  schoolHolidays,
  studentSubjects,
  students,
  subjects,
} from '../db/schema.ts';
import { and, asc, eq, inArray } from 'drizzle-orm';

export async function getActiveGradeScales() {
  return db
    .select()
    .from(gradeScales)
    .orderBy(asc(gradeScales.displayOrder), asc(gradeScales.minMarks));
}

export function resolveGradeLetter(
  marksObtained: number | null,
  isAbsent: boolean,
  maxMarks: number,
  scales: Array<typeof gradeScales.$inferSelect>
): string {
  if (isAbsent || marksObtained === null || marksObtained === undefined) {
    return 'AB';
  }
  const pct = maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 100) : 0;
  for (const s of scales) {
    if (pct >= s.minMarks && pct <= s.maxMarks) {
      return s.gradeLetter;
    }
  }
  return 'W';
}

export interface StudentExamSummary {
  enrollmentId: number;
  studentId: number;
  admissionNo: string;
  studentName: string;
  rollNo: string | null;
  subjectCount: number;
  enteredApprovedCount: number;
  totalMarks: number;
  totalMaxMarks: number;
  averageMarks: number;
  overallGrade: string;
  classRank: number | null;
  allRequiredApproved: boolean;
  subjectMarks: Array<{
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    maxMarks: number;
    passMarks: number;
    marksObtained: number | null;
    isAbsent: boolean;
    gradeLetter: string;
    status: string;
    remarks: string | null;
  }>;
  teacherRemarks: string | null;
  principalRemarks: string | null;
}

export async function computeClassExamResults(
  examId: number,
  classId: number,
  options: { approvedOnly?: boolean } = {}
): Promise<{
  exam: typeof exams.$inferSelect | null;
  classRoom: typeof classes.$inferSelect | null;
  rankingsPublished: boolean;
  students: StudentExamSummary[];
}> {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId));
  const [classRoom] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId));

  if (!exam || !classRoom) {
    return {
      exam: exam ?? null,
      classRoom: classRoom ?? null,
      rankingsPublished: false,
      students: [],
    };
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
        eq(enrollments.classId, classId),
        eq(enrollments.academicYearId, exam.academicYearId)
      )
    )
    .orderBy(asc(students.admissionNo));

  if (classEnrollments.length === 0) {
    return { exam, classRoom, rankingsPublished: false, students: [] };
  }

  const examSubjRows = await db
    .select({
      examSubject: examSubjects,
      subject: subjects,
    })
    .from(examSubjects)
    .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
    .where(
      and(
        eq(examSubjects.examId, examId),
        eq(examSubjects.grade, classRoom.grade)
      )
    )
    .orderBy(asc(subjects.displayOrder));

  const enrollmentIds = classEnrollments.map((e) => e.enrollment.id);

  const studentSubjRows = await db
    .select()
    .from(studentSubjects)
    .where(inArray(studentSubjects.enrollmentId, enrollmentIds));

  const studentSubjectMap = new Map<number, Set<number>>();
  for (const ss of studentSubjRows) {
    if (!studentSubjectMap.has(ss.enrollmentId)) {
      studentSubjectMap.set(ss.enrollmentId, new Set());
    }
    studentSubjectMap.get(ss.enrollmentId)!.add(ss.subjectId);
  }

  const markRows = await db
    .select()
    .from(marks)
    .where(and(eq(marks.examId, examId), eq(marks.classId, classId)));

  const remarkRows = await db
    .select()
    .from(reportRemarks)
    .where(
      and(
        eq(reportRemarks.examId, examId),
        inArray(reportRemarks.enrollmentId, enrollmentIds)
      )
    );
  const remarkMap = new Map<number, typeof reportRemarks.$inferSelect>();
  for (const r of remarkRows) {
    remarkMap.set(r.enrollmentId, r);
  }

  let allClassMarksApproved = examSubjRows.length > 0;

  const summaries: StudentExamSummary[] = classEnrollments.map(
    ({ enrollment, student }) => {
      const assignedSet = studentSubjectMap.get(enrollment.id);
      // If student has explicit subject selections, use them; otherwise use all configured examSubjects for that grade
      const applicableSubjects =
        assignedSet && assignedSet.size > 0
          ? examSubjRows.filter((es) => assignedSet.has(es.subject.id))
          : examSubjRows;

      const studentMarks = markRows.filter(
        (m) => m.enrollmentId === enrollment.id
      );

      let totalMarks = 0;
      let totalMaxMarks = 0;
      let approvedCount = 0;
      let studentComplete = applicableSubjects.length > 0;

      const subjectMarks = applicableSubjects.map(({ examSubject, subject }) => {
        const m = studentMarks.find((row) => row.subjectId === subject.id);
        const visible =
          m && (!options.approvedOnly || m.status === 'approved');

        if (!m || m.status !== 'approved') {
          studentComplete = false;
          allClassMarksApproved = false;
        } else {
          approvedCount += 1;
        }

        if (visible && m) {
          totalMaxMarks += examSubject.maxMarks;
          if (!m.isAbsent && m.marksObtained !== null) {
            totalMarks += m.marksObtained;
          }
          return {
            subjectId: subject.id,
            subjectCode: m.subjectCodeSnapshot || subject.code,
            subjectName: m.subjectNameSnapshot || subject.name,
            maxMarks: examSubject.maxMarks,
            passMarks: examSubject.passMarks,
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent,
            gradeLetter:
              m.gradeLetter ||
              resolveGradeLetter(
                m.marksObtained,
                m.isAbsent,
                examSubject.maxMarks,
                scales
              ),
            status: m.status,
            remarks: m.remarks,
          };
        }

        return {
          subjectId: subject.id,
          subjectCode: subject.code,
          subjectName: subject.name,
          maxMarks: examSubject.maxMarks,
          passMarks: examSubject.passMarks,
          marksObtained: null,
          isAbsent: false,
          gradeLetter: '-',
          status: m ? m.status : 'pending',
          remarks: null,
        };
      });

      const pctAvg =
        totalMaxMarks > 0
          ? Number(((totalMarks / totalMaxMarks) * 100).toFixed(2))
          : 0;

      const overallGrade =
        totalMaxMarks > 0
          ? resolveGradeLetter(pctAvg, false, 100, scales)
          : '-';

      const rem = remarkMap.get(enrollment.id);

      return {
        enrollmentId: enrollment.id,
        studentId: student.id,
        admissionNo: student.admissionNo,
        studentName: `${student.firstName} ${student.lastName}`,
        rollNo: enrollment.rollNo,
        subjectCount: applicableSubjects.length,
        enteredApprovedCount: approvedCount,
        totalMarks: Number(totalMarks.toFixed(2)),
        totalMaxMarks,
        averageMarks: pctAvg,
        overallGrade,
        classRank: null,
        allRequiredApproved: studentComplete,
        subjectMarks,
        teacherRemarks: rem?.teacherRemarks ?? null,
        principalRemarks: rem?.principalRemarks ?? null,
      };
    }
  );

  // Competition ranking (1, 2, 2, 4) ONLY when all required marks for the class are approved!
  const rankingsPublished = allClassMarksApproved && summaries.length > 0;
  if (rankingsPublished) {
    const sorted = [...summaries].sort((a, b) => {
      if (b.averageMarks !== a.averageMarks) {
        return b.averageMarks - a.averageMarks;
      }
      return b.totalMarks - a.totalMarks;
    });

    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (
        i > 0 &&
        (sorted[i].averageMarks < sorted[i - 1].averageMarks ||
          sorted[i].totalMarks < sorted[i - 1].totalMarks)
      ) {
        currentRank = i + 1;
      }
      sorted[i].classRank = currentRank;
    }
  }

  return {
    exam,
    classRoom,
    rankingsPublished,
    students: summaries,
  };
}

export async function getStudentAttendanceStats(
  studentId: number,
  academicYearId: number,
  termId?: number | null
): Promise<{
  eligibleDays: number;
  presentDays: number;
  lateDays: number;
  excusedDays: number;
  absentDays: number;
  percentage: number;
}> {
  const holidayRows = await db
    .select()
    .from(schoolHolidays)
    .where(eq(schoolHolidays.academicYearId, academicYearId));
  const holidayDates = new Set(holidayRows.map((h) => h.holidayDate));

  const rows = await db
    .select({
      record: attendanceRecords,
      session: attendanceSessions,
    })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id)
    )
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceSessions.academicYearId, academicYearId),
        termId ? eq(attendanceSessions.termId, termId) : undefined
      )
    );

  let eligibleDays = 0;
  let presentDays = 0;
  let lateDays = 0;
  let excusedDays = 0;
  let absentDays = 0;

  for (const { record, session } of rows) {
    if (session.isHoliday || holidayDates.has(session.sessionDate)) {
      continue;
    }
    eligibleDays += 1;
    if (record.status === 'present') presentDays += 1;
    else if (record.status === 'late') lateDays += 1;
    else if (record.status === 'excused') excusedDays += 1;
    else if (record.status === 'absent') absentDays += 1;
  }

  const attended = presentDays + lateDays + excusedDays;
  const percentage =
    eligibleDays > 0 ? Number(((attended / eligibleDays) * 100).toFixed(1)) : 0;

  return {
    eligibleDays,
    presentDays,
    lateDays,
    excusedDays,
    absentDays,
    percentage,
  };
}
