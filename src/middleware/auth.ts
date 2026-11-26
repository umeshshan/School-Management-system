import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/security.ts';
import { db } from '../db/index.ts';
import { parents, students, teachers, users } from '../db/schema.ts';
import { count, eq } from 'drizzle-orm';
import { ensureSystemInitialized } from '../db/bootstrap.ts';

export interface AuthenticatedUser {
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

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

async function resolveUserContext(userRow: typeof users.$inferSelect): Promise<AuthenticatedUser> {
  let studentId: number | null = null;
  let teacherId: number | null = null;
  let parentId: number | null = null;

  if (userRow.role === 'student') {
    const [st] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, userRow.id));
    studentId = st?.id ?? null;
  } else if (userRow.role === 'teacher') {
    const [tc] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.userId, userRow.id));
    teacherId = tc?.id ?? null;
  } else if (userRow.role === 'parent') {
    const [pr] = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.userId, userRow.id));
    parentId = pr?.id ?? null;
  }

  return {
    id: userRow.id,
    uid: userRow.uid,
    email: userRow.email,
    loginId: userRow.loginId,
    fullName: userRow.fullName,
    role: userRow.role as AuthenticatedUser['role'],
    isActive: userRow.isActive,
    studentId,
    teacherId,
    parentId,
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await ensureSystemInitialized();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Empty token' });
    }

    // Path A: Server-issued HMAC session token (credential/PIN login)
    if (token.startsWith('acadexia.')) {
      const payload = verifySessionToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
      }
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId));
      if (!userRow || !userRow.isActive) {
        return res.status(403).json({ error: 'Account is inactive or unavailable' });
      }
      req.authUser = await resolveUserContext(userRow);
      return next();
    }

    // Path B: Firebase ID Token (Google Sign-In)
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase().trim();
    const displayName = decodedToken.name || email.split('@')[0] || 'School User';

    if (!email) {
      return res.status(401).json({ error: 'Google account has no verified email' });
    }

    // Look up by UID first, then by pre-provisioned email
    let [userRow] = await db.select().from(users).where(eq(users.uid, uid));

    if (!userRow) {
      const [byEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (byEmail) {
        const [updated] = await db
          .update(users)
          .set({
            uid,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, byEmail.id))
          .returning();
        userRow = updated;
      } else {
        // First user / admin bootstrap: assign 'admin' if zero admins exist
        const [{ value: adminCount }] = await db
          .select({ value: count() })
          .from(users)
          .where(eq(users.role, 'admin'));

        if (adminCount === 0) {
          const [created] = await db
            .insert(users)
            .values({
              uid,
              email,
              fullName: displayName,
              role: 'admin',
              isActive: true,
              lastLoginAt: new Date(),
            })
            .onConflictDoUpdate({
              target: users.uid,
              set: { email, lastLoginAt: new Date(), updatedAt: new Date() },
            })
            .returning();
          userRow = created;
        } else {
          return res.status(403).json({
            error:
              'Your Google account is not yet registered in the school directory. Please contact the School Administrator to create your account.',
          });
        }
      }
    } else {
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, userRow.id));
    }

    if (!userRow.isActive) {
      return res.status(403).json({
        error: 'Your account has been deactivated. Contact the School Administrator.',
      });
    }

    req.authUser = await resolveUserContext(userRow);
    return next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Unauthorized: Authentication failed' });
  }
};

export function requireRole(...roles: Array<'admin' | 'teacher' | 'student' | 'parent'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires ${roles.join(' or ')} role`,
      });
    }
    return next();
  };
}
