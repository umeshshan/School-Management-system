import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Download,
  FileSpreadsheet,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppShell, NavTab } from './AppShell';
import { ExcelMarksWorkflow } from './ExcelMarksWorkflow';
import { AnalyticsPanel } from './AnalyticsPanel';

interface AssignmentItem {
  id: number;
  academicYearId: number;
  yearName: string;
  classId: number;
  className: string;
  grade: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
}

interface StructureData {
  academicYears: Array<{ id: number; name: string; isCurrent: boolean }>;
  terms: Array<{ id: number; name: string; academicYearId: number }>;
  classes: Array<{ id: number; name: string; grade: number; academicYearId: number }>;
  subjects: Array<{ id: number; code: string; name: string; isActive: boolean }>;
}

interface ExamItem {
  id: number;
  name: string;
  academicYearId: number;
  termId: number;
  status: string;
}

export const TeacherDashboard: React.FC = () => {
  const { apiFetch, downloadFile } = useAuth();
  const [activeTab, setActiveTab] = useState('excel');
  const [structure, setStructure] = useState<StructureData>({
    academicYears: [],
    terms: [],
    classes: [],
    subjects: [],
  });
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);

  // My Classes & Students state
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [classStudents, setClassStudents] = useState<
    Array<{
      enrollmentId: number;
      studentId: number;
      admissionNo: string;
      fullName: string;
      rollNo: string | null;
      guardianPhone: string | null;
    }>
  >([]);

  // Attendance state
  const [attClassId, setAttClassId] = useState<number>(0);
  const [attDate, setAttDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [attTermId, setAttTermId] = useState<number>(0);
  const [attStudents, setAttStudents] = useState<
    Array<{
      studentId: number;
      enrollmentId: number;
      admissionNo: string;
      studentName: string;
      status: string;
      remarks: string;
    }>
  >([]);
  const [attHoliday, setAttHoliday] = useState<string | null>(null);
  const [attMsg, setAttMsg] = useState<string | null>(null);

  // Results & Remarks state
  const [resExamId, setResExamId] = useState<number>(0);
  const [resClassId, setResClassId] = useState<number>(0);
  const [classResults, setClassResults] = useState<{
    rankingsPublished: boolean;
    students: Array<{
      enrollmentId: number;
      admissionNo: string;
      studentName: string;
      totalMarks: number;
      totalMaxMarks: number;
      averageMarks: number;
      overallGrade: string;
      classRank: number | null;
      teacherRemarks: string | null;
      subjectMarks: Array<{
        subjectCode: string;
        subjectName: string;
        marksObtained: number | null;
        isAbsent: boolean;
        gradeLetter: string;
      }>;
    }>;
  } | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<number, string>>({});
  const [remarkStatus, setRemarkStatus] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    try {
      const [strRes, exRes, asgRes] = await Promise.all([
        apiFetch<StructureData>('/api/academic-structure'),
        apiFetch<{ exams: ExamItem[] }>('/api/exams'),
        apiFetch<{ assignments: AssignmentItem[] }>('/api/teacher/assignments'),
      ]);
      setStructure(strRes);
      setExams(exRes.exams);
      setAssignments(asgRes.assignments || []);
      const firstClass = asgRes.assignments?.[0]?.classId || 0;
      if (firstClass) {
        setSelectedClassId(firstClass);
        setAttClassId(firstClass);
        setResClassId(firstClass);
      }
      if (exRes.exams[0]) {
        setResExamId(exRes.exams[0].id);
      }
    } catch {
      // handled in UI
    }
  }, [apiFetch]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const uniqueClasses = useMemo(() => {
    const map = new Map<number, { id: number; name: string; grade: number }>();
    for (const a of assignments) {
      map.set(a.classId, { id: a.classId, name: a.className, grade: a.grade });
    }
    return Array.from(map.values());
  }, [assignments]);

  useEffect(() => {
    if (!selectedClassId) return;
    apiFetch<{ students: typeof classStudents }>(
      `/api/teacher/students?classId=${selectedClassId}`
    )
      .then((d) => setClassStudents(d.students))
      .catch(() => setClassStudents([]));
  }, [selectedClassId, apiFetch]);

  const loadAttendanceSheet = useCallback(async () => {
    if (!attClassId || !attDate) return;
    setAttMsg(null);
    try {
      const data = await apiFetch<{
        isHoliday: boolean;
        holidayTitle: string | null;
        students: typeof attStudents;
      }>(`/api/attendance/session?classId=${attClassId}&date=${attDate}`);
      setAttHoliday(data.isHoliday ? data.holidayTitle || 'School Holiday' : null);
      setAttStudents(data.students);
    } catch (err: unknown) {
      setAttMsg(err instanceof Error ? err.message : 'Unable to load attendance.');
    }
  }, [attClassId, attDate, apiFetch]);

  useEffect(() => {
    if (activeTab === 'attendance' && attClassId) {
      loadAttendanceSheet();
    }
  }, [activeTab, attClassId, attDate, loadAttendanceSheet]);

  const saveAttendance = async () => {
    if (!attClassId || !attDate) return;
    setAttMsg(null);
    try {
      await apiFetch('/api/attendance/session', {
        method: 'POST',
        body: JSON.stringify({
          classId: attClassId,
          date: attDate,
          termId: attTermId || null,
          records: attStudents,
        }),
      });
      setAttMsg('Attendance records saved to database.');
    } catch (err: unknown) {
      setAttMsg(err instanceof Error ? err.message : 'Failed to save attendance.');
    }
  };

  const loadClassResults = useCallback(async () => {
    if (!resExamId || !resClassId) return;
    try {
      const res = await apiFetch<NonNullable<typeof classResults>>(
        `/api/results/class?examId=${resExamId}&classId=${resClassId}`
      );
      setClassResults(res);
      const drafts: Record<number, string> = {};
      res.students.forEach((s) => {
        drafts[s.enrollmentId] = s.teacherRemarks || '';
      });
      setRemarkDrafts(drafts);
    } catch {
      setClassResults(null);
    }
  }, [resExamId, resClassId, apiFetch]);

  useEffect(() => {
    if (activeTab === 'results' && resExamId && resClassId) {
      loadClassResults();
    }
  }, [activeTab, resExamId, resClassId, loadClassResults]);

  const saveRemark = async (enrollmentId: number) => {
    setRemarkStatus(null);
    try {
      await apiFetch('/api/results/remarks', {
        method: 'POST',
        body: JSON.stringify({
          examId: resExamId,
          enrollmentId,
          teacherRemarks: remarkDrafts[enrollmentId] || '',
        }),
      });
      setRemarkStatus('Student remark saved.');
    } catch (err: unknown) {
      setRemarkStatus(err instanceof Error ? err.message : 'Failed to save remark.');
    }
  };

  const draftRemarkWithAi = async (
    student: NonNullable<typeof classResults>['students'][number]
  ) => {
    try {
      const res = await apiFetch<{ text: string }>('/api/ai/insight', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'student_remark',
          context: {
            studentName: student.studentName,
            averageMarks: student.averageMarks,
            overallGrade: student.overallGrade,
            subjects: student.subjectMarks.map((sm) => ({
              subject: sm.subjectName,
              marks: sm.isAbsent ? 'AB' : sm.marksObtained,
              grade: sm.gradeLetter,
            })),
          },
        }),
      });
      setRemarkDrafts((prev) => ({
        ...prev,
        [student.enrollmentId]: res.text,
      }));
    } catch (err: unknown) {
      setRemarkStatus(
        err instanceof Error ? err.message : 'Unable to draft remark.'
      );
    }
  };

  const tabs: NavTab[] = [
    {
      id: 'excel',
      label: 'Excel Marks Management',
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      id: 'classes',
      label: 'Assigned Classes & Students',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: <CalendarCheck className="w-4 h-4" />,
    },
    {
      id: 'results',
      label: 'Results, Remarks & PDFs',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'analytics',
      label: 'Class Performance',
      icon: <BarChart3 className="w-4 h-4" />,
    },
  ];

  return (
    <AppShell
      roleLabel="Teacher Portal"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {activeTab === 'excel' && (
        <ExcelMarksWorkflow
          structure={structure}
          exams={exams}
          assignments={assignments}
          isAdmin={false}
        />
      )}

      {activeTab === 'classes' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900 mb-4">
              My Subject & Class Assignments
            </h2>
            {assignments.length === 0 ? (
              <p className="text-sm text-slate-500">
                No classes or subjects assigned yet. Contact the School Administrator.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="p-4 border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <div className="text-xs text-slate-500">
                      {a.yearName} · Grade {a.grade}
                    </div>
                    <div className="font-display font-semibold text-slate-900 mt-1">
                      {a.className}
                    </div>
                    <div className="text-xs font-medium text-slate-700 mt-1">
                      {a.subjectCode} · {a.subjectName}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Class Student Roster
              </h3>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {uniqueClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {classStudents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No enrolled students in this class yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Admission ID</th>
                    <th className="py-2.5 px-4 font-medium">Student Name</th>
                    <th className="py-2.5 px-4 font-medium">Roll No</th>
                    <th className="py-2.5 px-4 font-medium">Guardian Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classStudents.map((st) => (
                    <tr key={st.studentId}>
                      <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-900">
                        {st.admissionNo}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">{st.fullName}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                        {st.rollNo || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {st.guardianPhone || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Class
                </label>
                <select
                  value={attClassId}
                  onChange={(e) => setAttClassId(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {uniqueClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={attDate}
                  onChange={(e) => setAttDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Term
                </label>
                <select
                  value={attTermId}
                  onChange={(e) => setAttTermId(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value={0}>Select Term...</option>
                  {structure.terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={saveAttendance}
              disabled={Boolean(attHoliday) || attStudents.length === 0}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer disabled:opacity-45"
            >
              Save Attendance
            </button>
          </div>

          {attMsg && (
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-800">
              {attMsg}
            </div>
          )}
          {attHoliday && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
              Declared School Holiday: {attHoliday}. Attendance marking is disabled for holidays.
            </div>
          )}

          {attStudents.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Select an assigned class with enrolled students to mark attendance.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Admission ID</th>
                  <th className="py-2.5 px-4 font-medium">Student</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attStudents.map((st, idx) => (
                  <tr key={st.studentId}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                      {st.admissionNo}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {st.studentName}
                    </td>
                    <td className="py-2.5 px-4">
                      <select
                        value={st.status}
                        onChange={(e) => {
                          const copy = [...attStudents];
                          copy[idx] = { ...copy[idx], status: e.target.value };
                          setAttStudents(copy);
                        }}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-xs"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="text"
                        value={st.remarks}
                        onChange={(e) => {
                          const copy = [...attStudents];
                          copy[idx] = { ...copy[idx], remarks: e.target.value };
                          setAttStudents(copy);
                        }}
                        placeholder="Optional note"
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'results' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Examination
                </label>
                <select
                  value={resExamId}
                  onChange={(e) => setResExamId(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Class
                </label>
                <select
                  value={resClassId}
                  onChange={(e) => setResClassId(Number(e.target.value))}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {uniqueClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {resExamId && resClassId && (
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `/api/reports/class/${resClassId}/exam/${resExamId}/pdf`,
                    `ClassReportCards.pdf`
                  )
                }
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Bulk Class PDF Report Cards</span>
              </button>
            )}
          </div>

          {remarkStatus && (
            <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-800">
              {remarkStatus}
            </div>
          )}

          {classResults && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  Class Results & Teacher Remarks
                </span>
                <span className="text-slate-600">
                  Rankings Status:{' '}
                  {classResults.rankingsPublished
                    ? 'Published (All marks approved)'
                    : 'Pending full marks approval'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Admission ID</th>
                      <th className="py-2.5 px-4 font-medium">Student</th>
                      <th className="py-2.5 px-4 font-medium text-right">Total</th>
                      <th className="py-2.5 px-4 font-medium text-right">Avg %</th>
                      <th className="py-2.5 px-4 font-medium">Grade</th>
                      <th className="py-2.5 px-4 font-medium">Rank</th>
                      <th className="py-2.5 px-4 font-medium">Teacher Remark</th>
                      <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classResults.students.map((st) => (
                      <tr key={st.enrollmentId}>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                          {st.admissionNo}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {st.studentName}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-right">
                          {st.totalMarks} / {st.totalMaxMarks}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-right">
                          {st.averageMarks}%
                        </td>
                        <td className="py-2.5 px-4 font-semibold">{st.overallGrade}</td>
                        <td className="py-2.5 px-4 font-mono tabular-nums">
                          {st.classRank ? `#${st.classRank}` : 'Pending'}
                        </td>
                        <td className="py-2.5 px-4 min-w-[260px]">
                          <input
                            type="text"
                            value={remarkDrafts[st.enrollmentId] ?? ''}
                            onChange={(e) =>
                              setRemarkDrafts((prev) => ({
                                ...prev,
                                [st.enrollmentId]: e.target.value,
                              }))
                            }
                            placeholder="Write teacher remark..."
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs"
                          />
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => draftRemarkWithAi(st)}
                            className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                            title="Draft remark using Gemini 3.1 Flash Lite"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Draft</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => saveRemark(st.enrollmentId)}
                            className="text-slate-900 font-medium underline cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadFile(
                                `/api/reports/student/${st.enrollmentId}/exam/${resExamId}/pdf`,
                                `Report_${st.admissionNo}.pdf`
                              )
                            }
                            className="text-slate-700 underline cursor-pointer"
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <AnalyticsPanel structure={{ ...structure, exams }} />
      )}
    </AppShell>
  );
};
