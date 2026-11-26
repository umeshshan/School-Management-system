import React, { useCallback, useEffect, useState } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend
);

interface StructureProps {
  academicYears: Array<{ id: number; name: string }>;
  terms: Array<{ id: number; name: string; academicYearId: number }>;
  classes: Array<{ id: number; name: string; grade: number; academicYearId: number }>;
  subjects: Array<{ id: number; code: string; name: string }>;
  exams: Array<{ id: number; name: string; termId: number; academicYearId: number }>;
}

interface AnalyticsData {
  totalApprovedEntries: number;
  overallAverage: number;
  passPercentage: number;
  gradePerformance: Array<{ label: string; average: number }>;
  classComparison: Array<{ label: string; average: number }>;
  subjectAverages: Array<{ label: string; average: number }>;
  examTrends: Array<{ label: string; average: number }>;
  gradeDistribution: Array<{ label: string; count: number }>;
  top10Students: Array<{
    studentId: number;
    admissionNo: string;
    studentName: string;
    className: string;
    averageMarks: number;
    subjectsGraded: number;
  }>;
  supportStudents: Array<{
    studentId: number;
    admissionNo: string;
    studentName: string;
    className: string;
    averageMarks: number;
    subjectsGraded: number;
  }>;
}

export const AnalyticsPanel: React.FC<{ structure: StructureProps }> = ({
  structure,
}) => {
  const { apiFetch } = useAuth();
  const [filters, setFilters] = useState({
    academicYearId: '',
    termId: '',
    grade: '',
    classId: '',
    subjectId: '',
    examId: '',
  });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) qs.set(k, v);
      });
      const res = await apiFetch<AnalyticsData>(
        `/api/analytics/overview?${qs.toString()}`
      );
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filters]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleGenerateInsight = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ text: string }>('/api/ai/insight', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'class_summary',
          context: {
            overallAverage: data.overallAverage,
            passPercentage: data.passPercentage,
            totalApprovedEntries: data.totalApprovedEntries,
            gradePerformance: data.gradePerformance,
            subjectAverages: data.subjectAverages,
            supportStudentsCount: data.supportStudents.length,
          },
        }),
      });
      setAiInsight(res.text);
    } catch (err: unknown) {
      setAiInsight(err instanceof Error ? err.message : 'Unable to generate insight.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Official Academic Performance Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Computed exclusively from Admin-approved examination results
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateInsight}
          disabled={aiLoading || !data}
          className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{aiLoading ? 'Summarizing...' : 'Summarize Performance'}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <select
          value={filters.academicYearId}
          onChange={(e) => setFilters({ ...filters, academicYearId: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Academic Years</option>
          {structure.academicYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
        <select
          value={filters.termId}
          onChange={(e) => setFilters({ ...filters, termId: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Terms</option>
          {structure.terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filters.grade}
          onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Grades (6–13)</option>
          {[6, 7, 8, 9, 10, 11, 12, 13].map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          value={filters.classId}
          onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
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
          value={filters.subjectId}
          onChange={(e) => setFilters({ ...filters, subjectId: e.target.value })}
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
          value={filters.examId}
          onChange={(e) => setFilters({ ...filters, examId: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Examinations</option>
          {structure.exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
      </div>

      {aiInsight && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 whitespace-pre-line">
          <div className="text-xs font-semibold text-slate-500 mb-1">
            Performance Summary
          </div>
          {aiInsight}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Loading approved analytics...
        </div>
      ) : data.totalApprovedEntries === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-slate-900">
            No approved examination marks match these filters yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Official performance charts populate automatically once Teachers upload marks and Admin approves them.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Overall School Average</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {data.overallAverage}%
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Pass Percentage</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {data.passPercentage}%
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500">Approved Mark Records</p>
              <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {data.totalApprovedEntries}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                Grade-Wise & Class Performance Average
              </h3>
              <div className="h-64">
                <Bar
                  data={{
                    labels: data.classComparison.map((c) => c.label),
                    datasets: [
                      {
                        label: 'Class Average (%)',
                        data: data.classComparison.map((c) => c.average),
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

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                Subject-Wise Average
              </h3>
              <div className="h-64">
                <Bar
                  data={{
                    labels: data.subjectAverages.map((s) => s.label),
                    datasets: [
                      {
                        label: 'Subject Average',
                        data: data.subjectAverages.map((s) => s.average),
                        backgroundColor: '#1D4ED8',
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

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                Grade Distribution
              </h3>
              <div className="h-64 flex items-center justify-center">
                <Doughnut
                  data={{
                    labels: data.gradeDistribution.map((g) => g.label),
                    datasets: [
                      {
                        data: data.gradeDistribution.map((g) => g.count),
                        backgroundColor: [
                          '#15803D',
                          '#1D4ED8',
                          '#0284C7',
                          '#D97706',
                          '#DC2626',
                          '#64748B',
                        ],
                      },
                    ],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">
                Examination Trend
              </h3>
              <div className="h-64">
                <Line
                  data={{
                    labels: data.examTrends.map((e) => e.label),
                    datasets: [
                      {
                        label: 'Overall Exam Average',
                        data: data.examTrends.map((e) => e.average),
                        borderColor: '#0F172A',
                        backgroundColor: 'rgba(15,23,42,0.1)',
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

          {/* Top 10 & Support Needed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">
                  Top 10 Performing Students
                </h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">#</th>
                    <th className="py-2.5 px-4 font-medium">Admission ID</th>
                    <th className="py-2.5 px-4 font-medium">Student</th>
                    <th className="py-2.5 px-4 font-medium">Class</th>
                    <th className="py-2.5 px-4 font-medium text-right">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.top10Students.map((st, idx) => (
                    <tr key={st.studentId}>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                        {st.admissionNo}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {st.studentName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{st.className}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-semibold text-emerald-700">
                        {st.averageMarks}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">
                  Students Requiring Academic Support (&lt; 45%)
                </h3>
              </div>
              {data.supportStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No students currently below the 45% support threshold.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Admission ID</th>
                      <th className="py-2.5 px-4 font-medium">Student</th>
                      <th className="py-2.5 px-4 font-medium">Class</th>
                      <th className="py-2.5 px-4 font-medium text-right">Average</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.supportStudents.map((st) => (
                      <tr key={st.studentId}>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                          {st.admissionNo}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {st.studentName}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{st.className}</td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-right font-semibold text-red-700">
                          {st.averageMarks}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
