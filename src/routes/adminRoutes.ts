import { Router } from 'express';
import { db } from '../db/index.ts';
import {
  academicYears,
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  classes,
  enrollments,
  examSubjects,
  exams,
  gradeScales,
  gradeSubjects,
  markImports,
  marks,
  notifications,
  parentStudent,
  parents,
  schoolHolidays,
  schoolSettings,
  studentSubjects,
  students,
  subjects,
  teacherAssignments,
  teachers,
  terms,
  users,
} from '../db/schema.ts';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { hashPassword, logAudit } from '../lib/security.ts';

const router = Router();

// Shared read endpoints (accessible to authenticated users)
router.get('/academic-structure', requireAuth, async (_req, res) => {
  try {
    const [yearsList, termsList, classesList, subjectsList, gradeSubjList, scalesList, holidaysList] =
      await Promise.all([
        db.select().from(academicYears).orderBy(desc(academicYears.name)),
        db.select().from(terms).orderBy(asc(terms.termNumber)),
        db.select().from(classes).orderBy(asc(classes.grade), asc(classes.section)),
        db.select().from(subjects).orderBy(asc(subjects.displayOrder)),
        db.select().from(gradeSubjects),
        db.select().from(gradeScales).orderBy(asc(gradeScales.displayOrder)),
        db.select().from(schoolHolidays).orderBy(asc(schoolHolidays.holidayDate)),
      ]);

    res.json({
      academicYears: yearsList,
      terms: termsList,
      classes: classesList,
      subjects: subjectsList,
      gradeSubjects: gradeSubjList,
      gradeScales: scalesList,
      holidays: holidaysList,
    });
  } catch (error) {
    console.error('Failed to load academic structure:', error);
    res.status(500).json({ error: 'Failed to load academic structure.' });
  }
});

router.get('/exams', requireAuth, async (_req, res) => {
  try {
    const examsList = await db
      .select()
      .from(exams)
      .orderBy(desc(exams.examDate), desc(exams.id));
    const examSubjs = await db.select().from(examSubjects);
    res.json({ exams: examsList, examSubjects: examSubjs });
  } catch (error) {
    console.error('Failed to load exams:', error);
    res.status(500).json({ error: 'Failed to load examinations.' });
  }
});

router.post('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Notification update error:', error);
    res.status(500).json({ error: 'Failed to mark notification read.' });
  }
});

// ADMIN-ONLY ENDPOINTS
router.use('/admin', requireAuth, requireRole('admin'));

router.get('/admin/stats', async (_req, res) => {
  try {
    const [
      [{ value: totalStudents }],
      [{ value: totalTeachers }],
      [{ value: totalClasses }],
      [{ value: activeSubjects }],
      [{ value: totalParents }],
      [{ value: pendingImports }],
      [{ value: approvedImports }],
      [{ value: totalMarks }],
      [{ value: approvedMarks }],
    ] = await Promise.all([
      db.select({ value: count() }).from(students),
      db.select({ value: count() }).from(teachers),
      db.select({ value: count() }).from(classes),
      db.select({ value: count() }).from(subjects).where(eq(subjects.isActive, true)),
      db.select({ value: count() }).from(parents),
      db
        .select({ value: count() })
        .from(markImports)
        .where(eq(markImports.approvalStatus, 'pending')),
      db
        .select({ value: count() })
        .from(markImports)
        .where(eq(markImports.approvalStatus, 'approved')),
      db.select({ value: count() }).from(marks),
      db.select({ value: count() }).from(marks).where(eq(marks.status, 'approved')),
    ]);

    const attRecords = await db
      .select({ status: attendanceRecords.status })
      .from(attendanceRecords);
    const totalAtt = attRecords.length;
    const attendedCount = attRecords.filter(
      (r) => r.status === 'present' || r.status === 'late' || r.status === 'excused'
    ).length;
    const attendancePercentage =
      totalAtt > 0 ? Number(((attendedCount / totalAtt) * 100).toFixed(1)) : 0;

    res.json({
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects: activeSubjects,
      totalParents,
      attendancePercentage,
      pendingApprovals: pendingImports,
      approvedImports,
      marksApprovalRate:
        totalMarks > 0 ? Math.round((approvedMarks / totalMarks) * 100) : 0,
      totalMarks,
      approvedMarks,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard statistics.' });
  }
});

// Users & Accounts
router.get('/admin/users', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        loginId: users.loginId,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    res.json({ users: rows });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to load user accounts.' });
  }
});

router.patch('/admin/users/:id/toggle-active', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.authUser!.id) {
      return res
        .status(400)
        .json({ error: 'You cannot deactivate your own admin account.' });
    }
    const [target] = await db.select().from(users).where(eq(users.id, id));
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const [updated] = await db
      .update(users)
      .set({ isActive: !target.isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: updated.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entityType: 'users',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ user: updated });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ error: 'Failed to update account status.' });
  }
});

router.post('/admin/users/:id/reset-password', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 4) {
      return res
        .status(400)
        .json({ error: 'Password or PIN must be at least 4 characters.' });
    }
    await db
      .update(users)
      .set({
        passwordHash: hashPassword(newPassword),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'ADMIN_RESET_PASSWORD',
      entityType: 'users',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: 'Failed to reset user password.' });
  }
});

// Create Admin User directly
router.post('/admin/users', async (req: AuthRequest, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const fullName = String(req.body?.fullName || '').trim();
    const role = String(req.body?.role || 'admin');
    const password = String(req.body?.password || '');

    if (!email || !fullName) {
      return res.status(400).json({ error: 'Email and full name are required.' });
    }
    if (!['admin', 'teacher', 'student', 'parent'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    const [created] = await db
      .insert(users)
      .values({
        email,
        fullName,
        role,
        passwordHash: password ? hashPassword(password) : null,
        isActive: true,
      })
      .returning();

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'CREATE_USER',
      entityType: 'users',
      entityId: created.id,
      details: { email, role },
      ipAddress: req.ip,
    });

    res.status(201).json({ user: created });
  } catch (error: unknown) {
    console.error('Create user error:', error);
    res.status(400).json({ error: 'Email already exists or invalid user data.' });
  }
});

// Students & Enrollments
router.get('/admin/students', async (_req, res) => {
  try {
    const studentList = await db
      .select({
        student: students,
        user: {
          id: users.id,
          email: users.email,
          loginId: users.loginId,
          isActive: users.isActive,
        },
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .orderBy(asc(students.admissionNo));

    const enrollmentList = await db
      .select({
        enrollment: enrollments,
        classRoom: classes,
      })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id));

    const ssList = await db.select().from(studentSubjects);

    res.json({
      students: studentList.map((row) => ({
        ...row.student,
        email: row.user.email,
        loginId: row.user.loginId,
        isActive: row.user.isActive,
        enrollments: enrollmentList
          .filter((e) => e.enrollment.studentId === row.student.id)
          .map((e) => ({
            ...e.enrollment,
            className: e.classRoom.name,
            subjectIds: ssList
              .filter((ss) => ss.enrollmentId === e.enrollment.id)
              .map((ss) => ss.subjectId),
          })),
      })),
    });
  } catch (error) {
    console.error('List students error:', error);
    res.status(500).json({ error: 'Failed to load students.' });
  }
});

router.post('/admin/students', async (req: AuthRequest, res) => {
  try {
    const {
      admissionNo,
      firstName,
      lastName,
      email,
      pinOrPassword,
      dateOfBirth,
      gender,
      guardianPhone,
      address,
      classId,
      academicYearId,
      subjectIds,
    } = req.body;

    const cleanAdmission = String(admissionNo || '').trim().toUpperCase();
    const cleanEmail = String(email || `${cleanAdmission.toLowerCase()}@student.acadexia.edu`)
      .toLowerCase()
      .trim();

    if (!cleanAdmission || !firstName || !lastName || !pinOrPassword) {
      return res.status(400).json({
        error: 'Admission ID, First Name, Last Name, and Password/PIN are required.',
      });
    }

    const result = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          email: cleanEmail,
          loginId: cleanAdmission,
          passwordHash: hashPassword(String(pinOrPassword)),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          role: 'student',
          isActive: true,
        })
        .returning();

      const [studentRow] = await tx
        .insert(students)
        .values({
          userId: userRow.id,
          admissionNo: cleanAdmission,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: dateOfBirth || null,
          gender: gender || null,
          guardianPhone: guardianPhone || null,
          address: address || null,
          admissionDate: new Date().toISOString().slice(0, 10),
          status: 'active',
        })
        .returning();

      if (classId && academicYearId) {
        const [cls] = await tx
          .select()
          .from(classes)
          .where(eq(classes.id, Number(classId)));
        if (!cls) throw new Error('Selected class not found.');

        const [enrollment] = await tx
          .insert(enrollments)
          .values({
            studentId: studentRow.id,
            classId: cls.id,
            academicYearId: Number(academicYearId),
            grade: cls.grade,
            status: 'active',
          })
          .returning();

        // Assign compulsory subjects or explicit subjectIds
        let targetSubjectIds: number[] = Array.isArray(subjectIds)
          ? subjectIds.map(Number)
          : [];
        if (targetSubjectIds.length === 0) {
          const comp = await tx
            .select()
            .from(gradeSubjects)
            .where(
              and(
                eq(gradeSubjects.grade, cls.grade),
                eq(gradeSubjects.academicYearId, Number(academicYearId)),
                eq(gradeSubjects.isCompulsory, true)
              )
            );
          targetSubjectIds = comp.map((c) => c.subjectId);
        }

        if (targetSubjectIds.length > 0) {
          await tx.insert(studentSubjects).values(
            targetSubjectIds.map((sid) => ({
              enrollmentId: enrollment.id,
              subjectId: sid,
            }))
          );
        }
      }

      return { userRow, studentRow };
    });

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'CREATE_STUDENT',
      entityType: 'students',
      entityId: result.studentRow.id,
      details: { admissionNo: cleanAdmission },
      ipAddress: req.ip,
    });

    res.status(201).json({ student: result.studentRow });
  } catch (error: unknown) {
    console.error('Create student error:', error);
    const msg =
      error instanceof Error ? error.message : 'Duplicate Admission ID or Email.';
    res.status(400).json({ error: msg });
  }
});

router.put('/admin/enrollments/:id/subjects', async (req: AuthRequest, res) => {
  try {
    const enrollmentId = Number(req.params.id);
    const subjectIds: number[] = Array.isArray(req.body?.subjectIds)
      ? req.body.subjectIds.map(Number)
      : [];

    await db.transaction(async (tx) => {
      await tx
        .delete(studentSubjects)
        .where(eq(studentSubjects.enrollmentId, enrollmentId));
      if (subjectIds.length > 0) {
        await tx.insert(studentSubjects).values(
          subjectIds.map((sid) => ({
            enrollmentId,
            subjectId: sid,
          }))
        );
      }
    });

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'UPDATE_STUDENT_SUBJECTS',
      entityType: 'enrollments',
      entityId: enrollmentId,
      details: { subjectIds },
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update student subjects error:', error);
    res.status(500).json({ error: 'Failed to update student subjects.' });
  }
});

router.post('/admin/enrollments', async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.body?.studentId);
    const classId = Number(req.body?.classId);
    const academicYearId = Number(req.body?.academicYearId);
    const rollNo = req.body?.rollNo ? String(req.body.rollNo) : null;

    const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
    if (!cls) return res.status(404).json({ error: 'Class not found.' });

    const [enrollment] = await db
      .insert(enrollments)
      .values({
        studentId,
        classId,
        academicYearId,
        grade: cls.grade,
        rollNo,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [enrollments.studentId, enrollments.academicYearId],
        set: { classId, grade: cls.grade, rollNo },
      })
      .returning();

    res.status(201).json({ enrollment });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(400).json({ error: 'Failed to save enrollment.' });
  }
});

// Teachers & Assignments
router.get('/admin/teachers', async (_req, res) => {
  try {
    const teacherRows = await db
      .select({
        teacher: teachers,
        user: {
          id: users.id,
          email: users.email,
          loginId: users.loginId,
          isActive: users.isActive,
        },
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .orderBy(asc(teachers.employeeNo));

    const assignments = await db
      .select({
        assignment: teacherAssignments,
        classRoom: classes,
        subject: subjects,
        year: academicYears,
      })
      .from(teacherAssignments)
      .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
      .innerJoin(subjects, eq(teacherAssignments.subjectId, subjects.id))
      .innerJoin(academicYears, eq(teacherAssignments.academicYearId, academicYears.id));

    res.json({
      teachers: teacherRows.map((r) => ({
        ...r.teacher,
        email: r.user.email,
        loginId: r.user.loginId,
        isActive: r.user.isActive,
        assignments: assignments
          .filter((a) => a.assignment.teacherId === r.teacher.id)
          .map((a) => ({
            id: a.assignment.id,
            classId: a.classRoom.id,
            className: a.classRoom.name,
            grade: a.classRoom.grade,
            subjectId: a.subject.id,
            subjectCode: a.subject.code,
            subjectName: a.subject.name,
            academicYearId: a.year.id,
            yearName: a.year.name,
          })),
      })),
    });
  } catch (error) {
    console.error('List teachers error:', error);
    res.status(500).json({ error: 'Failed to load teachers.' });
  }
});

router.post('/admin/teachers', async (req: AuthRequest, res) => {
  try {
    const {
      employeeNo,
      firstName,
      lastName,
      email,
      password,
      phone,
      qualification,
      specialization,
    } = req.body;
    const cleanEmp = String(employeeNo || '').trim().toUpperCase();
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmp || !firstName || !lastName || !cleanEmail || !password) {
      return res.status(400).json({
        error: 'Employee ID, name, email, and password are required.',
      });
    }

    const created = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          email: cleanEmail,
          loginId: cleanEmp,
          passwordHash: hashPassword(String(password)),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          role: 'teacher',
          isActive: true,
        })
        .returning();

      const [teacherRow] = await tx
        .insert(teachers)
        .values({
          userId: userRow.id,
          employeeNo: cleanEmp,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone || null,
          qualification: qualification || null,
          specialization: specialization || null,
          status: 'active',
        })
        .returning();

      return teacherRow;
    });

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'CREATE_TEACHER',
      entityType: 'teachers',
      entityId: created.id,
      details: { employeeNo: cleanEmp, email: cleanEmail },
      ipAddress: req.ip,
    });

    res.status(201).json({ teacher: created });
  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(400).json({ error: 'Employee ID or email already exists.' });
  }
});

router.post('/admin/teacher-assignments', async (req: AuthRequest, res) => {
  try {
    const teacherId = Number(req.body?.teacherId);
    const classId = Number(req.body?.classId);
    const subjectId = Number(req.body?.subjectId);
    const academicYearId = Number(req.body?.academicYearId);

    const [created] = await db
      .insert(teacherAssignments)
      .values({ teacherId, classId, subjectId, academicYearId })
      .returning();

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'ASSIGN_TEACHER',
      entityType: 'teacher_assignments',
      entityId: created.id,
      details: { teacherId, classId, subjectId, academicYearId },
      ipAddress: req.ip,
    });

    res.status(201).json({ assignment: created });
  } catch (error) {
    console.error('Assign teacher error:', error);
    res.status(400).json({ error: 'Teacher is already assigned to this class and subject.' });
  }
});

router.delete('/admin/teacher-assignments/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(teacherAssignments).where(eq(teacherAssignments.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ error: 'Failed to remove assignment.' });
  }
});

// Parents & Parent-Student Links
router.get('/admin/parents', async (_req, res) => {
  try {
    const parentRows = await db
      .select({
        parent: parents,
        user: {
          id: users.id,
          isActive: users.isActive,
          loginId: users.loginId,
        },
      })
      .from(parents)
      .innerJoin(users, eq(parents.userId, users.id))
      .orderBy(asc(parents.firstName));

    const links = await db
      .select({
        link: parentStudent,
        student: students,
      })
      .from(parentStudent)
      .innerJoin(students, eq(parentStudent.studentId, students.id));

    res.json({
      parents: parentRows.map((p) => ({
        ...p.parent,
        isActive: p.user.isActive,
        loginId: p.user.loginId,
        children: links
          .filter((l) => l.link.parentId === p.parent.id)
          .map((l) => ({
            linkId: l.link.id,
            studentId: l.student.id,
            admissionNo: l.student.admissionNo,
            studentName: `${l.student.firstName} ${l.student.lastName}`,
            relationship: l.link.relationship,
          })),
      })),
    });
  } catch (error) {
    console.error('List parents error:', error);
    res.status(500).json({ error: 'Failed to load parents.' });
  }
});

router.post('/admin/parents', async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, password, occupation, studentIds, relationship } =
      req.body;
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!firstName || !lastName || !cleanEmail || !password) {
      return res
        .status(400)
        .json({ error: 'First name, last name, email, and password are required.' });
    }

    const parentRow = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          email: cleanEmail,
          loginId: cleanEmail,
          passwordHash: hashPassword(String(password)),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          role: 'parent',
          isActive: true,
        })
        .returning();

      const [pr] = await tx
        .insert(parents)
        .values({
          userId: userRow.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: cleanEmail,
          phone: phone || null,
          occupation: occupation || null,
        })
        .returning();

      if (Array.isArray(studentIds) && studentIds.length > 0) {
        await tx.insert(parentStudent).values(
          studentIds.map((sid: number) => ({
            parentId: pr.id,
            studentId: Number(sid),
            relationship: relationship || 'Guardian',
          }))
        );
      }

      return pr;
    });

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'CREATE_PARENT',
      entityType: 'parents',
      entityId: parentRow.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ parent: parentRow });
  } catch (error) {
    console.error('Create parent error:', error);
    res.status(400).json({ error: 'Parent email already exists.' });
  }
});

router.post('/admin/parent-links', async (req, res) => {
  try {
    const parentId = Number(req.body?.parentId);
    const studentId = Number(req.body?.studentId);
    const relationship = String(req.body?.relationship || 'Guardian');
    const [link] = await db
      .insert(parentStudent)
      .values({ parentId, studentId, relationship })
      .returning();
    res.status(201).json({ link });
  } catch (error) {
    console.error('Link parent-student error:', error);
    res.status(400).json({ error: 'Child already linked to this parent.' });
  }
});

router.delete('/admin/parent-links/:id', async (req, res) => {
  try {
    await db.delete(parentStudent).where(eq(parentStudent.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Unlink parent-student error:', error);
    res.status(500).json({ error: 'Failed to unlink child.' });
  }
});

// Academic Years, Terms, Classes
router.post('/admin/academic-years', async (req: AuthRequest, res) => {
  try {
    const { name, startDate, endDate, isCurrent } = req.body;
    const yr = await db.transaction(async (tx) => {
      if (isCurrent) {
        await tx.update(academicYears).set({ isCurrent: false });
      }
      const [created] = await tx
        .insert(academicYears)
        .values({ name: String(name).trim(), startDate, endDate, isCurrent: Boolean(isCurrent) })
        .returning();
      return created;
    });
    res.status(201).json({ academicYear: yr });
  } catch (error) {
    console.error('Create academic year error:', error);
    res.status(400).json({ error: 'Academic year name already exists.' });
  }
});

router.post('/admin/terms', async (req, res) => {
  try {
    const { academicYearId, name, termNumber, startDate, endDate, isActive } = req.body;
    const [term] = await db
      .insert(terms)
      .values({
        academicYearId: Number(academicYearId),
        name: String(name).trim(),
        termNumber: Number(termNumber),
        startDate,
        endDate,
        isActive: Boolean(isActive),
      })
      .returning();
    res.status(201).json({ term });
  } catch (error) {
    console.error('Create term error:', error);
    res.status(400).json({ error: 'Term number already exists for this academic year.' });
  }
});

router.post('/admin/classes', async (req, res) => {
  try {
    const academicYearId = Number(req.body?.academicYearId);
    const grade = Number(req.body?.grade);
    const section = String(req.body?.section || '').trim().toUpperCase();
    const capacity = Number(req.body?.capacity || 40);
    const classTeacherId = req.body?.classTeacherId
      ? Number(req.body.classTeacherId)
      : null;

    if (grade < 6 || grade > 13) {
      return res.status(400).json({ error: 'Grade must be between 6 and 13.' });
    }
    if (!section) {
      return res.status(400).json({ error: 'Section is required (e.g. A, B, C).' });
    }

    const [created] = await db
      .insert(classes)
      .values({
        academicYearId,
        grade,
        section,
        name: `Grade ${grade} - ${section}`,
        classTeacherId,
        capacity,
      })
      .returning();

    res.status(201).json({ classRoom: created });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(400).json({ error: 'Class already exists for this grade and year.' });
  }
});

// 12 Configurable Subjects + Grade Subjects
router.patch('/admin/subjects/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { code, name, description, isActive } = req.body;

    const [updated] = await db
      .update(subjects)
      .set({
        ...(code !== undefined ? { code: String(code).trim().toUpperCase() } : {}),
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, id))
      .returning();

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'UPDATE_SUBJECT',
      entityType: 'subjects',
      entityId: id,
      details: { code: updated.code, name: updated.name, isActive: updated.isActive },
      ipAddress: req.ip,
    });

    res.json({ subject: updated });
  } catch (error) {
    console.error('Update subject error:', error);
    res.status(400).json({ error: 'Subject code must be unique.' });
  }
});

router.put('/admin/grade-subjects', async (req: AuthRequest, res) => {
  try {
    const academicYearId = Number(req.body?.academicYearId);
    const grade = Number(req.body?.grade);
    const items: Array<{ subjectId: number; isCompulsory: boolean }> = Array.isArray(
      req.body?.items
    )
      ? req.body.items
      : [];

    await db.transaction(async (tx) => {
      await tx
        .delete(gradeSubjects)
        .where(
          and(
            eq(gradeSubjects.academicYearId, academicYearId),
            eq(gradeSubjects.grade, grade)
          )
        );
      if (items.length > 0) {
        await tx.insert(gradeSubjects).values(
          items.map((item) => ({
            academicYearId,
            grade,
            subjectId: Number(item.subjectId),
            isCompulsory: Boolean(item.isCompulsory),
          }))
        );
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update grade subjects error:', error);
    res.status(500).json({ error: 'Failed to update grade subject mapping.' });
  }
});

// Examinations & Exam Subjects
router.post('/admin/exams', async (req: AuthRequest, res) => {
  try {
    const { academicYearId, termId, name, examDate, status } = req.body;
    if (!academicYearId || !termId || !name || !examDate) {
      return res.status(400).json({ error: 'All examination fields are required.' });
    }
    const [exam] = await db
      .insert(exams)
      .values({
        academicYearId: Number(academicYearId),
        termId: Number(termId),
        name: String(name).trim(),
        examDate: String(examDate),
        status: status || 'open',
      })
      .returning();

    // Auto-populate examSubjects from grade_subjects for this academic year
    const gsRows = await db
      .select({
        gs: gradeSubjects,
        subj: subjects,
      })
      .from(gradeSubjects)
      .innerJoin(subjects, eq(gradeSubjects.subjectId, subjects.id))
      .where(
        and(
          eq(gradeSubjects.academicYearId, Number(academicYearId)),
          eq(subjects.isActive, true)
        )
      );

    if (gsRows.length > 0) {
      await db.insert(examSubjects).values(
        gsRows.map((row) => ({
          examId: exam.id,
          grade: row.gs.grade,
          subjectId: row.gs.subjectId,
          maxMarks: 100,
          passMarks: 35,
        }))
      );
    }

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'CREATE_EXAM',
      entityType: 'exams',
      entityId: exam.id,
      details: { name: exam.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ exam });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ error: 'Failed to create examination.' });
  }
});

router.patch('/admin/exams/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status, name } = req.body;
    const [updated] = await db
      .update(exams)
      .set({
        ...(status ? { status } : {}),
        ...(name ? { name: String(name).trim() } : {}),
        ...(status === 'published' ? { publishedAt: new Date() } : {}),
      })
      .where(eq(exams.id, id))
      .returning();
    res.json({ exam: updated });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ error: 'Failed to update examination.' });
  }
});

router.put('/admin/exams/:id/subjects', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const grade = Number(req.body?.grade);
    const configs: Array<{ subjectId: number; maxMarks: number; passMarks: number }> =
      Array.isArray(req.body?.subjects) ? req.body.subjects : [];

    await db.transaction(async (tx) => {
      await tx
        .delete(examSubjects)
        .where(and(eq(examSubjects.examId, examId), eq(examSubjects.grade, grade)));
      if (configs.length > 0) {
        await tx.insert(examSubjects).values(
          configs.map((c) => ({
            examId,
            grade,
            subjectId: Number(c.subjectId),
            maxMarks: Number(c.maxMarks) || 100,
            passMarks: Number(c.passMarks) || 35,
          }))
        );
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Configure exam subjects error:', error);
    res.status(500).json({ error: 'Failed to update examination subjects.' });
  }
});

// Grade Scales
router.put('/admin/grade-scales', async (req: AuthRequest, res) => {
  try {
    const scales: Array<{
      gradeLetter: string;
      minMarks: number;
      maxMarks: number;
      description: string;
      gradePoint: number;
    }> = Array.isArray(req.body?.scales) ? req.body.scales : [];

    if (scales.length === 0) {
      return res.status(400).json({ error: 'At least one grade scale is required.' });
    }

    await db.transaction(async (tx) => {
      await tx.delete(gradeScales);
      await tx.insert(gradeScales).values(
        scales.map((s, idx) => ({
          gradeLetter: String(s.gradeLetter).trim().toUpperCase(),
          minMarks: Number(s.minMarks),
          maxMarks: Number(s.maxMarks),
          description: String(s.description || ''),
          gradePoint: Number(s.gradePoint || 0),
          displayOrder: idx + 1,
        }))
      );
    });

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: 'UPDATE_GRADE_SCALES',
      entityType: 'grade_scales',
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update grade scales error:', error);
    res.status(500).json({ error: 'Failed to update grading scale.' });
  }
});

// Admin Excel Import Monitoring & Marks Approval
router.get('/admin/imports', async (req, res) => {
  try {
    const rows = await db
      .select({
        imp: markImports,
        teacherUser: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
        year: academicYears,
        classRoom: classes,
        term: terms,
        exam: exams,
        subject: subjects,
      })
      .from(markImports)
      .innerJoin(users, eq(markImports.teacherUserId, users.id))
      .innerJoin(academicYears, eq(markImports.academicYearId, academicYears.id))
      .innerJoin(classes, eq(markImports.classId, classes.id))
      .innerJoin(terms, eq(markImports.termId, terms.id))
      .innerJoin(exams, eq(markImports.examId, exams.id))
      .innerJoin(subjects, eq(markImports.subjectId, subjects.id))
      .orderBy(desc(markImports.createdAt));

    const { grade, classId, subjectId, examId, status } = req.query;

    const filtered = rows.filter((r) => {
      if (grade && r.classRoom.grade !== Number(grade)) return false;
      if (classId && r.classRoom.id !== Number(classId)) return false;
      if (subjectId && r.subject.id !== Number(subjectId)) return false;
      if (examId && r.exam.id !== Number(examId)) return false;
      if (status && r.imp.importStatus !== String(status) && r.imp.approvalStatus !== String(status)) {
        return false;
      }
      return true;
    });

    // Completion matrix for selected or latest exam
    const targetExamId = examId ? Number(examId) : rows[0]?.exam.id;
    let completionMatrix: Array<{
      classId: number;
      className: string;
      grade: number;
      subjectId: number;
      subjectCode: string;
      subjectName: string;
      teacherName: string | null;
      status: string;
    }> = [];

    if (targetExamId) {
      const [targetExam] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, targetExamId));
      if (targetExam) {
        const examSubjs = await db
          .select({ es: examSubjects, subj: subjects })
          .from(examSubjects)
          .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
          .where(eq(examSubjects.examId, targetExam.id));

        const yrClasses = await db
          .select()
          .from(classes)
          .where(eq(classes.academicYearId, targetExam.academicYearId))
          .orderBy(asc(classes.grade), asc(classes.section));

        const assignments = await db
          .select({
            ta: teacherAssignments,
            tc: teachers,
          })
          .from(teacherAssignments)
          .innerJoin(teachers, eq(teacherAssignments.teacherId, teachers.id))
          .where(eq(teacherAssignments.academicYearId, targetExam.academicYearId));

        for (const cls of yrClasses) {
          const gradeSubjs = examSubjs.filter((es) => es.es.grade === cls.grade);
          for (const gs of gradeSubjs) {
            const matchingImps = rows.filter(
              (r) =>
                r.exam.id === targetExam.id &&
                r.classRoom.id === cls.id &&
                r.subject.id === gs.subj.id &&
                r.imp.importStatus !== 'pending_upload'
            );
            const latest = matchingImps[0];
            const assigned = assignments.find(
              (a) => a.ta.classId === cls.id && a.ta.subjectId === gs.subj.id
            );

            completionMatrix.push({
              classId: cls.id,
              className: cls.name,
              grade: cls.grade,
              subjectId: gs.subj.id,
              subjectCode: gs.subj.code,
              subjectName: gs.subj.name,
              teacherName: assigned
                ? `${assigned.tc.firstName} ${assigned.tc.lastName}`
                : null,
              status: latest ? latest.imp.importStatus : 'not_started',
            });
          }
        }
      }
    }

    res.json({
      imports: filtered.map((r) => ({
        id: r.imp.id,
        teacherName: r.teacherUser.fullName,
        teacherEmail: r.teacherUser.email,
        academicYear: r.year.name,
        grade: r.classRoom.grade,
        classId: r.classRoom.id,
        className: r.classRoom.name,
        termName: r.term.name,
        examId: r.exam.id,
        examName: r.exam.name,
        subjectId: r.subject.id,
        subjectCode: r.subject.code,
        subjectName: r.subject.name,
        originalFilename: r.imp.originalFilename,
        totalRows: r.imp.totalRows,
        validRows: r.imp.validRows,
        invalidRows: r.imp.invalidRows,
        missingMarksRows: r.imp.missingMarksRows,
        duplicateRows: r.imp.duplicateRows,
        existingMarksRows: r.imp.existingMarksRows,
        importStatus: r.imp.importStatus,
        approvalStatus: r.imp.approvalStatus,
        adminNotes: r.imp.adminNotes,
        createdAt: r.imp.createdAt,
        reviewedAt: r.imp.reviewedAt,
      })),
      completionMatrix,
    });
  } catch (error) {
    console.error('Admin imports list error:', error);
    res.status(500).json({ error: 'Failed to load Excel import history.' });
  }
});

router.post('/admin/imports/:id/review', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const decision = String(req.body?.decision || ''); // 'approved' | 'rejected' | 'under_review'
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (!['approved', 'rejected', 'under_review'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid review decision.' });
    }

    const [imp] = await db
      .select()
      .from(markImports)
      .where(eq(markImports.id, id));
    if (!imp) return res.status(404).json({ error: 'Import record not found.' });

    await db.transaction(async (tx) => {
      await tx
        .update(markImports)
        .set({
          approvalStatus: decision,
          importStatus:
            decision === 'approved'
              ? 'completed'
              : decision === 'rejected'
              ? 'rejected'
              : 'under_review',
          adminNotes: notes,
          reviewedBy: req.authUser!.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(markImports.id, id));

      if (decision === 'approved') {
        await tx
          .update(marks)
          .set({
            status: 'approved',
            approvedBy: req.authUser!.id,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(marks.importId, id));
      } else if (decision === 'rejected') {
        await tx
          .update(marks)
          .set({
            status: 'rejected',
            updatedAt: new Date(),
          })
          .where(and(eq(marks.importId, id), eq(marks.status, 'submitted')));
      }
    });

    // Notify uploading teacher
    await db.insert(notifications).values({
      userId: imp.teacherUserId,
      title: `Marks Import ${decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Correction Requested' : 'Under Review'}`,
      message:
        notes ||
        `Your Excel marks submission (#${id}) status was updated to ${decision}.`,
      type: decision === 'approved' ? 'success' : 'warning',
      createdBy: req.authUser!.id,
    });

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: 'admin',
      action: `REVIEW_IMPORT_${decision.toUpperCase()}`,
      entityType: 'mark_imports',
      entityId: id,
      details: { notes },
      ipAddress: req.ip,
    });

    res.json({ success: true, decision });
  } catch (error) {
    console.error('Review import error:', error);
    res.status(500).json({ error: 'Failed to process review decision.' });
  }
});

// School Settings, Holidays, Notifications & Audit Logs
router.get('/admin/settings', async (_req, res) => {
  const [settings] = await db.select().from(schoolSettings);
  res.json({ settings });
});

router.put('/admin/settings', async (req: AuthRequest, res) => {
  try {
    const {
      schoolName,
      schoolAddress,
      schoolEmail,
      schoolPhone,
      principalName,
      academicMotto,
    } = req.body;
    const [existing] = await db.select().from(schoolSettings);
    if (existing) {
      const [updated] = await db
        .update(schoolSettings)
        .set({
          schoolName,
          schoolAddress,
          schoolEmail,
          schoolPhone,
          principalName,
          academicMotto,
          updatedAt: new Date(),
        })
        .where(eq(schoolSettings.id, existing.id))
        .returning();
      return res.json({ settings: updated });
    }
    res.status(404).json({ error: 'Settings record not found.' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update school settings.' });
  }
});

router.post('/admin/holidays', async (req, res) => {
  try {
    const academicYearId = Number(req.body?.academicYearId);
    const holidayDate = String(req.body?.holidayDate || '');
    const title = String(req.body?.title || '').trim();
    const [created] = await db
      .insert(schoolHolidays)
      .values({ academicYearId, holidayDate, title })
      .returning();
    res.status(201).json({ holiday: created });
  } catch (error) {
    console.error('Create holiday error:', error);
    res.status(400).json({ error: 'Holiday date already exists for this academic year.' });
  }
});

router.delete('/admin/holidays/:id', async (req, res) => {
  await db.delete(schoolHolidays).where(eq(schoolHolidays.id, Number(req.params.id)));
  res.json({ success: true });
});

router.post('/admin/notifications', async (req: AuthRequest, res) => {
  try {
    const { targetRole, title, message, type } = req.body;
    const [created] = await db
      .insert(notifications)
      .values({
        targetRole: targetRole || 'all',
        title: String(title).trim(),
        message: String(message).trim(),
        type: type || 'info',
        createdBy: req.authUser!.id,
      })
      .returning();
    res.status(201).json({ notification: created });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Failed to send notification.' });
  }
});

router.get('/admin/audit-logs', async (_req, res) => {
  try {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    res.json({ logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

// Direct Admin Attendance Overview
router.get('/admin/attendance-overview', async (_req, res) => {
  try {
    const sessions = await db
      .select({
        session: attendanceSessions,
        classRoom: classes,
      })
      .from(attendanceSessions)
      .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
      .orderBy(desc(attendanceSessions.sessionDate))
      .limit(40);

    const sessionIds = sessions.map((s) => s.session.id);
    const records =
      sessionIds.length > 0
        ? await db
            .select()
            .from(attendanceRecords)
            .where(inArray(attendanceRecords.sessionId, sessionIds))
        : [];

    res.json({
      sessions: sessions.map((s) => {
        const recs = records.filter((r) => r.sessionId === s.session.id);
        return {
          id: s.session.id,
          className: s.classRoom.name,
          sessionDate: s.session.sessionDate,
          total: recs.length,
          present: recs.filter((r) => r.status === 'present').length,
          absent: recs.filter((r) => r.status === 'absent').length,
          late: recs.filter((r) => r.status === 'late').length,
          excused: recs.filter((r) => r.status === 'excused').length,
        };
      }),
    });
  } catch (error) {
    console.error('Attendance overview error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance overview.' });
  }
});

export default router;
