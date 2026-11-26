import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface AuthUser {
  id: number;
  uid: string | null;
  email: string;
  loginId: string | null;
  fullName: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  isActive: boolean;
  studentId?: number | null;
  teacherId?: number | null;
  parentId?: number | null;
}

export interface SchoolSettings {
  schoolName: string;
  schoolAddress: string;
  schoolEmail: string;
  schoolPhone: string;
  principalName: string;
  academicMotto: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface AuthContextValue {
  loading: boolean;
  authError: string | null;
  user: AuthUser | null;
  profile: Record<string, unknown> | null;
  schoolSettings: SchoolSettings | null;
  notifications: NotificationItem[];
  loginWithGoogle: () => Promise<void>;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
  downloadFile: (url: string, fallbackFilename: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const getBearerToken = useCallback(async (): Promise<string | null> => {
    if (sessionToken) return sessionToken;
    if (firebaseUser) {
      return await firebaseUser.getIdToken();
    }
    return null;
  }, [sessionToken, firebaseUser]);

  const apiFetch = useCallback(
    async <T = unknown,>(url: string, init?: RequestInit): Promise<T> => {
      const token = await getBearerToken();
      const headers = new Headers(init?.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(url, { ...init, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      return data as T;
    },
    [getBearerToken]
  );

  const downloadFile = useCallback(
    async (url: string, fallbackFilename: string) => {
      const token = await getBearerToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(url, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'File download failed.');
      }

      const blob = await response.blob();
      const disp = response.headers.get('Content-Disposition') || '';
      const match = disp.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || fallbackFilename;

      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    },
    [getBearerToken]
  );

  const hydrateMe = useCallback(
    async (token: string) => {
      try {
        setAuthError(null);
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Authentication check failed.');
        }
        setUser(data.user);
        setProfile(data.profile);
        setSchoolSettings(data.schoolSettings);
        setNotifications(data.notifications || []);
      } catch (err: unknown) {
        setUser(null);
        setProfile(null);
        setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        setSessionToken(null);
        const token = await fbUser.getIdToken();
        await hydrateMe(token);
      } else if (!sessionToken) {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [hydrateMe, sessionToken]);

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      await hydrateMe(token);
    } catch (err: unknown) {
      setLoading(false);
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  }, [hydrateMe]);

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string) => {
      setAuthError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials.');
      }
      setSessionToken(data.token);
      await hydrateMe(data.token);
    },
    [hydrateMe]
  );

  const logout = useCallback(async () => {
    setSessionToken(null);
    setUser(null);
    setProfile(null);
    setNotifications([]);
    if (auth.currentUser) {
      await signOut(auth);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const token = await getBearerToken();
    if (token) {
      await hydrateMe(token);
    }
  }, [getBearerToken, hydrateMe]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        authError,
        user,
        profile,
        schoolSettings,
        notifications,
        loginWithGoogle,
        loginWithCredentials,
        logout,
        refreshSession,
        apiFetch,
        downloadFile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
