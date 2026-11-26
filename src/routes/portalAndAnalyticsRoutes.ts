import { Router } from 'express';
import { db } from '../db/index.ts';
import {
  academicYears,
  classes,
  enrollments,
  exams,
  marks,
  parentStudent,
  students,
  terms,
} from '../db/schema.ts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import {
  computeClassExamResults,
  getActiveGradeScales,
  getStudentAttendanceStats,
} from '../services/gradingService.ts';
import { generateReportCardPdfBuffer } from '../services/pdfService.ts';
import { generateLowLatencyAcademicInsight } from '../services/geminiService.ts';

const router = Router();

async function buildStudentAcademicView(studentId: number) {
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.id, studentId));
  if (!student) return null;

  const studentEnrollments = await db
    .select({
      enrollment: enrollments,
      classRoom: classes,
      year: academicYears,
    })
    .from(enrollments)
    .innerJoin(classes, eq(enrollments.classId, classes.id))
    .innerJoin(academicYears, eq(enrollments.academicYearId, academicYears.id))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(academicYears.name));

  const currentEnrollment = studentEnrollments[0] || null;
  const examResults = [];

  for (const item of studentEnrollments) {
    const yearExams = await db
      .select({ exam: exams, term: terms })
      .from(exams)
      .innerJoin(terms, eq(exams.termId, terms.id))
      .where(eq(exams.academicYearId, item.year.id))
      .orderBy(desc(exams.examDate));

    for (const ex of yearExams) {
      const classRes = await computeClassExamResults(ex.exam.id, item.classRoom.id, {
        approvedOnly: true,
      });
      const mySummary = classRes.students.find(
        (s) => s.enrollmentId === item.enrollment.id
      );
      if (mySummary) {
        examResults.push({
          ...mySummary,
          examId: ex.exam.id,
          examName: ex.exam.name,
          examDate: ex.exam.examDate,
          termName: ex.term.name,
          academicYear: item.year.name,
          classId: item.classRoom.id,
          className: item.classRoom.name,
          rankingsPublished: classRes.rankingsPublished,
          classRank: classRes.rankingsPublished ? mySummary.classRank : null,
        });
      }
    }
  }

  const attendance = currentEnrollment
    ? await getStudentAttendanceStats(
        student.id,
        currentEnrollment.year.id,
        null
      )
    : {
        eligibleDays: 0,
        presentDays: 0,
        lateDays: 0,
        excusedDays: 0,
        absentDays: 0,
        percentage: 0,
      };

  return {
    student,
    currentEnrollment: currentEnrollment
      ? {
          enrollmentId: currentEnrollment.enrollment.id,
          classId: currentEnrollment.classRoom.id,
          className: currentEnrollment.classRoom.name,
          grade: currentEnrollment.classRoom.grade,
          academicYear: currentEnrollment.year.name,
          rollNo: currentEnrollment.enrollment.rollNo,
        }
      : null,
    attendance,
    examResults,
  };
}

// Student Dashboard (Strict self-only isolation)
router.get(
  '/student/overview',
  requireAuth,
  requireRole('student'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.authUser!.studentId) {
        return res
          .status(404)
          .json({ error: 'Student profile is not linked to this account.' });
      }
      const data = await buildStudentAcademicView(req.authUser!.studentId);
      res.json(data);
    } catch (error) {
      console.error('Student overview error:', error);
      res.status(500).json({ error: 'Failed to load student dashboard.' });
    }
  }
);

// Parent Dashboard (Strict parent-child isolation)
router.get(
  '/parent/overview',
  requireAuth,
  requireRole('parent'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.authUser!.parentId) {
        return res
          .status(404)
          .json({ error: 'Parent profile is not linked to this account.' });
      }

      const links = await db
        .select()
        .from(parentStudent)
        .where(eq(parentStudent.parentId, req.authUser!.parentId));

      const children = [];
      for (const link of links) {
        const view = await buildStudentAcademicView(link.studentId);
        if (view) {
          children.push({
            relationship: link.relationship,
            ...view,
          });
        }
      }

      res.json({ children });
    } catch (error) {
      console.error('Parent overview error:', error);
      res.status(500).json({ error: 'Failed to load parent dashboard.' });
    }
  }
);

// Individual Student PDF Report Card (Strict RBAC ownership check)
router.get(
  '/reports/student/:enrollmentId/exam/:examId/pdf',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const enrollmentId = Number(req.params.enrollmentId);
      const examId = Number(req.params.examId);
      const user = req.authUser!;

      const [enr] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.id, enrollmentId));
      if (!enr) return res.status(404).json({ error: 'Enrollment not found.' });

      if (user.role === 'student') {
        if (enr.studentId !== user.studentId) {
          return res
            .status(403)
            .json({ error: 'Forbidden: You may only download your own report card.' });
        }
      } else if (user.role === 'parent') {
        const [link] = await db
          .select()
          .from(parentStudent)
          .where(
            and(
              eq(parentStudent.parentId, user.parentId || -1),
              eq(parentStudent.studentId, enr.studentId)
            )
          );
        if (!link) {
          return res.status(403).json({
            error: 'Forbidden: You may only download report cards for linked children.',
          });
        }
      }

      const { buffer, filename } = await generateReportCardPdfBuffer({
        examId,
        classId: enr.classId,
        enrollmentId,
        approvedOnly: user.role === 'student' || user.role === 'parent',
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: unknown) {
      console.error('Individual PDF generation error:', error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate PDF report card.',
      });
    }
  }
);

// Bulk Class PDF Report Cards
router.get(
  '/reports/class/:classId/exam/:examId/pdf',
  requireAuth,
  requireRole('admin', 'teacher'),
  async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const examId = Number(req.params.examId);

      const { buffer, filename } = await generateReportCardPdfBuffer({
        examId,
        classId,
        approvedOnly: true,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: unknown) {
      console.error('Bulk PDF generation error:', error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate class report cards.',
      });
    }
  }
);

// Official Analytics Dashboard (Approved marks ONLY)
router.get(
  '/analytics/overview',
  requireAuth,
  requireRole('admin', 'teacher'),
  async (req, res) => {
    try {
      const academicYearId = req.query.academicYearId
        ? Number(req.query.academicYearId)
        : null;
      const termId = req.query.termId ? Number(req.query.termId) : null;
      const gradeFilter = req.query.grade ? Number(req.query.grade) : null;
      const classIdFilter = req.query.classId ? Number(req.query.classId) : null;
      const subjectIdFilter = req.query.subjectId
        ? Number(req.query.subjectId)
        : null;
      const examIdFilter = req.query.examId ? Number(req.query.examId) : null;

      const scales = await getActiveGradeScales();

      const approvedMarks = await db
        .select({
          mark: marks,
          exam: exams,
          classRoom: classes,
          student: students,
        })
        .from(marks)
        .innerJoin(exams, eq(marks.examId, exams.id))
        .innerJoin(classes, eq(marks.classId, classes.id))
        .innerJoin(students, eq(marks.studentId, students.id))
        .where(eq(marks.status, 'approved'));

      const filtered = approvedMarks.filter((row) => {
        if (academicYearId && row.exam.academicYearId !== academicYearId)
          return false;
        if (termId && row.exam.termId !== termId) return false;
        if (gradeFilter && row.classRoom.grade !== gradeFilter) return false;
        if (classIdFilter && row.classRoom.id !== classIdFilter) return false;
        if (subjectIdFilter && row.mark.subjectId !== subjectIdFilter)
          return false;
        if (examIdFilter && row.exam.id !== examIdFilter) return false;
        return true;
      });

      const nonAbsent = filtered.filter(
        (r) => !r.mark.isAbsent && r.mark.marksObtained !== null
      );

      const overallAverage =
        nonAbsent.length > 0
          ? Number(
              (
                nonAbsent.reduce((acc, r) => acc + (r.mark.marksObtained || 0), 0) /
                nonAbsent.length
              ).toFixed(1)
            )
          : 0;

      const passCount = nonAbsent.filter(
        (r) => (r.mark.marksObtained || 0) >= 35
      ).length;
      const passPercentage =
        nonAbsent.length > 0
          ? Number(((passCount / nonAbsent.length) * 100).toFixed(1))
          : 0;

      // Grade-wise performance
      const gradeBuckets = new Map<number, number[]>();
      const classBuckets = new Map<string, number[]>();
      const subjectBuckets = new Map<string, number[]>();
      const examBuckets = new Map<string, number[]>();
      const gradeDist: Record<string, number> = {};
      for (const s of scales) gradeDist[s.gradeLetter] = 0;
      gradeDist['AB'] = 0;

      const studentTotals = new Map<
        number,
        {
          studentId: number;
          admissionNo: string;
          studentName: string;
          className: string;
          scores: number[];
        }
      >();

      for (const row of filtered) {
        const gl = row.mark.gradeLetter || (row.mark.isAbsent ? 'AB' : 'W');
        gradeDist[gl] = (gradeDist[gl] || 0) + 1;

        if (!row.mark.isAbsent && row.mark.marksObtained !== null) {
          const val = row.mark.marksObtained;
          if (!gradeBuckets.has(row.classRoom.grade))
            gradeBuckets.set(row.classRoom.grade, []);
          gradeBuckets.get(row.classRoom.grade)!.push(val);

          if (!classBuckets.has(row.classRoom.name))
            classBuckets.set(row.classRoom.name, []);
          classBuckets.get(row.classRoom.name)!.push(val);

          const subjLabel = `${row.mark.subjectCodeSnapshot} · ${row.mark.subjectNameSnapshot}`;
          if (!subjectBuckets.has(subjLabel)) subjectBuckets.set(subjLabel, []);
          subjectBuckets.get(subjLabel)!.push(val);

          if (!examBuckets.has(row.exam.name)) examBuckets.set(row.exam.name, []);
          examBuckets.get(row.exam.name)!.push(val);

          if (!studentTotals.has(row.student.id)) {
            studentTotals.set(row.student.id, {
              studentId: row.student.id,
              admissionNo: row.student.admissionNo,
              studentName: `${row.student.firstName} ${row.student.lastName}`,
              className: row.classRoom.name,
              scores: [],
            });
          }
          studentTotals.get(row.student.id)!.scores.push(val);
        }
      }

      const avg = (arr: number[]) =>
        arr.length > 0
          ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1))
          : 0;

      const studentAverages = Array.from(studentTotals.values()).map((s) => ({
        studentId: s.studentId,
        admissionNo: s.admissionNo,
        studentName: s.studentName,
        className: s.className,
        averageMarks: avg(s.scores),
        subjectsGraded: s.scores.length,
      }));

      const top10Students = [...studentAverages]
        .sort((a, b) => b.averageMarks - a.averageMarks)
        .slice(0, 10);

      const supportStudents = [...studentAverages]
        .filter((s) => s.averageMarks < 45)
        .sort((a, b) => a.averageMarks - b.averageMarks)
        .slice(0, 15);

      res.json({
        totalApprovedEntries: filtered.length,
        overallAverage,
        passPercentage,
        gradePerformance: Array.from(gradeBuckets.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([grade, scores]) => ({ label: `Grade ${grade}`, average: avg(scores) })),
        classComparison: Array.from(classBuckets.entries()).map(([label, scores]) => ({
          label,
          average: avg(scores),
        })),
        subjectAverages: Array.from(subjectBuckets.entries()).map(([label, scores]) => ({
          label,
          average: avg(scores),
        })),
        examTrends: Array.from(examBuckets.entries()).map(([label, scores]) => ({
          label,
          average: avg(scores),
        })),
        gradeDistribution: Object.entries(gradeDist).map(([label, count]) => ({
          label,
          count,
        })),
        top10Students,
        supportStudents,
      });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to compute official analytics.' });
    }
  }
);

// Low-latency Gemini 3.1 Flash Lite academic insight generator
router.post(
  '/ai/insight',
  requireAuth,
  requireRole('admin', 'teacher'),
  async (req, res) => {
    try {
      const mode =
        req.body?.mode === 'class_summary' ? 'class_summary' : 'student_remark';
      const context = req.body?.context || {};
      const text = await generateLowLatencyAcademicInsight({ mode, context });
      res.json({ text });
    } catch (error: unknown) {
      console.error('AI insight error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to generate AI insight.',
      });
    }
  }
);

export default router;
