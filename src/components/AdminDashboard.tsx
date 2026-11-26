import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppShell, NavTab } from './AppShell';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ExcelMarksWorkflow } from './ExcelMarksWorkflow';

interface AdminStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalSubjects: number;
  totalParents: number;
  attendancePercentage: number;
  pendingApprovals: number;
  approvedImports: number;
  marksApprovalRate: number;
  totalMarks: number;
  approvedMarks: number;
}

interface AcademicStructure {
  academicYears: Array<{
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  }>;
  terms: Array<{
    id: number;
    academicYearId: number;
    name: string;
    termNumber: number;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }>;
  classes: Array<{
    id: number;
    academicYearId: number;
    grade: number;
    section: string;
    name: string;
    capacity: number;
  }>;
  subjects: Array<{
    id: number;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    displayOrder: number;
  }>;
  gradeSubjects: Array<{
    id: number;
    grade: number;
    subjectId: number;
    academicYearId: number;
    isCompulsory: boolean;
  }>;
  gradeScales: Array<{
    id: number;
    gradeLetter: string;
    minMarks: number;
    maxMarks: number;
    description: string | null;
    gradePoint: number;
  }>;
  holidays: Array<{
    id: number;
    academicYearId: number;
    holidayDate: string;
    title: string;
  }>;
}

export const AdminDashboard: React.FC = () => {
  const { apiFetch, downloadFile, refreshSession } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [structure, setStructure] = useState<AcademicStructure>({
    academicYears: [],
    terms: [],
    classes: [],
    subjects: [],
    gradeSubjects: [],
    gradeScales: [],
    holidays: [],
  });
  const [exams, setExams] = useState<
    Array<{
      id: number;
      academicYearId: number;
      termId: number;
      name: string;
      examDate: string;
      status: string;
    }>
  >([]);
  const [examSubjects, setExamSubjects] = useState<
    Array<{
      id: number;
      examId: number;
      grade: number;
      subjectId: number;
      maxMarks: number;
      passMarks: number;
    }>
  >([]);

  // Imports Monitoring
  const [imports, setImports] = useState<
    Array<{
      id: number;
      teacherName: string;
      teacherEmail: string;
      academicYear: string;
      grade: number;
      classId: number;
      className: string;
      termName: string;
      examId: number;
      examName: string;
      subjectId: number;
      subjectCode: string;
      subjectName: string;
      originalFilename: string;
      totalRows: number;
      validRows: number;
      invalidRows: number;
      importStatus: string;
      approvalStatus: string;
      adminNotes: string | null;
      createdAt: string;
    }>
  >([]);
  const [completionMatrix, setCompletionMatrix] = useState<
    Array<{
      classId: number;
      className: string;
      grade: number;
      subjectId: number;
      subjectCode: string;
      subjectName: string;
      teacherName: string | null;
      status: string;
    }>
  >([]);
  const [impFilters, setImpFilters] = useState({
    grade: '',
    classId: '',
    subjectId: '',
    examId: '',
    status: '',
  });
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [inspectedImport, setInspectedImport] = useState<{
    id: number;
    rows: Array<{
      rowNumber: number;
      admissionNo: string;
      studentName: string;
      rawMarks: string;
      isValid: boolean;
      errorMessage: string | null;
    }>;
  } | null>(null);

  // Entities
  const [studentsList, setStudentsList] = useState<
    Array<{
      id: number;
      admissionNo: string;
      firstName: string;
      lastName: string;
      email: string;
      isActive: boolean;
      enrollments: Array<{
        id: number;
        classId: number;
        className: string;
        grade: number;
        academicYearId: number;
        subjectIds: number[];
      }>;
    }>
  >([]);
  const [teachersList, setTeachersList] = useState<
    Array<{
      id: number;
      employeeNo: string;
      firstName: string;
      lastName: string;
      email: string;
      qualification: string | null;
      assignments: Array<{
        id: number;
        className: string;
        subjectCode: string;
        subjectName: string;
        yearName: string;
      }>;
    }>
  >([]);
  const [parentsList, setParentsList] = useState<
    Array<{
      id: number;
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
      children: Array<{
        linkId: number;
        studentId: number;
        admissionNo: string;
        studentName: string;
        relationship: string;
      }>;
    }>
  >([]);
  const [usersList, setUsersList] = useState<
    Array<{
      id: number;
      email: string;
      loginId: string | null;
      fullName: string;
      role: string;
      isActive: boolean;
      lastLoginAt: string | null;
    }>
  >([]);
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: number;
      userEmail: string | null;
      userRole: string | null;
      action: string;
      entityType: string;
      entityId: string | null;
      createdAt: string;
    }>
  >([]);
  const [attSessions, setAttSessions] = useState<
    Array<{
      id: number;
      className: string;
      sessionDate: string;
      total: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
    }>
  >([]);
  const [settingsForm, setSettingsForm] = useState({
    schoolName: '',
    schoolAddress: '',
    schoolEmail: '',
    schoolPhone: '',
    principalName: '',
    academicMotto: '',
  });

  // Form states
  const [studentForm, setStudentForm] = useState({
    admissionNo: '',
    firstName: '',
    lastName: '',
    email: '',
    pinOrPassword: '',
    guardianPhone: '',
    classId: '',
  });
  const [teacherForm, setTeacherForm] = useState({
    employeeNo: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    qualification: '',
  });
  const [assignForm, setAssignForm] = useState({
    teacherId: '',
    classId: '',
    subjectId: '',
  });
  const [parentForm, setParentForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    studentId: '',
    relationship: 'Parent',
  });
  const [linkForm, setLinkForm] = useState({
    parentId: '',
    studentId: '',
    relationship: 'Guardian',
  });
  const [subjectEdits, setSubjectEdits] = useState<
    Record<number, { code: string; name: string; isActive: boolean }>
  >({});
  const [selectedGradeMap, setSelectedGradeMap] = useState(6);
  const [classForm, setClassForm] = useState({ grade: '6', section: 'B', capacity: '40' });
  const [examForm, setExamForm] = useState({
    termId: '',
    name: '',
    examDate: new Date().toISOString().slice(0, 10),
  });
  const [holidayForm, setHolidayForm] = useState({
    holidayDate: new Date().toISOString().slice(0, 10),
    title: '',
  });
  const [notifForm, setNotifForm] = useState({
    targetRole: 'all',
    title: '',
    message: '',
  });
  const [bulkPdfClassId, setBulkPdfClassId] = useState('');
  const [bulkPdfExamId, setBulkPdfExamId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [editingSubjEnrollment, setEditingSubjEnrollment] = useState<{
    enrollmentId: number;
    studentName: string;
    selectedIds: number[];
  } | null>(null);
  const [resetPwUserId, setResetPwUserId] = useState<number | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');

  const currentYear =
    structure.academicYears.find((y) => y.isCurrent) || structure.academicYears[0];

  const loadAll = useCallback(async () => {
    try {
      const [statsRes, strRes, exRes] = await Promise.all([
        apiFetch<AdminStats>('/api/admin/stats'),
        apiFetch<AcademicStructure>('/api/academic-structure'),
        apiFetch<{ exams: typeof exams; examSubjects: typeof examSubjects }>(
          '/api/exams'
        ),
      ]);
      setStats(statsRes);
      setStructure(strRes);
      setExams(exRes.exams);
      setExamSubjects(exRes.examSubjects);

      const editMap: Record<number, { code: string; name: string; isActive: boolean }> =
        {};
      strRes.subjects.forEach((s) => {
        editMap[s.id] = { code: s.code, name: s.name, isActive: s.isActive };
      });
      setSubjectEdits(editMap);
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load dashboard data.',
      });
    }
  }, [apiFetch]);

  const loadImports = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      Object.entries(impFilters).forEach(([k, v]) => {
        if (v) qs.set(k, v);
      });
      const res = await apiFetch<{
        imports: typeof imports;
        completionMatrix: typeof completionMatrix;
      }>(`/api/admin/imports?${qs.toString()}`);
      setImports(res.imports);
      setCompletionMatrix(res.completionMatrix);
    } catch {
      // ignore
    }
  }, [apiFetch, impFilters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeTab === 'imports' || activeTab === 'overview') {
      loadImports();
    }
    if (activeTab === 'students') {
      apiFetch<{ students: typeof studentsList }>('/api/admin/students').then((d) =>
        setStudentsList(d.students)
      );
    }
    if (activeTab === 'teachers') {
      apiFetch<{ teachers: typeof teachersList }>('/api/admin/teachers').then((d) =>
        setTeachersList(d.teachers)
      );
    }
    if (activeTab === 'parents') {
      apiFetch<{ parents: typeof parentsList }>('/api/admin/parents').then((d) =>
        setParentsList(d.parents)
      );
      apiFetch<{ students: typeof studentsList }>('/api/admin/students').then((d) =>
        setStudentsList(d.students)
      );
    }
    if (activeTab === 'attendance') {
      apiFetch<{ sessions: typeof attSessions }>(
        '/api/admin/attendance-overview'
      ).then((d) => setAttSessions(d.sessions));
    }
    if (activeTab === 'governance') {
      apiFetch<{ users: typeof usersList }>('/api/admin/users').then((d) =>
        setUsersList(d.users)
      );
      apiFetch<{ logs: typeof auditLogs }>('/api/admin/audit-logs').then((d) =>
        setAuditLogs(d.logs)
      );
      apiFetch<{ settings: typeof settingsForm }>('/api/admin/settings').then((d) => {
        if (d.settings) setSettingsForm(d.settings);
      });
    }
  }, [activeTab, apiFetch, loadImports]);

  const notify = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
  };

  const handleReviewImport = async (
    importId: number,
    decision: 'approved' | 'rejected' | 'under_review'
  ) => {
    try {
      await apiFetch(`/api/admin/imports/${importId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          notes: reviewNotes[importId] || '',
        }),
      });
      notify('success', `Import #${importId} marked as ${decision}.`);
      await Promise.all([loadImports(), loadAll()]);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Review failed.');
    }
  };

  const handleInspectImport = async (importId: number) => {
    try {
      const res = await apiFetch<{ rows: NonNullable<typeof inspectedImport>['rows'] }>(
        `/api/excel/imports/${importId}/details`
      );
      setInspectedImport({ id: importId, rows: res.rows });
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to load details.');
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          ...studentForm,
          academicYearId: currentYear?.id,
          classId: studentForm.classId ? Number(studentForm.classId) : null,
        }),
      });
      setStudentForm({
        admissionNo: '',
        firstName: '',
        lastName: '',
        email: '',
        pinOrPassword: '',
        guardianPhone: '',
        classId: '',
      });
      notify('success', 'Student account created and enrolled.');
      const d = await apiFetch<{ students: typeof studentsList }>('/api/admin/students');
      setStudentsList(d.students);
      loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to create student.');
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/teachers', {
        method: 'POST',
        body: JSON.stringify(teacherForm),
      });
      setTeacherForm({
        employeeNo: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        qualification: '',
      });
      notify('success', 'Teacher account created.');
      const d = await apiFetch<{ teachers: typeof teachersList }>('/api/admin/teachers');
      setTeachersList(d.teachers);
      loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to create teacher.');
    }
  };

  const handleAssignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentYear) return;
    try {
      await apiFetch('/api/admin/teacher-assignments', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: Number(assignForm.teacherId),
          classId: Number(assignForm.classId),
          subjectId: Number(assignForm.subjectId),
          academicYearId: currentYear.id,
        }),
      });
      notify('success', 'Teacher assigned to class and subject.');
      const d = await apiFetch<{ teachers: typeof teachersList }>('/api/admin/teachers');
      setTeachersList(d.teachers);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Assignment failed.');
    }
  };

  const handleSaveSubject = async (id: number) => {
    const edit = subjectEdits[id];
    if (!edit) return;
    try {
      await apiFetch(`/api/admin/subjects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(edit),
      });
      notify('success', `Subject "${edit.name}" updated.`);
      loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Subject update failed.');
    }
  };

  const toggleGradeSubject = async (
    subjectId: number,
    currentlyAssigned: boolean,
    isCompulsory: boolean
  ) => {
    if (!currentYear) return;
    const existingForGrade = structure.gradeSubjects.filter(
      (gs) => gs.academicYearId === currentYear.id && gs.grade === selectedGradeMap
    );
    let nextItems = existingForGrade.map((gs) => ({
      subjectId: gs.subjectId,
      isCompulsory: gs.isCompulsory,
    }));

    if (currentlyAssigned) {
      const idx = nextItems.findIndex((i) => i.subjectId === subjectId);
      if (idx >= 0) {
        if (nextItems[idx].isCompulsory !== isCompulsory) {
          nextItems[idx].isCompulsory = isCompulsory;
        } else {
          nextItems = nextItems.filter((i) => i.subjectId !== subjectId);
        }
      }
    } else {
      nextItems.push({ subjectId, isCompulsory });
    }

    try {
      await apiFetch('/api/admin/grade-subjects', {
        method: 'PUT',
        body: JSON.stringify({
          academicYearId: currentYear.id,
          grade: selectedGradeMap,
          items: nextItems,
        }),
      });
      loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to update grade subjects.');
    }
  };

  const tabs: NavTab[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'imports', label: 'Excel Imports & Approvals', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'students', label: 'Students & Enrollments', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'teachers', label: 'Teachers & Assignments', icon: <UserCheck className="w-4 h-4" /> },
    { id: 'parents', label: 'Parents & Links', icon: <Users className="w-4 h-4" /> },
    { id: 'subjects', label: '12 Subjects & Grades', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'academics', label: 'Years, Classes & Exams', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'attendance', label: 'Attendance & Holidays', icon: <CalendarCheck className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics & Report Cards', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'governance', label: 'Users, Audit & Settings', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <AppShell
      roleLabel="School Administrator"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {banner && (
        <div
          className={`mb-5 p-3.5 rounded-lg border text-xs flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Students</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.totalStudents ?? 0}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Teachers</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.totalTeachers ?? 0}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Classes (Grades 6–13)</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.totalClasses ?? 0}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Active Subjects</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.totalSubjects ?? 12}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Parents</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.totalParents ?? 0}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Attendance Percentage</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.attendancePercentage ?? 0}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Approved Results Rate</div>
              <div className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {stats?.marksApprovalRate ?? 0}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-amber-700 font-medium">
                Pending Marks Approvals
              </div>
              <div className="font-display text-2xl font-bold text-amber-700 tabular-nums mt-1">
                {stats?.pendingApprovals ?? 0}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Setup & Operations Checklist
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Current Academic Year: {currentYear?.name || '-'} · 12 configurable subjects initialized · Zero fake student records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('subjects')}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Configure 12 Subjects
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('students')}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Enroll Students
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('imports')}
                className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Review Excel Uploads
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'imports' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <select
              value={impFilters.grade}
              onChange={(e) => setImpFilters({ ...impFilters, grade: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Grades</option>
              {[6, 7, 8, 9, 10, 11, 12, 13].map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
            <select
              value={impFilters.classId}
              onChange={(e) => setImpFilters({ ...impFilters, classId: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Classes</option>
              {structure.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={impFilters.subjectId}
              onChange={(e) => setImpFilters({ ...impFilters, subjectId: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Subjects</option>
              {structure.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            <select
              value={impFilters.examId}
              onChange={(e) => setImpFilters({ ...impFilters, examId: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Examinations</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <select
              value={impFilters.status}
              onChange={(e) => setImpFilters({ ...impFilters, status: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending Approval</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved / Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Excel Import Monitoring Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Teacher Excel Upload Monitoring & Approval Queue
              </h2>
            </div>
            {imports.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No teacher Excel marks submissions found yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Teacher</th>
                      <th className="py-2.5 px-4 font-medium">Class & Subject</th>
                      <th className="py-2.5 px-4 font-medium">Examination</th>
                      <th className="py-2.5 px-4 font-medium">Uploaded</th>
                      <th className="py-2.5 px-4 font-medium">Valid / Invalid</th>
                      <th className="py-2.5 px-4 font-medium">Status</th>
                      <th className="py-2.5 px-4 font-medium">Files</th>
                      <th className="py-2.5 px-4 font-medium">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {imports.map((imp) => (
                      <tr key={imp.id}>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{imp.teacherName}</div>
                          <div className="text-[11px] text-slate-500">{imp.teacherEmail}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{imp.className}</div>
                          <div className="text-[11px] text-slate-600">
                            {imp.subjectCode} · {imp.subjectName}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {imp.examName} · {imp.termName}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                          {new Date(imp.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          <span className="text-emerald-700">{imp.validRows}</span> /{' '}
                          <span className="text-red-700">{imp.invalidRows}</span>
                        </td>
                        <td className="py-3 px-4 capitalize font-medium">
                          {imp.importStatus.replace('_', ' ')} / {imp.approvalStatus}
                        </td>
                        <td className="py-3 px-4 space-y-1 whitespace-nowrap">
                          <div>
                            <button
                              type="button"
                              onClick={() => handleInspectImport(imp.id)}
                              className="text-slate-900 underline cursor-pointer"
                            >
                              Inspect Rows
                            </button>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                downloadFile(
                                  `/api/excel/imports/${imp.id}/download`,
                                  imp.originalFilename
                                )
                              }
                              className="text-slate-600 underline cursor-pointer"
                            >
                              Original .xlsx
                            </button>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                downloadFile(
                                  `/api/excel/imports/${imp.id}/error-report`,
                                  `ErrorReport_${imp.id}.xlsx`
                                )
                              }
                              className="text-slate-600 underline cursor-pointer"
                            >
                              Error Report
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 min-w-[230px] space-y-2">
                          <input
                            type="text"
                            value={reviewNotes[imp.id] ?? imp.adminNotes ?? ''}
                            onChange={(e) =>
                              setReviewNotes((prev) => ({
                                ...prev,
                                [imp.id]: e.target.value,
                              }))
                            }
                            placeholder="Review / correction note..."
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewImport(imp.id, 'approved')}
                              className="px-2.5 py-1 bg-emerald-700 text-white rounded text-[11px] hover:bg-emerald-800 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewImport(imp.id, 'rejected')}
                              className="px-2.5 py-1 bg-red-700 text-white rounded text-[11px] hover:bg-red-800 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {inspectedImport && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">
                  Row Validation Details — Import #{inspectedImport.id}
                </span>
                <button
                  type="button"
                  onClick={() => setInspectedImport(null)}
                  className="text-xs underline text-slate-600 cursor-pointer"
                >
                  Close
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-4">Row</th>
                    <th className="py-2 px-4">Admission ID</th>
                    <th className="py-2 px-4">Student</th>
                    <th className="py-2 px-4">Marks</th>
                    <th className="py-2 px-4">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inspectedImport.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 px-4 font-mono">{r.rowNumber}</td>
                      <td className="py-2 px-4 font-mono">{r.admissionNo}</td>
                      <td className="py-2 px-4">{r.studentName}</td>
                      <td className="py-2 px-4 font-mono">{r.rawMarks}</td>
                      <td className="py-2 px-4 text-slate-600">
                        {r.errorMessage || 'Valid'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Subject & Class Submission Completion Matrix */}
          {completionMatrix.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Subject & Class Marks Submission Tracking
                </h3>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-4">Class</th>
                      <th className="py-2 px-4">Subject</th>
                      <th className="py-2 px-4">Assigned Teacher</th>
                      <th className="py-2 px-4">Submission Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completionMatrix.map((m, i) => (
                      <tr key={i}>
                        <td className="py-2 px-4 font-medium text-slate-900">
                          {m.className}
                        </td>
                        <td className="py-2 px-4 text-slate-700">
                          {m.subjectCode} · {m.subjectName}
                        </td>
                        <td className="py-2 px-4 text-slate-600">
                          {m.teacherName || 'Unassigned'}
                        </td>
                        <td className="py-2 px-4 capitalize font-medium">
                          <span
                            className={
                              m.status === 'completed' || m.status === 'approved'
                                ? 'text-emerald-700'
                                : m.status === 'rejected'
                                ? 'text-red-700'
                                : m.status === 'not_started'
                                ? 'text-slate-400'
                                : 'text-amber-700'
                            }
                          >
                            {m.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin Direct Excel Entry */}
          <ExcelMarksWorkflow
            structure={structure}
            exams={exams}
            assignments={[]}
            isAdmin={true}
          />
        </div>
      )}

      {activeTab === 'students' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateStudent}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-slate-900">
              Register & Enroll Student
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                required
                placeholder="Admission ID (e.g. STU-2026-001)"
                value={studentForm.admissionNo}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, admissionNo: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="First Name"
                value={studentForm.firstName}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, firstName: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="Last Name"
                value={studentForm.lastName}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, lastName: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="password"
                required
                placeholder="Initial Password or PIN (min 4)"
                value={studentForm.pinOrPassword}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, pinOrPassword: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={studentForm.email}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, email: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Guardian Phone"
                value={studentForm.guardianPhone}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, guardianPhone: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <select
                required
                value={studentForm.classId}
                onChange={(e) =>
                  setStudentForm({ ...studentForm, classId: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Class ({currentYear?.name})...</option>
                {structure.classes
                  .filter((c) => c.academicYearId === currentYear?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Register Student
              </button>
            </div>
          </form>

          {editingSubjEnrollment && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Subject Combination — {editingSubjEnrollment.studentName}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingSubjEnrollment(null)}
                  className="text-xs underline text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {structure.subjects
                  .filter((s) => s.isActive)
                  .map((s) => {
                    const checked = editingSubjEnrollment.selectedIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? editingSubjEnrollment.selectedIds.filter((i) => i !== s.id)
                              : [...editingSubjEnrollment.selectedIds, s.id];
                            setEditingSubjEnrollment({
                              ...editingSubjEnrollment,
                              selectedIds: next,
                            });
                          }}
                        />
                        <span>
                          {s.code} · {s.name}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(
                    `/api/admin/enrollments/${editingSubjEnrollment.enrollmentId}/subjects`,
                    {
                      method: 'PUT',
                      body: JSON.stringify({
                        subjectIds: editingSubjEnrollment.selectedIds,
                      }),
                    }
                  );
                  notify('success', 'Student subject combination updated.');
                  setEditingSubjEnrollment(null);
                  const d = await apiFetch<{ students: typeof studentsList }>(
                    '/api/admin/students'
                  );
                  setStudentsList(d.students);
                }}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Save Subject Selection
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Enrolled Students ({studentsList.length})
              </h3>
              <input
                type="text"
                placeholder="Search by Admission ID or Name..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-64"
              />
            </div>
            {studentsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No students registered yet. Use the form above to enroll your first student.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Admission ID</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Email</th>
                      <th className="py-2.5 px-4">Current Class</th>
                      <th className="py-2.5 px-4">Subjects</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentsList
                      .filter(
                        (s) =>
                          !studentSearch ||
                          s.admissionNo
                            .toLowerCase()
                            .includes(studentSearch.toLowerCase()) ||
                          `${s.firstName} ${s.lastName}`
                            .toLowerCase()
                            .includes(studentSearch.toLowerCase())
                      )
                      .map((st) => {
                        const enr = st.enrollments[0];
                        return (
                          <tr key={st.id}>
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                              {st.admissionNo}
                            </td>
                            <td className="py-2.5 px-4 text-slate-900">
                              {st.firstName} {st.lastName}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">{st.email}</td>
                            <td className="py-2.5 px-4 text-slate-700">
                              {enr?.className || 'Not Enrolled'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-600">
                              {enr ? `${enr.subjectIds.length} assigned` : '-'}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {enr && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingSubjEnrollment({
                                      enrollmentId: enr.id,
                                      studentName: `${st.firstName} ${st.lastName}`,
                                      selectedIds: enr.subjectIds,
                                    })
                                  }
                                  className="underline text-slate-700 hover:text-slate-900 cursor-pointer"
                                >
                                  Edit Subjects
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'teachers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleCreateTeacher}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Register Teacher
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Employee ID (e.g. TCH-001)"
                  value={teacherForm.employeeNo}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, employeeNo: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="email"
                  required
                  placeholder="School Email"
                  value={teacherForm.email}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, email: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="First Name"
                  value={teacherForm.firstName}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, firstName: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Last Name"
                  value={teacherForm.lastName}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, lastName: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Qualification"
                  value={teacherForm.qualification}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, qualification: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="password"
                  required
                  placeholder="Initial Password"
                  value={teacherForm.password}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, password: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Create Teacher Account
              </button>
            </form>

            <form
              onSubmit={handleAssignTeacher}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Assign Teacher to Class & Subject
              </h2>
              <div className="space-y-3">
                <select
                  required
                  value={assignForm.teacherId}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, teacherId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Teacher...</option>
                  {teachersList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.employeeNo} · {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={assignForm.classId}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, classId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Class...</option>
                  {structure.classes
                    .filter((c) => c.academicYearId === currentYear?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <select
                  required
                  value={assignForm.subjectId}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, subjectId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Subject...</option>
                  {structure.subjects
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Save Assignment
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Faculty & Subject Assignments
              </h3>
            </div>
            {teachersList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No teachers registered yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Employee ID</th>
                    <th className="py-2.5 px-4">Teacher</th>
                    <th className="py-2.5 px-4">Email</th>
                    <th className="py-2.5 px-4">Assigned Classes & Subjects</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachersList.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {t.employeeNo}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {t.firstName} {t.lastName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{t.email}</td>
                      <td className="py-3 px-4 space-y-1">
                        {t.assignments.length === 0 ? (
                          <span className="text-slate-400">No assignments</span>
                        ) : (
                          t.assignments.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-3">
                              <span>
                                {a.className} · {a.subjectCode} ({a.subjectName})
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/teacher-assignments/${a.id}`, {
                                    method: 'DELETE',
                                  });
                                  const d = await apiFetch<{ teachers: typeof teachersList }>(
                                    '/api/admin/teachers'
                                  );
                                  setTeachersList(d.teachers);
                                }}
                                className="text-red-700 underline cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'parents' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/parents', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...parentForm,
                      studentIds: parentForm.studentId
                        ? [Number(parentForm.studentId)]
                        : [],
                    }),
                  });
                  setParentForm({
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    password: '',
                    studentId: '',
                    relationship: 'Parent',
                  });
                  notify('success', 'Parent account created.');
                  const d = await apiFetch<{ parents: typeof parentsList }>(
                    '/api/admin/parents'
                  );
                  setParentsList(d.parents);
                } catch (err: unknown) {
                  notify(
                    'error',
                    err instanceof Error ? err.message : 'Failed to create parent.'
                  );
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Register Parent / Guardian
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="First Name"
                  value={parentForm.firstName}
                  onChange={(e) =>
                    setParentForm({ ...parentForm, firstName: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Last Name"
                  value={parentForm.lastName}
                  onChange={(e) =>
                    setParentForm({ ...parentForm, lastName: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="email"
                  required
                  placeholder="Parent Email"
                  value={parentForm.email}
                  onChange={(e) =>
                    setParentForm({ ...parentForm, email: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={parentForm.phone}
                  onChange={(e) =>
                    setParentForm({ ...parentForm, phone: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="password"
                  required
                  placeholder="Initial Password"
                  value={parentForm.password}
                  onChange={(e) =>
                    setParentForm({ ...parentForm, password: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <select
                  value={parentForm.studentId}
                  onChange={(e) =>
                    setParentForm({ ...parentForm, studentId: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Link Student (optional)...</option>
                  {studentsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.admissionNo} · {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Create Parent Account
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/parent-links', {
                    method: 'POST',
                    body: JSON.stringify({
                      parentId: Number(linkForm.parentId),
                      studentId: Number(linkForm.studentId),
                      relationship: linkForm.relationship,
                    }),
                  });
                  notify('success', 'Child linked to parent account.');
                  const d = await apiFetch<{ parents: typeof parentsList }>(
                    '/api/admin/parents'
                  );
                  setParentsList(d.parents);
                } catch (err: unknown) {
                  notify(
                    'error',
                    err instanceof Error ? err.message : 'Linking failed.'
                  );
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Link Additional Child to Parent
              </h2>
              <select
                required
                value={linkForm.parentId}
                onChange={(e) =>
                  setLinkForm({ ...linkForm, parentId: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Parent...</option>
                {parentsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.email})
                  </option>
                ))}
              </select>
              <select
                required
                value={linkForm.studentId}
                onChange={(e) =>
                  setLinkForm({ ...linkForm, studentId: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Student...</option>
                {studentsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.admissionNo} · {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={linkForm.relationship}
                onChange={(e) =>
                  setLinkForm({ ...linkForm, relationship: e.target.value })
                }
                placeholder="Relationship (Mother / Father / Guardian)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Link Child
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Parents & Linked Children
              </h3>
            </div>
            {parentsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No parent accounts created yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Parent Name</th>
                    <th className="py-2.5 px-4">Email</th>
                    <th className="py-2.5 px-4">Linked Children</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parentsList.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {p.firstName} {p.lastName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{p.email}</td>
                      <td className="py-3 px-4 space-y-1">
                        {p.children.length === 0 ? (
                          <span className="text-slate-400">No linked students</span>
                        ) : (
                          p.children.map((c) => (
                            <div key={c.linkId}>
                              {c.admissionNo} · {c.studentName} ({c.relationship})
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                12 Configurable Curriculum Subjects (Subject 01 – Subject 12)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rename subjects, set school codes, or activate/deactivate subjects without losing historical examination results.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Subject Code</th>
                    <th className="py-2.5 px-4">Subject Name</th>
                    <th className="py-2.5 px-4">Active</th>
                    <th className="py-2.5 px-4 text-right">Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {structure.subjects.map((subj) => {
                    const edit = subjectEdits[subj.id] || {
                      code: subj.code,
                      name: subj.name,
                      isActive: subj.isActive,
                    };
                    return (
                      <tr key={subj.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {String(subj.displayOrder).padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            value={edit.code}
                            onChange={(e) =>
                              setSubjectEdits((prev) => ({
                                ...prev,
                                [subj.id]: { ...edit, code: e.target.value },
                              }))
                            }
                            className="px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs w-28"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <input
                            type="text"
                            value={edit.name}
                            onChange={(e) =>
                              setSubjectEdits((prev) => ({
                                ...prev,
                                [subj.id]: { ...edit, name: e.target.value },
                              }))
                            }
                            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs w-64"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={edit.isActive}
                              onChange={(e) =>
                                setSubjectEdits((prev) => ({
                                  ...prev,
                                  [subj.id]: { ...edit, isActive: e.target.checked },
                                }))
                              }
                            />
                            <span>{edit.isActive ? 'Active' : 'Inactive'}</span>
                          </label>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSaveSubject(subj.id)}
                            className="px-3 py-1 bg-slate-900 text-white rounded text-xs hover:bg-slate-800 cursor-pointer"
                          >
                            Update
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Grade-Subject Mapping ({currentYear?.name})
                </h3>
                <p className="text-xs text-slate-500">
                  Assign compulsory or optional subjects per grade (Grades 6–13).
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[6, 7, 8, 9, 10, 11, 12, 13].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGradeMap(g)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                      selectedGradeMap === g
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Grade {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {structure.subjects.map((subj) => {
                const gs = structure.gradeSubjects.find(
                  (x) =>
                    x.academicYearId === currentYear?.id &&
                    x.grade === selectedGradeMap &&
                    x.subjectId === subj.id
                );
                return (
                  <div
                    key={subj.id}
                    className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{subj.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {subj.code}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          toggleGradeSubject(subj.id, Boolean(gs), true)
                        }
                        className={`px-2 py-1 rounded text-[11px] cursor-pointer ${
                          gs?.isCompulsory
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Compulsory
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toggleGradeSubject(subj.id, Boolean(gs), false)
                        }
                        className={`px-2 py-1 rounded text-[11px] cursor-pointer ${
                          gs && !gs.isCompulsory
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Optional
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'academics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!currentYear) return;
                try {
                  await apiFetch('/api/admin/classes', {
                    method: 'POST',
                    body: JSON.stringify({
                      academicYearId: currentYear.id,
                      grade: Number(classForm.grade),
                      section: classForm.section,
                      capacity: Number(classForm.capacity),
                    }),
                  });
                  notify('success', 'Class section created.');
                  loadAll();
                } catch (err: unknown) {
                  notify(
                    'error',
                    err instanceof Error ? err.message : 'Class creation failed.'
                  );
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Add Class Section (Grades 6–13)
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <select
                  value={classForm.grade}
                  onChange={(e) => setClassForm({ ...classForm, grade: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {[6, 7, 8, 9, 10, 11, 12, 13].map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  placeholder="Section (e.g. B)"
                  value={classForm.section}
                  onChange={(e) =>
                    setClassForm({ ...classForm, section: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  value={classForm.capacity}
                  onChange={(e) =>
                    setClassForm({ ...classForm, capacity: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Create Class
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!currentYear) return;
                try {
                  await apiFetch('/api/admin/exams', {
                    method: 'POST',
                    body: JSON.stringify({
                      academicYearId: currentYear.id,
                      termId: Number(examForm.termId),
                      name: examForm.name,
                      examDate: examForm.examDate,
                      status: 'open',
                    }),
                  });
                  setExamForm({ ...examForm, name: '' });
                  notify('success', 'Examination created with grade subjects.');
                  loadAll();
                } catch (err: unknown) {
                  notify(
                    'error',
                    err instanceof Error ? err.message : 'Exam creation failed.'
                  );
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Create Examination
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  required
                  value={examForm.termId}
                  onChange={(e) => setExamForm({ ...examForm, termId: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Term...</option>
                  {structure.terms
                    .filter((t) => t.academicYearId === currentYear?.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  required
                  placeholder="Exam Name (e.g. Term 3 Final)"
                  value={examForm.name}
                  onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="date"
                  required
                  value={examForm.examDate}
                  onChange={(e) =>
                    setExamForm({ ...examForm, examDate: e.target.value })
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Create Examination
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Examinations
                </h3>
              </div>
              {exams.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No examinations created yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-4">Examination</th>
                      <th className="py-2 px-4">Date</th>
                      <th className="py-2 px-4">Status</th>
                      <th className="py-2 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exams.map((ex) => (
                      <tr key={ex.id}>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {ex.name}
                        </td>
                        <td className="py-2.5 px-4 font-mono">{ex.examDate}</td>
                        <td className="py-2.5 px-4 capitalize">{ex.status}</td>
                        <td className="py-2.5 px-4 text-right">
                          {ex.status !== 'published' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/exams/${ex.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'published' }),
                                });
                                notify('success', 'Examination published.');
                                loadAll();
                              }}
                              className="underline text-emerald-700 cursor-pointer"
                            >
                              Publish
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  School Grading Scale
                </h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-4">Grade</th>
                    <th className="py-2 px-4">Range</th>
                    <th className="py-2 px-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {structure.gradeScales.map((gs) => (
                    <tr key={gs.id}>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {gs.gradeLetter}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        {gs.minMarks} – {gs.maxMarks}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{gs.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Declare School Holidays (Excluded from Eligible Days)
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!currentYear) return;
                await apiFetch('/api/admin/holidays', {
                  method: 'POST',
                  body: JSON.stringify({
                    academicYearId: currentYear.id,
                    ...holidayForm,
                  }),
                });
                setHolidayForm({ ...holidayForm, title: '' });
                notify('success', 'Holiday added.');
                loadAll();
              }}
              className="flex flex-wrap gap-3"
            >
              <input
                type="date"
                required
                value={holidayForm.holidayDate}
                onChange={(e) =>
                  setHolidayForm({ ...holidayForm, holidayDate: e.target.value })
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="Holiday Title"
                value={holidayForm.title}
                onChange={(e) =>
                  setHolidayForm({ ...holidayForm, title: e.target.value })
                }
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Add Holiday
              </button>
            </form>
            <div className="divide-y divide-slate-100 text-xs">
              {structure.holidays.map((h) => (
                <div key={h.id} className="py-2.5 flex items-center justify-between">
                  <span>
                    <strong className="font-mono">{h.holidayDate}</strong> · {h.title}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/holidays/${h.id}`, {
                        method: 'DELETE',
                      });
                      loadAll();
                    }}
                    className="text-red-700 underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Recent Attendance Sessions
              </h3>
            </div>
            {attSessions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No attendance sessions recorded yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-4">Class</th>
                    <th className="py-2 px-4">Present</th>
                    <th className="py-2 px-4">Absent</th>
                    <th className="py-2 px-4">Late</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attSessions.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 px-4 font-mono">{s.sessionDate}</td>
                      <td className="py-2.5 px-4 font-medium">{s.className}</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-700">{s.present}</td>
                      <td className="py-2.5 px-4 font-mono text-red-700">{s.absent}</td>
                      <td className="py-2.5 px-4 font-mono text-amber-700">{s.late}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Bulk Class PDF Report Card Generation
              </h3>
              <p className="text-xs text-slate-500">
                Generate consolidated official PDF report cards for an entire class.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={bulkPdfClassId}
                onChange={(e) => setBulkPdfClassId(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Class...</option>
                {structure.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={bulkPdfExamId}
                onChange={(e) => setBulkPdfExamId(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Examination...</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkPdfClassId || !bulkPdfExamId}
                onClick={() =>
                  downloadFile(
                    `/api/reports/class/${bulkPdfClassId}/exam/${bulkPdfExamId}/pdf`,
                    'ClassReportCards.pdf'
                  )
                }
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer disabled:opacity-45"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Bulk PDF</span>
              </button>
            </div>
          </div>

          <AnalyticsPanel structure={{ ...structure, exams }} />
        </div>
      )}

      {activeTab === 'governance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/settings', {
                  method: 'PUT',
                  body: JSON.stringify(settingsForm),
                });
                notify('success', 'School settings saved.');
                refreshSession();
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-700" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  School Profile & Report Card Settings
                </h2>
              </div>
              <input
                type="text"
                value={settingsForm.schoolName}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, schoolName: e.target.value })
                }
                placeholder="School Name"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={settingsForm.schoolAddress}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, schoolAddress: e.target.value })
                }
                placeholder="Address"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="email"
                  value={settingsForm.schoolEmail}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, schoolEmail: e.target.value })
                  }
                  placeholder="Office Email"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  value={settingsForm.schoolPhone}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, schoolPhone: e.target.value })
                  }
                  placeholder="Phone"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <input
                type="text"
                value={settingsForm.principalName}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, principalName: e.target.value })
                }
                placeholder="Principal Signature Label"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Save School Settings
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/notifications', {
                  method: 'POST',
                  body: JSON.stringify(notifForm),
                });
                setNotifForm({ targetRole: 'all', title: '', message: '' });
                notify('success', 'Notification broadcast sent.');
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900">
                Broadcast School Notification
              </h2>
              <select
                value={notifForm.targetRole}
                onChange={(e) =>
                  setNotifForm({ ...notifForm, targetRole: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">All Roles</option>
                <option value="teacher">Teachers Only</option>
                <option value="student">Students Only</option>
                <option value="parent">Parents Only</option>
              </select>
              <input
                type="text"
                required
                placeholder="Announcement Title"
                value={notifForm.title}
                onChange={(e) =>
                  setNotifForm({ ...notifForm, title: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <textarea
                required
                rows={3}
                placeholder="Message..."
                value={notifForm.message}
                onChange={(e) =>
                  setNotifForm({ ...notifForm, message: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Send Broadcast
              </button>
            </form>
          </div>

          {/* User Accounts Management */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                User Accounts & Security Controls
              </h3>
            </div>
            {resetPwUserId && (
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3 text-xs">
                <span>New Password / PIN for User #{resetPwUserId}:</span>
                <input
                  type="password"
                  value={resetPwValue}
                  onChange={(e) => setResetPwValue(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/users/${resetPwUserId}/reset-password`, {
                      method: 'POST',
                      body: JSON.stringify({ newPassword: resetPwValue }),
                    });
                    setResetPwUserId(null);
                    setResetPwValue('');
                    notify('success', 'User password/PIN updated.');
                  }}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setResetPwUserId(null)}
                  className="underline text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Email / Login ID</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {u.fullName}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {u.email} {u.loginId ? `(${u.loginId})` : ''}
                    </td>
                    <td className="py-2.5 px-4 capitalize">{u.role}</td>
                    <td className="py-2.5 px-4">
                      {u.isActive ? (
                        <span className="text-emerald-700 font-medium">Active</span>
                      ) : (
                        <span className="text-red-700 font-medium">Inactive</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => setResetPwUserId(u.id)}
                        className="underline text-slate-700 cursor-pointer"
                      >
                        Reset Password
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/users/${u.id}/toggle-active`, {
                            method: 'PATCH',
                          });
                          const d = await apiFetch<{ users: typeof usersList }>(
                            '/api/admin/users'
                          );
                          setUsersList(d.users);
                        }}
                        className="underline text-slate-900 cursor-pointer"
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Audit Logs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Security & System Audit Logs
              </h3>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-4">Timestamp</th>
                    <th className="py-2 px-4">Actor</th>
                    <th className="py-2 px-4">Action</th>
                    <th className="py-2 px-4">Entity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-4 font-mono tabular-nums text-slate-500">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-slate-700">
                        {l.userEmail || '-'} ({l.userRole || '-'})
                      </td>
                      <td className="py-2 px-4 font-mono text-slate-900">{l.action}</td>
                      <td className="py-2 px-4 text-slate-600">
                        {l.entityType} {l.entityId ? `#${l.entityId}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
