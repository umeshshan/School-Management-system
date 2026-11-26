import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

interface AssignmentItem {
  id: number;
  academicYearId: number;
  classId: number;
  className: string;
  grade: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
}

interface PreviewResponse {
  importId: number;
  filename: string;
  duplicateFileDetected: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingMarksRows: number;
  duplicateRows: number;
  existingMarksRows: number;
  approvedLockedRows: number;
  canConfirm: boolean;
  structuralErrors: string[];
  rows: Array<{
    rowNumber: number;
    admissionNo: string;
    studentName: string;
    rawMarks: string;
    parsedMarks: number | null;
    isAbsent: boolean;
    isValid: boolean;
    hasExistingMark: boolean;
    existingIsApproved: boolean;
    errorMessage: string | null;
    actionTaken: string;
  }>;
}

interface ImportHistoryItem {
  id: number;
  academicYear: string;
  className: string;
  termName: string;
  examName: string;
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
}

export const ExcelMarksWorkflow: React.FC<{
  structure: StructureData;
  exams: ExamItem[];
  assignments: AssignmentItem[];
  isAdmin: boolean;
}> = ({ structure, exams, assignments, isAdmin }) => {
  const { apiFetch, downloadFile } = useAuth();
  const defaultYear =
    structure.academicYears.find((y) => y.isCurrent)?.id ||
    structure.academicYears[0]?.id ||
    0;

  const [academicYearId, setAcademicYearId] = useState<number>(defaultYear);
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [classId, setClassId] = useState<number>(0);
  const [termId, setTermId] = useState<number>(0);
  const [examId, setExamId] = useState<number>(0);
  const [subjectId, setSubjectId] = useState<number>(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ imports: ImportHistoryItem[] }>('/api/excel/imports');
      setHistory(res.imports);
    } catch {
      // ignore
    }
  }, [apiFetch]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const availableClasses = useMemo(() => {
    let list = structure.classes.filter((c) => c.academicYearId === academicYearId);
    if (!isAdmin) {
      const assignedIds = new Set(
        assignments
          .filter((a) => a.academicYearId === academicYearId)
          .map((a) => a.classId)
      );
      list = list.filter((c) => assignedIds.has(c.id));
    }
    if (gradeFilter) {
      list = list.filter((c) => c.grade === Number(gradeFilter));
    }
    return list;
  }, [structure.classes, academicYearId, isAdmin, assignments, gradeFilter]);

  const availableTerms = useMemo(
    () => structure.terms.filter((t) => t.academicYearId === academicYearId),
    [structure.terms, academicYearId]
  );

  const availableExams = useMemo(
    () =>
      exams.filter(
        (e) =>
          e.academicYearId === academicYearId &&
          (!termId || e.termId === termId)
      ),
    [exams, academicYearId, termId]
  );

  const availableSubjects = useMemo(() => {
    if (isAdmin) {
      return structure.subjects.filter((s) => s.isActive);
    }
    const assignedSubjIds = new Set(
      assignments
        .filter(
          (a) =>
            a.academicYearId === academicYearId &&
            (!classId || a.classId === classId)
        )
        .map((a) => a.subjectId)
    );
    return structure.subjects.filter((s) => s.isActive && assignedSubjIds.has(s.id));
  }, [isAdmin, structure.subjects, assignments, academicYearId, classId]);

  const readySelection = Boolean(
    academicYearId && classId && termId && examId && subjectId
  );

  const handleDownloadTemplate = async () => {
    if (!readySelection) return;
    setMessage(null);
    setBusy(true);
    try {
      const qs = new URLSearchParams({
        academicYearId: String(academicYearId),
        classId: String(classId),
        examId: String(examId),
        subjectId: String(subjectId),
      });
      await downloadFile(`/api/excel/template?${qs.toString()}`, 'MarksTemplate.xlsx');
      setMessage({
        type: 'success',
        text: 'Excel template downloaded. Enter marks in Column I (0..Max Marks or AB) and upload the completed file below.',
      });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Template download failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUploadPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!readySelection || !selectedFile) return;
    setMessage(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('academicYearId', String(academicYearId));
      form.append('classId', String(classId));
      form.append('termId', String(termId));
      form.append('examId', String(examId));
      form.append('subjectId', String(subjectId));

      const res = await apiFetch<PreviewResponse>('/api/excel/preview', {
        method: 'POST',
        body: form,
      });
      setPreview(res);
      await loadHistory();
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Excel validation failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ savedCount: number }>('/api/excel/confirm', {
        method: 'POST',
        body: JSON.stringify({
          importId: preview.importId,
          allowOverwriteApproved: isAdmin,
        }),
      });
      setMessage({
        type: 'success',
        text: `Saved ${res.savedCount} validated mark record(s) and submitted for Admin approval.`,
      });
      setPreview(null);
      setSelectedFile(null);
      await loadHistory();
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to confirm marks import.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Direct Excel Marks Entry & Upload
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Select your target examination and subject, download the pre-populated .xlsx workbook, enter marks directly in Excel, and upload for database validation.
          </p>
        </div>

        {message && (
          <div
            className={`p-3.5 rounded-lg border text-xs ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Step 1: Context Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Academic Year
            </label>
            <select
              value={academicYearId}
              onChange={(e) => {
                setAcademicYearId(Number(e.target.value));
                setClassId(0);
                setTermId(0);
                setExamId(0);
                setSubjectId(0);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {structure.academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Grade Filter (6–13)
            </label>
            <select
              value={gradeFilter}
              onChange={(e) => {
                setGradeFilter(e.target.value);
                setClassId(0);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Assigned Grades</option>
              {[6, 7, 8, 9, 10, 11, 12, 13].map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Class
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={0}>Select Class...</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Term
            </label>
            <select
              value={termId}
              onChange={(e) => {
                setTermId(Number(e.target.value));
                setExamId(0);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={0}>Select Term...</option>
              {availableTerms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Examination
            </label>
            <select
              value={examId}
              onChange={(e) => setExamId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={0}>Select Examination...</option>
              {availableExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Subject
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={0}>Select Assigned Subject...</option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 2: Template Download & Upload Controls */}
        <div className="pt-4 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={!readySelection || busy}
            className="px-4 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Download Excel Template (.xlsx)</span>
          </button>

          <form
            onSubmit={handleUploadPreview}
            className="flex flex-wrap items-center gap-3"
          >
            <label className="flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              <span className="truncate max-w-[220px]">
                {selectedFile ? selectedFile.name : 'Choose completed .xlsx file'}
              </span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="submit"
              disabled={!readySelection || !selectedFile || busy}
              className="px-4 py-2.5 text-sm font-medium border border-slate-900 text-slate-900 bg-white hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>{busy ? 'Validating...' : 'Validate & Preview Upload'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Step 3: Import Validation Preview */}
      {preview && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Import Validation Preview — {preview.filename}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review row validation results before committing marks to the database
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `/api/excel/imports/${preview.importId}/error-report`,
                    `ErrorReport_${preview.importId}.xlsx`
                  )
                }
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Error Report (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={!preview.canConfirm || busy}
                className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Submit Valid Marks ({preview.validRows})</span>
              </button>
            </div>
          </div>

          {/* Preview KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-200 border-b border-slate-200 bg-slate-50 text-xs">
            <div className="p-3.5">
              <div className="text-slate-500">Total Records</div>
              <div className="font-mono font-bold text-base text-slate-900 tabular-nums">
                {preview.totalRows}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-emerald-700">Valid Records</div>
              <div className="font-mono font-bold text-base text-emerald-700 tabular-nums">
                {preview.validRows}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-red-700">Invalid Records</div>
              <div className="font-mono font-bold text-base text-red-700 tabular-nums">
                {preview.invalidRows}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-amber-700">Missing Marks</div>
              <div className="font-mono font-bold text-base text-amber-700 tabular-nums">
                {preview.missingMarksRows}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-slate-500">Duplicate Rows</div>
              <div className="font-mono font-bold text-base text-slate-900 tabular-nums">
                {preview.duplicateRows}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-slate-500">Existing Marks</div>
              <div className="font-mono font-bold text-base text-slate-900 tabular-nums">
                {preview.existingMarksRows}
              </div>
            </div>
          </div>

          {(preview.structuralErrors.length > 0 || preview.duplicateFileDetected) && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-800 space-y-1">
              {preview.duplicateFileDetected && (
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Duplicate submission detected: this exact workbook was already submitted for this exam and subject.
                  </span>
                </div>
              )}
              {preview.structuralErrors.map((err, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Row</th>
                  <th className="py-2.5 px-4 font-medium">Student ID</th>
                  <th className="py-2.5 px-4 font-medium">Student Name</th>
                  <th className="py-2.5 px-4 font-medium">Entered Marks</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Action / Validation Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((r, idx) => (
                  <tr key={idx} className={r.isValid ? '' : 'bg-red-50/40'}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                      {r.rowNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-900">
                      {r.admissionNo}
                    </td>
                    <td className="py-2.5 px-4 text-slate-800">{r.studentName}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold">
                      {r.isAbsent ? 'AB (Absent)' : r.rawMarks}
                    </td>
                    <td className="py-2.5 px-4 font-medium">
                      {r.isValid ? (
                        <span className="text-emerald-700">Valid</span>
                      ) : (
                        <span className="text-red-700">Invalid</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {r.errorMessage || r.actionTaken}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Upload History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Excel Import & Submission History
          </h3>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No Excel marks files uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-4 font-medium">Class & Subject</th>
                  <th className="py-2.5 px-4 font-medium">Examination</th>
                  <th className="py-2.5 px-4 font-medium">Valid / Total</th>
                  <th className="py-2.5 px-4 font-medium">Import Status</th>
                  <th className="py-2.5 px-4 font-medium">Approval</th>
                  <th className="py-2.5 px-4 font-medium">Admin Notes</th>
                  <th className="py-2.5 px-4 font-medium text-right">Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-slate-900">{h.className}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="text-slate-700">
                        {h.subjectCode} ({h.subjectName})
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {h.examName} · {h.termName}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      {h.validRows} / {h.totalRows}
                    </td>
                    <td className="py-2.5 px-4 capitalize text-slate-700">
                      {h.importStatus.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-4 capitalize font-medium">
                      <span
                        className={
                          h.approvalStatus === 'approved'
                            ? 'text-emerald-700'
                            : h.approvalStatus === 'rejected'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }
                      >
                        {h.approvalStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-[200px] truncate">
                      {h.adminNotes || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          downloadFile(
                            `/api/excel/imports/${h.id}/error-report`,
                            `ValidationReport_${h.id}.xlsx`
                          )
                        }
                        className="text-slate-700 hover:text-slate-900 underline cursor-pointer"
                      >
                        Validation Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
