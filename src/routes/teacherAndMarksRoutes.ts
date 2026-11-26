import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/index.ts';
import {
  academicYears,
  attendanceRecords,
  attendanceSessions,
  classes,
  enrollments,
  exams,
  markImportRows,
  markImports,
  reportRemarks,
  schoolHolidays,
  students,
  subjects,
  teacherAssignments,
  terms,
  users,
} from '../db/schema.ts';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import {
  confirmExcelImport,
  generateErrorReportBuffer,
  generateMarksTemplateBuffer,
  validateAndPreviewExcelUpload,
} from '../services/excelService.ts';
import {
  computeClassExamResults,
  getStudentAttendanceStats,
} from '../services/gradingService.ts';
import { logAudit } from '../lib/security.ts';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const validExt = file.originalname.toLowerCase().endsWith('.xlsx');
    const validMime =
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/octet-stream';
    if (!validExt || !validMime) {
      cb(new Error('Only valid .xlsx Excel workbooks are permitted.'));
      return;
    }
    cb(null, true);
  },
});

// Teacher assignments & student lists
router.get(
  '/teacher/assignments',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const isAdmin = req.authUser!.role === 'admin';
      if (isAdmin) {
        const allClasses = await db
          .select()
          .from(classes)
          .orderBy(asc(classes.grade), asc(classes.section));
        const allSubjects = await db
          .select()
          .from(subjects)
          .where(eq(subjects.isActive, true))
          .orderBy(asc(subjects.displayOrder));
        return res.json({ isAdmin: true, classes: allClasses, subjects: allSubjects, assignments: [] });
      }

      if (!req.authUser!.teacherId) {
        return res.json({ isAdmin: false, classes: [], subjects: [], assignments: [] });
      }

      const rows = await db
        .select({
          assignment: teacherAssignments,
          classRoom: classes,
          subject: subjects,
          year: academicYears,
        })
        .from(teacherAssignments)
        .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
        .innerJoin(subjects, eq(teacherAssignments.subjectId, subjects.id))
        .innerJoin(academicYears, eq(teacherAssignments.academicYearId, academicYears.id))
        .where(eq(teacherAssignments.teacherId, req.authUser!.teacherId));

      res.json({
        isAdmin: false,
        assignments: rows.map((r) => ({
          id: r.assignment.id,
          academicYearId: r.year.id,
          yearName: r.year.name,
          classId: r.classRoom.id,
          className: r.classRoom.name,
          grade: r.classRoom.grade,
          subjectId: r.subject.id,
          subjectCode: r.subject.code,
          subjectName: r.subject.name,
        })),
      });
    } catch (error) {
      console.error('Teacher assignments error:', error);
      res.status(500).json({ error: 'Failed to load teacher assignments.' });
    }
  }
);

router.get(
  '/teacher/students',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const classId = Number(req.query.classId);
      if (!classId) return res.status(400).json({ error: 'classId is required.' });

      if (req.authUser!.role === 'teacher') {
        const [assigned] = await db
          .select()
          .from(teacherAssignments)
          .where(
            and(
              eq(teacherAssignments.teacherId, req.authUser!.teacherId || -1),
              eq(teacherAssignments.classId, classId)
            )
          );
        const [classTeacher] = await db
          .select()
          .from(classes)
          .where(
            and(
              eq(classes.id, classId),
              eq(classes.classTeacherId, req.authUser!.teacherId || -1)
            )
          );
        if (!assigned && !classTeacher) {
          return res
            .status(403)
            .json({ error: 'Forbidden: You are not assigned to this class.' });
        }
      }

      const rows = await db
        .select({
          enrollment: enrollments,
          student: students,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')))
        .orderBy(asc(students.admissionNo));

      res.json({
        students: rows.map((r) => ({
          enrollmentId: r.enrollment.id,
          studentId: r.student.id,
          admissionNo: r.student.admissionNo,
          fullName: `${r.student.firstName} ${r.student.lastName}`,
          rollNo: r.enrollment.rollNo,
          gender: r.student.gender,
          guardianPhone: r.student.guardianPhone,
        })),
      });
    } catch (error) {
      console.error('Teacher students error:', error);
      res.status(500).json({ error: 'Failed to load class student list.' });
    }
  }
);

// Direct Excel Marks Template Download
router.get(
  '/excel/template',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const academicYearId = Number(req.query.academicYearId);
      const classId = Number(req.query.classId);
      const examId = Number(req.query.examId);
      const subjectId = Number(req.query.subjectId);

      if (!academicYearId || !classId || !examId || !subjectId) {
        return res.status(400).json({
          error: 'Academic Year, Class, Examination, and Subject are required.',
        });
      }

      const { buffer, filename } = await generateMarksTemplateBuffer({
        academicYearId,
        classId,
        examId,
        subjectId,
        teacherId: req.authUser!.teacherId,
        isAdmin: req.authUser!.role === 'admin',
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: unknown) {
      console.error('Excel template generation error:', error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate Excel template.',
      });
    }
  }
);

// Direct Excel Upload & Validation Preview
router.post(
  '/excel/preview',
  requireAuth,
  requireRole('teacher', 'admin'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Please upload a .xlsx Excel file.' });
      }
      const academicYearId = Number(req.body.academicYearId);
      const classId = Number(req.body.classId);
      const termId = Number(req.body.termId);
      const examId = Number(req.body.examId);
      const subjectId = Number(req.body.subjectId);

      if (!academicYearId || !classId || !termId || !examId || !subjectId) {
        return res.status(400).json({
          error: 'Academic Year, Class, Term, Examination, and Subject are required.',
        });
      }

      const preview = await validateAndPreviewExcelUpload({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        teacherUserId: req.authUser!.id,
        teacherId: req.authUser!.teacherId,
        isAdmin: req.authUser!.role === 'admin',
        academicYearId,
        classId,
        termId,
        examId,
        subjectId,
      });

      res.json(preview);
    } catch (error: unknown) {
      console.error('Excel preview error:', error);
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Failed to validate Excel file.',
      });
    }
  }
);

// Confirm & Commit Validated Excel Marks
router.post(
  '/excel/confirm',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const importId = Number(req.body?.importId);
      const allowOverwriteApproved = Boolean(req.body?.allowOverwriteApproved);
      if (!importId) {
        return res.status(400).json({ error: 'importId is required.' });
      }

      const result = await confirmExcelImport({
        importId,
        userId: req.authUser!.id,
        userEmail: req.authUser!.email,
        userRole: req.authUser!.role,
        isAdmin: req.authUser!.role === 'admin',
        allowOverwriteApproved,
        ipAddress: req.ip,
      });

      res.json(result);
    } catch (error: unknown) {
      console.error('Excel confirm error:', error);
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Failed to save marks import.',
      });
    }
  }
);

// Teacher Import History
router.get(
  '/excel/imports',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select({
          imp: markImports,
          year: academicYears,
          classRoom: classes,
          term: terms,
          exam: exams,
          subject: subjects,
          teacherUser: {
            fullName: users.fullName,
          },
        })
        .from(markImports)
        .innerJoin(academicYears, eq(markImports.academicYearId, academicYears.id))
        .innerJoin(classes, eq(markImports.classId, classes.id))
        .innerJoin(terms, eq(markImports.termId, terms.id))
        .innerJoin(exams, eq(markImports.examId, exams.id))
        .innerJoin(subjects, eq(markImports.subjectId, subjects.id))
        .innerJoin(users, eq(markImports.teacherUserId, users.id))
        .where(
          req.authUser!.role === 'admin'
            ? undefined
            : eq(markImports.teacherUserId, req.authUser!.id)
        )
        .orderBy(desc(markImports.createdAt))
        .limit(50);

      res.json({
        imports: rows.map((r) => ({
          id: r.imp.id,
          teacherName: r.teacherUser.fullName,
          academicYear: r.year.name,
          className: r.classRoom.name,
          grade: r.classRoom.grade,
          termName: r.term.name,
          examName: r.exam.name,
          subjectCode: r.subject.code,
          subjectName: r.subject.name,
          originalFilename: r.imp.originalFilename,
          totalRows: r.imp.totalRows,
          validRows: r.imp.validRows,
          invalidRows: r.imp.invalidRows,
          importStatus: r.imp.importStatus,
          approvalStatus: r.imp.approvalStatus,
          adminNotes: r.imp.adminNotes,
          createdAt: r.imp.createdAt,
        })),
      });
    } catch (error) {
      console.error('Excel history error:', error);
      res.status(500).json({ error: 'Failed to load import history.' });
    }
  }
);

router.get(
  '/excel/imports/:id/details',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [imp] = await db
        .select()
        .from(markImports)
        .where(eq(markImports.id, id));
      if (!imp) return res.status(404).json({ error: 'Import not found.' });
      if (req.authUser!.role !== 'admin' && imp.teacherUserId !== req.authUser!.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await db
        .select()
        .from(markImportRows)
        .where(eq(markImportRows.importId, id))
        .orderBy(asc(markImportRows.rowNumber));

      res.json({ importRecord: imp, rows });
    } catch (error) {
      console.error('Import details error:', error);
      res.status(500).json({ error: 'Failed to load import details.' });
    }
  }
);

router.get(
  '/excel/imports/:id/error-report',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [imp] = await db
        .select()
        .from(markImports)
        .where(eq(markImports.id, id));
      if (!imp) return res.status(404).json({ error: 'Import not found.' });
      if (req.authUser!.role !== 'admin' && imp.teacherUserId !== req.authUser!.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { buffer, filename } = await generateErrorReportBuffer(id);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Error report download failed:', error);
      res.status(500).json({ error: 'Failed to generate error report.' });
    }
  }
);

router.get(
  '/excel/imports/:id/download',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [imp] = await db
        .select()
        .from(markImports)
        .where(eq(markImports.id, id));
      if (!imp || !imp.uploadedFileBase64) {
        return res.status(404).json({ error: 'Uploaded file not found.' });
      }
      if (req.authUser!.role !== 'admin' && imp.teacherUserId !== req.authUser!.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const buf = Buffer.from(imp.uploadedFileBase64, 'base64');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${imp.originalFilename}"`
      );
      res.send(buf);
    } catch (error) {
      console.error('Download original Excel error:', error);
      res.status(500).json({ error: 'Failed to download original file.' });
    }
  }
);

// Attendance Management
router.get(
  '/attendance/session',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const classId = Number(req.query.classId);
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      if (!classId) return res.status(400).json({ error: 'classId is required.' });

      const [classRoom] = await db
        .select()
        .from(classes)
        .where(eq(classes.id, classId));
      if (!classRoom) return res.status(404).json({ error: 'Class not found.' });

      const [holiday] = await db
        .select()
        .from(schoolHolidays)
        .where(
          and(
            eq(schoolHolidays.academicYearId, classRoom.academicYearId),
            eq(schoolHolidays.holidayDate, date)
          )
        );

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
            eq(enrollments.academicYearId, classRoom.academicYearId),
            eq(enrollments.status, 'active')
          )
        )
        .orderBy(asc(students.admissionNo));

      const [existingSession] = await db
        .select()
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.classId, classId),
            eq(attendanceSessions.sessionDate, date)
          )
        );

      const existingRecords = existingSession
        ? await db
            .select()
            .from(attendanceRecords)
            .where(eq(attendanceRecords.sessionId, existingSession.id))
        : [];
      const recMap = new Map<number, typeof attendanceRecords.$inferSelect>();
      for (const r of existingRecords) recMap.set(r.studentId, r);

      res.json({
        classRoom,
        date,
        isHoliday: Boolean(holiday || existingSession?.isHoliday),
        holidayTitle: holiday?.title || null,
        sessionExists: Boolean(existingSession),
        students: classEnrollments.map(({ enrollment, student }) => {
          const rec = recMap.get(student.id);
          return {
            studentId: student.id,
            enrollmentId: enrollment.id,
            admissionNo: student.admissionNo,
            studentName: `${student.firstName} ${student.lastName}`,
            status: rec?.status || 'present',
            remarks: rec?.remarks || '',
          };
        }),
      });
    } catch (error) {
      console.error('Get attendance session error:', error);
      res.status(500).json({ error: 'Failed to load attendance sheet.' });
    }
  }
);

router.post(
  '/attendance/session',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const classId = Number(req.body?.classId);
      const date = String(req.body?.date || '');
      const termId = req.body?.termId ? Number(req.body.termId) : null;
      const records: Array<{
        studentId: number;
        enrollmentId: number;
        status: string;
        remarks?: string;
      }> = Array.isArray(req.body?.records) ? req.body.records : [];

      if (!classId || !date || records.length === 0) {
        return res
          .status(400)
          .json({ error: 'Class, date, and attendance records are required.' });
      }

      const [classRoom] = await db
        .select()
        .from(classes)
        .where(eq(classes.id, classId));
      if (!classRoom) return res.status(404).json({ error: 'Class not found.' });

      const [holiday] = await db
        .select()
        .from(schoolHolidays)
        .where(
          and(
            eq(schoolHolidays.academicYearId, classRoom.academicYearId),
            eq(schoolHolidays.holidayDate, date)
          )
        );
      if (holiday) {
        return res.status(400).json({
          error: `Cannot mark regular attendance on a declared school holiday (${holiday.title}).`,
        });
      }

      await db.transaction(async (tx) => {
        const [session] = await tx
          .insert(attendanceSessions)
          .values({
            classId,
            academicYearId: classRoom.academicYearId,
            termId,
            sessionDate: date,
            takenBy: req.authUser!.id,
            isHoliday: false,
          })
          .onConflictDoUpdate({
            target: [attendanceSessions.classId, attendanceSessions.sessionDate],
            set: { takenBy: req.authUser!.id, termId },
          })
          .returning();

        for (const r of records) {
          if (!['present', 'absent', 'late', 'excused'].includes(r.status)) {
            throw new Error(`Invalid attendance status "${r.status}".`);
          }
          await tx
            .insert(attendanceRecords)
            .values({
              sessionId: session.id,
              studentId: Number(r.studentId),
              enrollmentId: Number(r.enrollmentId),
              status: r.status,
              remarks: r.remarks || null,
            })
            .onConflictDoUpdate({
              target: [attendanceRecords.sessionId, attendanceRecords.studentId],
              set: { status: r.status, remarks: r.remarks || null },
            });
        }
      });

      await logAudit({
        userId: req.authUser!.id,
        userEmail: req.authUser!.email,
        userRole: req.authUser!.role,
        action: 'SAVE_ATTENDANCE',
        entityType: 'attendance_sessions',
        entityId: `${classId}:${date}`,
        details: { count: records.length },
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Save attendance error:', error);
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Failed to save attendance.',
      });
    }
  }
);

router.get(
  '/attendance/class-summary',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req, res) => {
    try {
      const classId = Number(req.query.classId);
      const termId = req.query.termId ? Number(req.query.termId) : null;
      if (!classId) return res.status(400).json({ error: 'classId is required.' });

      const [classRoom] = await db
        .select()
        .from(classes)
        .where(eq(classes.id, classId));
      if (!classRoom) return res.status(404).json({ error: 'Class not found.' });

      const classEnrollments = await db
        .select({ enrollment: enrollments, student: students })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .where(eq(enrollments.classId, classId))
        .orderBy(asc(students.admissionNo));

      const summary = await Promise.all(
        classEnrollments.map(async ({ student }) => {
          const stats = await getStudentAttendanceStats(
            student.id,
            classRoom.academicYearId,
            termId
          );
          return {
            studentId: student.id,
            admissionNo: student.admissionNo,
            studentName: `${student.firstName} ${student.lastName}`,
            ...stats,
          };
        })
      );

      res.json({ summary });
    } catch (error) {
      console.error('Class attendance summary error:', error);
      res.status(500).json({ error: 'Failed to load attendance summary.' });
    }
  }
);

// Class Examination Results & Remarks
router.get(
  '/results/class',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const examId = Number(req.query.examId);
      const classId = Number(req.query.classId);
      if (!examId || !classId) {
        return res.status(400).json({ error: 'examId and classId are required.' });
      }
      const data = await computeClassExamResults(examId, classId, {
        approvedOnly: false,
      });
      res.json(data);
    } catch (error) {
      console.error('Class results error:', error);
      res.status(500).json({ error: 'Failed to load class results.' });
    }
  }
);

router.post(
  '/results/remarks',
  requireAuth,
  requireRole('teacher', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const examId = Number(req.body?.examId);
      const enrollmentId = Number(req.body?.enrollmentId);
      const teacherRemarks =
        req.body?.teacherRemarks !== undefined
          ? String(req.body.teacherRemarks)
          : undefined;
      const principalRemarks =
        req.authUser!.role === 'admin' && req.body?.principalRemarks !== undefined
          ? String(req.body.principalRemarks)
          : undefined;

      if (!examId || !enrollmentId) {
        return res
          .status(400)
          .json({ error: 'examId and enrollmentId are required.' });
      }

      const [existing] = await db
        .select()
        .from(reportRemarks)
        .where(
          and(
            eq(reportRemarks.examId, examId),
            eq(reportRemarks.enrollmentId, enrollmentId)
          )
        );

      if (existing) {
        const [updated] = await db
          .update(reportRemarks)
          .set({
            ...(teacherRemarks !== undefined ? { teacherRemarks } : {}),
            ...(principalRemarks !== undefined ? { principalRemarks } : {}),
            updatedBy: req.authUser!.id,
            updatedAt: new Date(),
          })
          .where(eq(reportRemarks.id, existing.id))
          .returning();
        return res.json({ remark: updated });
      }

      const [created] = await db
        .insert(reportRemarks)
        .values({
          examId,
          enrollmentId,
          teacherRemarks: teacherRemarks ?? null,
          principalRemarks: principalRemarks ?? null,
          updatedBy: req.authUser!.id,
        })
        .returning();

      res.status(201).json({ remark: created });
    } catch (error) {
      console.error('Save remarks error:', error);
      res.status(500).json({ error: 'Failed to save remarks.' });
    }
  }
);

export default router;
