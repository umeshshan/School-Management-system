import React, { useEffect, useState } from 'react';
import { Lock, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { loginWithGoogle, loginWithCredentials, authError, loading } = useAuth();
  const [schoolInfo, setSchoolInfo] = useState({
    schoolName: 'Ke/De Nakkavita Kanishta Vidyalaya',
    schoolAddress: 'Grades 6–13 Academic Campus',
    academicMotto: 'Education • Discipline • Knowledge',
  });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/public-info')
      .then((r) => r.json())
      .then((d) => {
        if (d.schoolName) setSchoolInfo(d);
      })
      .catch(() => {});
  }, []);

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await loginWithCredentials(identifier, password);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier }),
      });
      const data = await res.json();
      setResetMsg(data.message || data.error);
    } catch {
      setResetMsg('Unable to submit password reset request.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Architectural Visual Panel */}
        <div className="lg:col-span-5 relative bg-slate-900 min-h-[260px] lg:min-h-[620px]">
          <img
            src="/src/assets/images/campus_library_hero_1795680650845.jpg"
            alt="Collegiate campus library and courtyard"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/45 to-slate-900/20 flex flex-col justify-end p-8">
            <p className="text-xs font-medium tracking-wider text-slate-300 mb-2">
              Grades 6–13 · Since 1921
            </p>
            <h2 className="font-display text-2xl font-bold text-white leading-snug text-balance">
              {schoolInfo.schoolName}
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              {schoolInfo.academicMotto}
            </p>
          </div>
        </div>

        {/* Right Sign-In Portal */}
        <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3.5 mb-8">
              <div className="w-14 h-14 rounded-full border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  src="/assets/aistudio/1000195705_95727674.jpg"
                  alt="Ke/De Nakkavita Kanishta Vidyalaya Crest"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                  {schoolInfo.schoolName}
                </h1>
                <p className="text-xs text-slate-500">
                  {schoolInfo.schoolAddress}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="font-display text-2xl font-semibold text-slate-900 text-balance">
                Sign in to your academic workspace
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Role-isolated access for Administrators, Teachers, Students, and Parents.
              </p>
            </div>

            {(authError || formError) && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800"
              >
                {formError || authError}
              </div>
            )}

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={loginWithGoogle}
              disabled={loading}
              className="w-full py-2.5 px-4 border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continue with Google Account</span>
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-xs text-slate-400">
                Or sign in with School ID & Password / PIN
              </span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            {!showReset ? (
              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email, Admission ID, or Employee ID
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. STU-2026-001 or teacher@school.edu"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-700">
                      Password or Student PIN
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowReset(true)}
                      className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password or PIN"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{submitting ? 'Verifying...' : 'Sign In'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Enter your School Email or Admission / Employee ID
                  </label>
                  <input
                    type="text"
                    required
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="e.g. STU-2026-001 or name@school.edu"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                {resetMsg && (
                  <p className="text-xs text-slate-700 bg-slate-100 p-3 rounded-lg border border-slate-200">
                    {resetMsg}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    Request Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReset(false);
                      setResetMsg(null);
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
              Role-isolated sessions · Server-verified access
            </span>
            <span>Grades 6–13</span>
          </div>
        </div>
      </div>
    </div>
  );
};
