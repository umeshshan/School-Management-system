import React, { useCallback, useEffect, useState } from 'react';
import { Award, CalendarCheck, Download, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppShell, NavTab } from './AppShell';

interface ChildView {
  relationship: string;
  student: {
    id: number;
    admissionNo: string;
    firstName: string;
    lastName: string;
  };
  currentEnrollment: {
    enrollmentId: number;
    className: string;
    grade: number;
    academicYear: string;
  } | null;
  attendance: {
    eligibleDays: number;
    presentDays: number;
    lateDays: number;
    excusedDays: number;
    absentDays: number;
    percentage: number;
  };
  examResults: Array<{
    examId: number;
    examName: string;
    termName: string;
    academicYear: string;
    enrollmentId: number;
    rankingsPublished: boolean;
    totalMarks: number;
    totalMaxMarks: number;
    averageMarks: number;
    overallGrade: string;
    classRank: number | null;
    teacherRemarks: string | null;
    principalRemarks: string | null;
    subjectMarks: Array<{
      subjectId: number;
      subjectCode: string;
      subjectName: string;
      maxMarks: number;
      marksObtained: number | null;
      isAbsent: boolean;
      gradeLetter: string;
    }>;
  }>;
}

export const ParentDashboard: React.FC = () => {
  const { apiFetch, downloadFile } = useAuth();
  const [activeTab, setActiveTab] = useState('results');
  const [children, setChildren] = useState<ChildView[]>([]);
  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const [selectedExamIdx, setSelectedExamIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ children: ChildView[] }>('/api/parent/overview');
      setChildren(res.children || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load parent portal.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: NavTab[] = [
    { id: 'results', label: 'Academic Results', icon: <Award className="w-4 h-4" /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck className="w-4 h-4" /> },
    { id: 'children', label: 'Linked Children', icon: <Users className="w-4 h-4" /> },
  ];

  const child = children[selectedChildIdx] || null;
  const exam = child?.examResults[selectedExamIdx] || null;

  return (
    <AppShell
      roleLabel="Parent Portal"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Loading parent dashboard...
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      ) : children.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-slate-900">
            No students are linked to this parent account yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Please contact the School Administration Office to link your child’s admission record.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Child Switcher */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 mr-2">
                Select Child:
              </span>
              {children.map((c, idx) => (
                <button
                  key={c.student.id}
                  type="button"
                  onClick={() => {
                    setSelectedChildIdx(idx);
                    setSelectedExamIdx(0);
                  }}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    idx === selectedChildIdx
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {c.student.firstName} {c.student.lastName} ({c.student.admissionNo})
                </button>
              ))}
            </div>
            {child && (
              <div className="text-xs text-slate-600">
                {child.currentEnrollment?.className || 'Unassigned'} · Attendance:{' '}
                <strong className="font-mono">{child.attendance.percentage}%</strong>
              </div>
            )}
          </div>

          {activeTab === 'results' && child && (
            <div className="space-y-5">
              {child.examResults.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No approved examination results published for {child.student.firstName} yet.
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                    <select
                      value={selectedExamIdx}
                      onChange={(e) => setSelectedExamIdx(Number(e.target.value))}
                      className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {child.examResults.map((ex, idx) => (
                        <option key={ex.examId} value={idx}>
                          {ex.academicYear} · {ex.termName} · {ex.examName}
                        </option>
                      ))}
                    </select>
                    {exam && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadFile(
                            `/api/reports/student/${exam.enrollmentId}/exam/${exam.examId}/pdf`,
                            `ReportCard_${child.student.admissionNo}.pdf`
                          )
                        }
                        className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Report Card (PDF)</span>
                      </button>
                    )}
                  </div>

                  {exam && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <span className="font-display text-base font-semibold text-slate-900">
                          {exam.examName}
                        </span>
                        <div className="flex items-center gap-6 font-mono tabular-nums">
                          <span>
                            Total: <strong>{exam.totalMarks}</strong> / {exam.totalMaxMarks}
                          </span>
                          <span>
                            Average: <strong>{exam.averageMarks}%</strong>
                          </span>
                          <span>
                            Grade: <strong>{exam.overallGrade}</strong>
                          </span>
                          <span>
                            Rank:{' '}
                            <strong>
                              {exam.rankingsPublished && exam.classRank
                                ? `#${exam.classRank}`
                                : 'Pending'}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Code</th>
                            <th className="py-2.5 px-4 font-medium">Subject</th>
                            <th className="py-2.5 px-4 font-medium text-right">Max</th>
                            <th className="py-2.5 px-4 font-medium text-right">Marks</th>
                            <th className="py-2.5 px-4 font-medium">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {exam.subjectMarks.map((sm) => (
                            <tr key={sm.subjectId}>
                              <td className="py-2.5 px-4 font-mono text-slate-600">
                                {sm.subjectCode}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-slate-900">
                                {sm.subjectName}
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-500">
                                {sm.maxMarks}
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-right font-semibold">
                                {sm.isAbsent
                                  ? 'AB'
                                  : sm.marksObtained !== null
                                  ? sm.marksObtained
                                  : 'Pending'}
                              </td>
                              <td className="py-2.5 px-4 font-semibold">{sm.gradeLetter}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-5 bg-slate-50 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="font-semibold text-slate-700">Teacher Remarks</div>
                          <p className="text-slate-600 mt-1">
                            {exam.teacherRemarks || 'No remarks entered yet.'}
                          </p>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-700">Principal Remarks</div>
                          <p className="text-slate-600 mt-1">
                            {exam.principalRemarks || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'attendance' && child && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="font-display text-lg font-semibold text-slate-900 mb-4">
                Attendance Record — {child.student.firstName} {child.student.lastName}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-slate-500">Eligible Days</div>
                  <div className="font-mono text-xl font-bold mt-1">
                    {child.attendance.eligibleDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-emerald-700">Present</div>
                  <div className="font-mono text-xl font-bold text-emerald-700 mt-1">
                    {child.attendance.presentDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-amber-700">Late</div>
                  <div className="font-mono text-xl font-bold text-amber-700 mt-1">
                    {child.attendance.lateDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-slate-700">Excused</div>
                  <div className="font-mono text-xl font-bold mt-1">
                    {child.attendance.excusedDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-red-700">Absent</div>
                  <div className="font-mono text-xl font-bold text-red-700 mt-1">
                    {child.attendance.absentDays}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'children' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {children.map((c) => (
                <div
                  key={c.student.id}
                  className="bg-white border border-slate-200 rounded-xl p-5"
                >
                  <div className="text-xs text-slate-500">{c.relationship}</div>
                  <div className="font-display text-lg font-semibold text-slate-900 mt-1">
                    {c.student.firstName} {c.student.lastName}
                  </div>
                  <div className="text-xs font-mono text-slate-600 mt-1">
                    Admission ID: {c.student.admissionNo}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Class: {c.currentEnrollment?.className || 'Not Enrolled'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
};
