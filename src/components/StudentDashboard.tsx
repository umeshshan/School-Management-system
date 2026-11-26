import React, { useCallback, useEffect, useState } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Award, CalendarCheck, Download, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppShell, NavTab } from './AppShell';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

interface StudentOverviewData {
  student: {
    id: number;
    admissionNo: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    gender: string | null;
    guardianPhone: string | null;
    address: string | null;
    status: string;
  };
  currentEnrollment: {
    enrollmentId: number;
    classId: number;
    className: string;
    grade: number;
    academicYear: string;
    rollNo: string | null;
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
    examDate: string;
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
      passMarks: number;
      marksObtained: number | null;
      isAbsent: boolean;
      gradeLetter: string;
    }>;
  }>;
}

export const StudentDashboard: React.FC = () => {
  const { apiFetch, downloadFile } = useAuth();
  const [activeTab, setActiveTab] = useState('results');
  const [data, setData] = useState<StudentOverviewData | null>(null);
  const [selectedExamIdx, setSelectedExamIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<StudentOverviewData>('/api/student/overview');
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load student data.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: NavTab[] = [
    { id: 'results', label: 'Examination Results', icon: <Award className="w-4 h-4" /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile', icon: <User className="w-4 h-4" /> },
  ];

  const currentExam = data?.examResults[selectedExamIdx] || null;

  return (
    <AppShell
      roleLabel="Student Portal"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Loading student portal...
        </div>
      ) : error || !data ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error || 'Student record unavailable.'}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Admission Number</div>
              <div className="font-mono text-xl font-bold text-slate-900 mt-1">
                {data.student.admissionNo}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Current Class</div>
              <div className="font-display text-xl font-bold text-slate-900 mt-1">
                {data.currentEnrollment?.className || 'Not Enrolled'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Attendance Rate</div>
              <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-1">
                {data.attendance.percentage}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Latest Exam Average</div>
              <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-1">
                {currentExam ? `${currentExam.averageMarks}% (${currentExam.overallGrade})` : 'Pending'}
              </div>
            </div>
          </div>

          {activeTab === 'results' && (
            <div className="space-y-6">
              {data.examResults.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No published or approved examination results available yet.
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium text-slate-600">
                        Select Examination:
                      </span>
                      <select
                        value={selectedExamIdx}
                        onChange={(e) => setSelectedExamIdx(Number(e.target.value))}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {data.examResults.map((ex, idx) => (
                          <option key={ex.examId} value={idx}>
                            {ex.academicYear} · {ex.termName} · {ex.examName}
                          </option>
                        ))}
                      </select>
                    </div>
                    {currentExam && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadFile(
                            `/api/reports/student/${currentExam.enrollmentId}/exam/${currentExam.examId}/pdf`,
                            `ReportCard_${data.student.admissionNo}.pdf`
                          )
                        }
                        className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF Report Card</span>
                      </button>
                    )}
                  </div>

                  {currentExam && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div>
                          <span className="font-display text-base font-semibold text-slate-900">
                            {currentExam.examName}
                          </span>
                          <span className="text-slate-400"> · </span>
                          <span className="text-slate-600">
                            {currentExam.academicYear} / {currentExam.termName}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 font-mono tabular-nums">
                          <span>
                            Total: <strong>{currentExam.totalMarks}</strong> / {currentExam.totalMaxMarks}
                          </span>
                          <span>
                            Average: <strong>{currentExam.averageMarks}%</strong>
                          </span>
                          <span>
                            Rank:{' '}
                            <strong>
                              {currentExam.rankingsPublished && currentExam.classRank
                                ? `#${currentExam.classRank}`
                                : 'Pending full approval'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Code</th>
                            <th className="py-2.5 px-4 font-medium">Subject</th>
                            <th className="py-2.5 px-4 font-medium text-right">Max Marks</th>
                            <th className="py-2.5 px-4 font-medium text-right">Marks Obtained</th>
                            <th className="py-2.5 px-4 font-medium">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {currentExam.subjectMarks.map((sm) => (
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
                              <td className="py-2.5 px-4 font-mono tabular-nums text-right font-semibold text-slate-900">
                                {sm.isAbsent
                                  ? 'AB (Absent)'
                                  : sm.marksObtained !== null
                                  ? sm.marksObtained
                                  : 'Pending'}
                              </td>
                              <td className="py-2.5 px-4 font-semibold">{sm.gradeLetter}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {(currentExam.teacherRemarks || currentExam.principalRemarks) && (
                        <div className="p-5 bg-slate-50 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="font-semibold text-slate-700">
                              Class Teacher Remarks
                            </div>
                            <p className="text-slate-600 mt-1">
                              {currentExam.teacherRemarks || '-'}
                            </p>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-700">
                              Principal Remarks
                            </div>
                            <p className="text-slate-600 mt-1">
                              {currentExam.principalRemarks || '-'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {currentExam && (
                      <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">
                          Subject-Wise Performance ({currentExam.examName})
                        </h3>
                        <div className="h-60">
                          <Bar
                            data={{
                              labels: currentExam.subjectMarks.map((s) => s.subjectName),
                              datasets: [
                                {
                                  label: 'Marks',
                                  data: currentExam.subjectMarks.map((s) =>
                                    s.isAbsent || s.marksObtained === null ? 0 : s.marksObtained
                                  ),
                                  backgroundColor: '#0F172A',
                                  borderRadius: 4,
                                },
                              ],
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              scales: { y: { beginAtZero: true, max: 100 } },
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-slate-900 mb-4">
                        Term-to-Term Average Trend
                      </h3>
                      <div className="h-60">
                        <Line
                          data={{
                            labels: [...data.examResults].reverse().map((e) => e.examName),
                            datasets: [
                              {
                                label: 'Average (%)',
                                data: [...data.examResults].reverse().map((e) => e.averageMarks),
                                borderColor: '#1D4ED8',
                                tension: 0.25,
                              },
                            ],
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: { y: { beginAtZero: true, max: 100 } },
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="font-display text-lg font-semibold text-slate-900 mb-4">
                Attendance Summary (Excluding School Holidays)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-slate-500">Eligible School Days</div>
                  <div className="font-mono text-xl font-bold mt-1">
                    {data.attendance.eligibleDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-emerald-700">Present</div>
                  <div className="font-mono text-xl font-bold text-emerald-700 mt-1">
                    {data.attendance.presentDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-amber-700">Late</div>
                  <div className="font-mono text-xl font-bold text-amber-700 mt-1">
                    {data.attendance.lateDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-slate-700">Excused</div>
                  <div className="font-mono text-xl font-bold mt-1">
                    {data.attendance.excusedDays}
                  </div>
                </div>
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="text-red-700">Absent</div>
                  <div className="font-mono text-xl font-bold text-red-700 mt-1">
                    {data.attendance.absentDays}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
              <h2 className="font-display text-lg font-semibold text-slate-900 mb-4">
                Student Profile
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Full Name</dt>
                  <dd className="font-medium text-slate-900">
                    {data.student.firstName} {data.student.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Admission Number</dt>
                  <dd className="font-mono text-slate-900">{data.student.admissionNo}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Grade & Class</dt>
                  <dd className="text-slate-900">
                    {data.currentEnrollment?.className || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Academic Year</dt>
                  <dd className="text-slate-900">
                    {data.currentEnrollment?.academicYear || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Guardian Contact</dt>
                  <dd className="text-slate-900">{data.student.guardianPhone || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Address</dt>
                  <dd className="text-slate-900">{data.student.address || '-'}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
};
