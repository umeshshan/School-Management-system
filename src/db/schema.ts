import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Users (4 roles: admin, teacher, student, parent)
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(), // Firebase Auth UID (linked on Google Sign-In)
    email: text('email').notNull().unique(),
    loginId: text('login_id').unique(), // e.g., Student Admission ID or Employee ID for credential/PIN login
    passwordHash: text('password_hash'), // scrypt hash for credential/PIN login
    fullName: text('full_name').notNull(),
    role: text('role').notNull().default('student'), // 'admin' | 'teacher' | 'student' | 'parent'
    isActive: boolean('is_active').notNull().default(true),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('users_role_idx').on(table.role),
    index('users_email_idx').on(table.email),
  ]
);

// 2. Students
export const students = pgTable(
  'students',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    admissionNo: text('admission_no').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: text('date_of_birth'),
    gender: text('gender'),
    guardianPhone: text('guardian_phone'),
    address: text('address'),
    admissionDate: text('admission_date'),
    status: text('status').notNull().default('active'), // 'active' | 'graduated' | 'transferred' | 'inactive'
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('students_admission_idx').on(table.admissionNo)]
);

// 3. Teachers
export const teachers = pgTable(
  'teachers',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    employeeNo: text('employee_no').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'),
    qualification: text('qualification'),
    specialization: text('specialization'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('teachers_employee_idx').on(table.employeeNo)]
);

// 4. Parents
export const parents = pgTable('parents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  email: text('email').notNull(),
  occupation: text('occupation'),
  address: text('address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 5. Parent-Student Links (Strict access control)
export const parentStudent = pgTable(
  'parent_student',
  {
    id: serial('id').primaryKey(),
    parentId: integer('parent_id')
      .references(() => parents.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    relationship: text('relationship').notNull().default('Guardian'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('parent_student_unique_idx').on(table.parentId, table.studentId),
  ]
);

// 6. Academic Years
export const academicYears = pgTable('academic_years', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., '2026'
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 7. Classes (Grades 6-13)
export const classes = pgTable(
  'classes',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    grade: integer('grade').notNull(), // 6 to 13
    section: text('section').notNull(), // 'A', 'B', 'C', etc.
    name: text('name').notNull(), // e.g., 'Grade 6 - A'
    classTeacherId: integer('class_teacher_id').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    capacity: integer('capacity').notNull().default(40),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('classes_year_grade_section_idx').on(
      table.academicYearId,
      table.grade,
      table.section
    ),
    index('classes_grade_idx').on(table.grade),
  ]
);

// 8. Enrollments (Preserves historical grade/class per academic year)
export const enrollments = pgTable(
  'enrollments',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    grade: integer('grade').notNull(),
    rollNo: text('roll_no'),
    status: text('status').notNull().default('active'), // 'active' | 'promoted' | 'transferred'
    enrolledAt: timestamp('enrolled_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('enrollments_student_year_idx').on(
      table.studentId,
      table.academicYearId
    ),
    index('enrollments_class_idx').on(table.classId),
  ]
);

// 9. Subjects (Initially exactly 12 configurable subjects: Subject 01 to Subject 12)
export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 10. Grade Subjects (Assign subjects to Grades 6-13 & Academic Years, compulsory/optional)
export const gradeSubjects = pgTable(
  'grade_subjects',
  {
    id: serial('id').primaryKey(),
    grade: integer('grade').notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    isCompulsory: boolean('is_compulsory').notNull().default(true),
  },
  (table) => [
    uniqueIndex('grade_subjects_unique_idx').on(
      table.grade,
      table.subjectId,
      table.academicYearId
    ),
  ]
);

// 11. Student Subject Selections (Supports different subject combinations per student)
export const studentSubjects = pgTable(
  'student_subjects',
  {
    id: serial('id').primaryKey(),
    enrollmentId: integer('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('student_subjects_unique_idx').on(
      table.enrollmentId,
      table.subjectId
    ),
  ]
);

// 12. Teacher Assignments
export const teacherAssignments = pgTable(
  'teacher_assignments',
  {
    id: serial('id').primaryKey(),
    teacherId: integer('teacher_id')
      .references(() => teachers.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('teacher_assignments_unique_idx').on(
      table.teacherId,
      table.classId,
      table.subjectId,
      table.academicYearId
    ),
    index('teacher_assignments_teacher_idx').on(table.teacherId),
  ]
);

// 13. Terms
export const terms = pgTable(
  'terms',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(), // e.g., 'Term 1'
    termNumber: integer('term_number').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    isActive: boolean('is_active').notNull().default(false),
  },
  (table) => [
    uniqueIndex('terms_year_number_idx').on(
      table.academicYearId,
      table.termNumber
    ),
  ]
);

// 14. Examinations
export const exams = pgTable(
  'exams',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    termId: integer('term_id')
      .references(() => terms.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    examDate: text('exam_date').notNull(),
    status: text('status').notNull().default('open'), // 'draft' | 'open' | 'published'
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('exams_term_idx').on(table.termId)]
);

// 15. Examination Subjects (Configurable max/pass marks per grade & subject)
export const examSubjects = pgTable(
  'exam_subjects',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    grade: integer('grade').notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    maxMarks: integer('max_marks').notNull().default(100),
    passMarks: integer('pass_marks').notNull().default(35),
  },
  (table) => [
    uniqueIndex('exam_subjects_unique_idx').on(
      table.examId,
      table.grade,
      table.subjectId
    ),
  ]
);

// 16. Grade Scales (Configurable grading policy)
export const gradeScales = pgTable('grade_scales', {
  id: serial('id').primaryKey(),
  gradeLetter: text('grade_letter').notNull(),
  minMarks: integer('min_marks').notNull(),
  maxMarks: integer('max_marks').notNull(),
  description: text('description'),
  gradePoint: real('grade_point').notNull().default(0),
  displayOrder: integer('display_order').notNull().default(1),
});

// 17. Mark Imports (Direct Excel upload tracking & approval workflow)
export const markImports = pgTable(
  'mark_imports',
  {
    id: serial('id').primaryKey(),
    teacherUserId: integer('teacher_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    teacherId: integer('teacher_id').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    termId: integer('term_id')
      .references(() => terms.id, { onDelete: 'cascade' })
      .notNull(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    originalFilename: text('original_filename').notNull(),
    fileHash: text('file_hash').notNull(),
    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    invalidRows: integer('invalid_rows').notNull().default(0),
    missingMarksRows: integer('missing_marks_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    existingMarksRows: integer('existing_marks_rows').notNull().default(0),
    importStatus: text('import_status').notNull().default('uploaded'), // 'not_started' | 'pending_upload' | 'uploaded' | 'under_review' | 'approved' | 'rejected' | 'completed'
    approvalStatus: text('approval_status').notNull().default('pending'), // 'pending' | 'under_review' | 'approved' | 'rejected'
    adminNotes: text('admin_notes'),
    reviewedBy: integer('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at'),
    uploadedFileBase64: text('uploaded_file_base64'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('mark_imports_exam_class_subj_idx').on(
      table.examId,
      table.classId,
      table.subjectId
    ),
    index('mark_imports_status_idx').on(table.approvalStatus),
  ]
);

// 18. Mark Import Rows (Detailed row-level audit & downloadable error reports)
export const markImportRows = pgTable(
  'mark_import_rows',
  {
    id: serial('id').primaryKey(),
    importId: integer('import_id')
      .references(() => markImports.id, { onDelete: 'cascade' })
      .notNull(),
    rowNumber: integer('row_number').notNull(),
    admissionNo: text('admission_no').notNull(),
    studentName: text('student_name'),
    rawMarks: text('raw_marks'),
    parsedMarks: real('parsed_marks'),
    isAbsent: boolean('is_absent').notNull().default(false),
    isValid: boolean('is_valid').notNull().default(false),
    hasExistingMark: boolean('has_existing_mark').notNull().default(false),
    errorMessage: text('error_message'),
    actionTaken: text('action_taken'),
  },
  (table) => [index('mark_import_rows_import_idx').on(table.importId)]
);

// 19. Marks (Preserves subject name/code snapshots historically)
export const marks = pgTable(
  'marks',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    examSubjectId: integer('exam_subject_id')
      .references(() => examSubjects.id, { onDelete: 'cascade' })
      .notNull(),
    enrollmentId: integer('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'restrict' })
      .notNull(),
    subjectNameSnapshot: text('subject_name_snapshot').notNull(),
    subjectCodeSnapshot: text('subject_code_snapshot').notNull(),
    marksObtained: real('marks_obtained'), // null when absent
    isAbsent: boolean('is_absent').notNull().default(false),
    gradeLetter: text('grade_letter'),
    remarks: text('remarks'),
    status: text('status').notNull().default('submitted'), // 'draft' | 'submitted' | 'approved' | 'rejected'
    submittedBy: integer('submitted_by')
      .references(() => users.id, { onDelete: 'set null' })
      .notNull(),
    approvedBy: integer('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    importId: integer('import_id').references(() => markImports.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('marks_exam_enrollment_subject_idx').on(
      table.examId,
      table.enrollmentId,
      table.subjectId
    ),
    index('marks_class_exam_idx').on(table.classId, table.examId),
    index('marks_status_idx').on(table.status),
  ]
);

// 20. Attendance Sessions
export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: serial('id').primaryKey(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    termId: integer('term_id').references(() => terms.id, {
      onDelete: 'set null',
    }),
    sessionDate: text('session_date').notNull(), // YYYY-MM-DD
    takenBy: integer('taken_by')
      .references(() => users.id, { onDelete: 'set null' })
      .notNull(),
    isHoliday: boolean('is_holiday').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('attendance_sessions_class_date_idx').on(
      table.classId,
      table.sessionDate
    ),
  ]
);

// 21. Attendance Records
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .references(() => attendanceSessions.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    enrollmentId: integer('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull(), // 'present' | 'absent' | 'late' | 'excused'
    remarks: text('remarks'),
  },
  (table) => [
    uniqueIndex('attendance_records_session_student_idx').on(
      table.sessionId,
      table.studentId
    ),
    index('attendance_records_student_idx').on(table.studentId),
  ]
);

// 22. School Holidays (Excluded from eligible school days)
export const schoolHolidays = pgTable(
  'school_holidays',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    holidayDate: text('holiday_date').notNull(),
    title: text('title').notNull(),
  },
  (table) => [
    uniqueIndex('school_holidays_year_date_idx').on(
      table.academicYearId,
      table.holidayDate
    ),
  ]
);

// 23. Report Card Remarks (Teacher & Principal remarks per exam & student)
export const reportRemarks = pgTable(
  'report_remarks',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    enrollmentId: integer('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    teacherRemarks: text('teacher_remarks'),
    principalRemarks: text('principal_remarks'),
    updatedBy: integer('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('report_remarks_exam_enrollment_idx').on(
      table.examId,
      table.enrollmentId
    ),
  ]
);

// 24. Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    targetRole: text('target_role'), // null for direct user, or 'all' | 'teacher' | 'student' | 'parent' | 'admin'
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull().default('info'), // 'info' | 'warning' | 'success' | 'action'
    isRead: boolean('is_read').notNull().default(false),
    createdBy: integer('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('notifications_user_idx').on(table.userId)]
);

// 25. Audit Logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    userEmail: text('user_email'),
    userRole: text('user_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_created_idx').on(table.createdAt),
  ]
);

// 26. School Settings (Single School configuration)
export const schoolSettings = pgTable('school_settings', {
  id: serial('id').primaryKey(),
  schoolName: text('school_name').notNull().default('Acadexia Collegiate School'),
  schoolAddress: text('school_address')
    .notNull()
    .default('Grades 6–13 Academic Campus'),
  schoolEmail: text('school_email').notNull().default('office@acadexia.edu'),
  schoolPhone: text('school_phone').notNull().default('+1 (555) 234-5678'),
  principalName: text('principal_name').notNull().default('Principal Office'),
  academicMotto: text('academic_motto')
    .notNull()
    .default('Excellence Through Discipline & Inquiry'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  student: one(students, { fields: [users.id], references: [students.userId] }),
  teacher: one(teachers, { fields: [users.id], references: [teachers.userId] }),
  parent: one(parents, { fields: [users.id], references: [parents.userId] }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] }),
  enrollments: many(enrollments),
  parentLinks: many(parentStudent),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] }),
  assignments: many(teacherAssignments),
}));

export const parentsRelations = relations(parents, ({ one, many }) => ({
  user: one(users, { fields: [parents.userId], references: [users.id] }),
  studentLinks: many(parentStudent),
}));

export const enrollmentsRelations = relations(enrollments, ({ one, many }) => ({
  student: one(students, {
    fields: [enrollments.studentId],
    references: [students.id],
  }),
  classRoom: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
  academicYear: one(academicYears, {
    fields: [enrollments.academicYearId],
    references: [academicYears.id],
  }),
  marks: many(marks),
  subjects: many(studentSubjects),
}));
