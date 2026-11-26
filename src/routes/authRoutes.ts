import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.ts';
import {
  notifications,
  parents,
  schoolSettings,
  students,
  teachers,
  users,
} from '../db/schema.ts';
import { desc, eq, or } from 'drizzle-orm';
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  hashPassword,
  logAudit,
  signSessionToken,
  verifyPassword,
} from '../lib/security.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { ensureSystemInitialized } from '../db/bootstrap.ts';

const router = Router();

router.get('/public-info', async (_req, res) => {
  try {
    await ensureSystemInitialized();
    const [settings] = await db.select().from(schoolSettings);
    res.json({
      schoolName: settings?.schoolName || 'Ke/De Nakkavita Kanishta Vidyalaya',
      schoolAddress: settings?.schoolAddress || 'Grades 6–13 Academic Campus',
      academicMotto:
        settings?.academicMotto || 'Education • Discipline • Knowledge',
    });
  } catch (error) {
    console.error('Failed to load public info:', error);
    res.status(500).json({ error: 'Unable to load school information' });
  }
});

router.post('/login', async (req, res) => {
  try {
    await ensureSystemInitialized();
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: 'Email or Admission/Employee ID and password are required.' });
    }

    const rateKey = `${req.ip}:${identifier.toLowerCase()}`;
    const rate = checkLoginRateLimit(rateKey);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `Too many login attempts. Try again in ${rate.retryAfterSeconds} seconds.`,
      });
    }

    const [userRow] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, identifier.toLowerCase()),
          eq(users.loginId, identifier.toUpperCase()),
          eq(users.loginId, identifier)
        )
      );

    if (!userRow || !userRow.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (userRow.lockedUntil && userRow.lockedUntil > new Date()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to repeated failed attempts. Try again later.',
      });
    }

    if (!userRow.isActive) {
      return res
        .status(403)
        .json({ error: 'Account is deactivated. Contact the School Administrator.' });
    }

    const valid = verifyPassword(password, userRow.passwordHash);
    if (!valid) {
      const nextFailures = userRow.failedLoginAttempts + 1;
      const lockUntil =
        nextFailures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db
        .update(users)
        .set({
          failedLoginAttempts: nextFailures,
          lockedUntil: lockUntil,
        })
        .where(eq(users.id, userRow.id));

      await logAudit({
        userId: userRow.id,
        userEmail: userRow.email,
        userRole: userRow.role,
        action: 'FAILED_LOGIN',
        entityType: 'users',
        entityId: userRow.id,
        ipAddress: req.ip,
      });

      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    clearLoginRateLimit(rateKey);
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, userRow.id));

    const token = signSessionToken({
      userId: userRow.id,
      role: userRow.role,
      email: userRow.email,
    });

    await logAudit({
      userId: userRow.id,
      userEmail: userRow.email,
      userRole: userRow.role,
      action: 'LOGIN_CREDENTIAL',
      entityType: 'users',
      entityId: userRow.id,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: userRow.id,
        email: userRow.email,
        loginId: userRow.loginId,
        fullName: userRow.fullName,
        role: userRow.role,
      },
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const [settings] = await db.select().from(schoolSettings);

    let profile: Record<string, unknown> | null = null;
    if (user.role === 'student' && user.studentId) {
      const [st] = await db
        .select()
        .from(students)
        .where(eq(students.id, user.studentId));
      profile = st || null;
    } else if (user.role === 'teacher' && user.teacherId) {
      const [tc] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.id, user.teacherId));
      profile = tc || null;
    } else if (user.role === 'parent' && user.parentId) {
      const [pr] = await db
        .select()
        .from(parents)
        .where(eq(parents.id, user.parentId));
      profile = pr || null;
    }

    const recentNotifications = await db
      .select()
      .from(notifications)
      .where(
        or(
          eq(notifications.userId, user.id),
          eq(notifications.targetRole, user.role),
          eq(notifications.targetRole, 'all')
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    res.json({
      user,
      profile,
      schoolSettings: settings || null,
      notifications: recentNotifications,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to load user session.' });
  }
});

router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 4) {
      return res
        .status(400)
        .json({ error: 'Password or PIN must be at least 4 characters.' });
    }
    const newHash = hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, req.authUser!.id));

    await logAudit({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'CHANGE_OWN_PASSWORD',
      entityType: 'users',
      entityId: req.authUser!.id,
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

router.post('/request-reset', async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Email or ID is required.' });
    }
    const [userRow] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, identifier.toLowerCase()),
          eq(users.loginId, identifier.toUpperCase())
        )
      );

    if (userRow) {
      const resetToken = crypto.randomBytes(4).toString('hex').toUpperCase();
      const resetHash = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
      await db
        .update(users)
        .set({
          resetTokenHash: resetHash,
          resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        })
        .where(eq(users.id, userRow.id));

      // Notify admins so school office can assist or relay token securely
      await db.insert(notifications).values({
        targetRole: 'admin',
        title: 'Password Reset Requested',
        message: `Account ${userRow.email} (${userRow.role}) requested a password/PIN reset.`,
        type: 'warning',
      });
    }

    res.json({
      message:
        'If a matching account exists, a password reset request has been logged with the School Administration Office.',
    });
  } catch (error) {
    console.error('Reset request failed:', error);
    res.status(500).json({ error: 'Failed to process reset request.' });
  }
});

export default router;
