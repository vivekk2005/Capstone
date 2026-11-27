import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { sha256 } from '../lib/security';
import { AUTH_COOKIE_NAME, extractToken, requireAuth, signAuthToken } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().trim().min(7).max(20).optional(),
  courseBatch: z.string().trim().min(2).max(80).default('CSE-2026'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(100).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Invalid reset token'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
    return;
  }

  const { fullName, email, password, phone, courseBatch } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const generatedCode = `STU-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: 'STUDENT',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await tx.student.create({
      data: {
        userId: user.id,
        studentCode: generatedCode,
        phone: phone ?? null,
        courseBatch,
      },
    });

    return user;
  });

  const accessToken = signAuthToken(createdUser);
  setAuthCookie(res, accessToken);

  await logAudit({
    actorUserId: createdUser.id,
    action: 'USER_REGISTER',
    entityType: 'USER',
    entityId: createdUser.id,
    details: { email: createdUser.email, role: createdUser.role },
    ipAddress: req.ip,
  });

  res.status(201).json({
    message: 'Student account registered successfully.',
    user: createdUser,
    accessToken,
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials' });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      studentProfile: true,
      instructorProfile: true,
    },
  });

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: 'Account is disabled. Please contact the administrator.' });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    await logAudit({
      actorUserId: user.id,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: user.id,
      details: { email },
      ipAddress: req.ip,
    });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const safeUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    studentProfile: user.studentProfile,
    instructorProfile: user.instructorProfile,
  };

  const accessToken = signAuthToken(safeUser);
  setAuthCookie(res, accessToken);

  await logAudit({
    actorUserId: user.id,
    action: 'USER_LOGIN',
    entityType: 'USER',
    entityId: user.id,
    details: { role: user.role },
    ipAddress: req.ip,
  });

  res.json({
    message: 'Logged in successfully.',
    user: safeUser,
    accessToken,
  });
});

router.post('/logout', async (req: Request, res: Response) => {
  const token = extractToken(req);
  clearAuthCookie(res);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (token) {
    let actorUserId: string | undefined;
    let actorRole: string | undefined;
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret) as { sub?: string; role?: string };
        actorUserId = decoded.sub;
        actorRole = decoded.role;
      }
    } catch {
      // Ignore expired/invalid tokens during logout cleanup
    }

    await logAudit({
      actorUserId,
      action: 'USER_LOGOUT',
      entityType: 'USER',
      entityId: actorUserId,
      details: actorRole ? { role: actorRole } : undefined,
      ipAddress: req.ip,
    });
  }

  res.json({ message: 'Logged out successfully.' });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
      studentProfile: true,
      instructorProfile: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({ user });
});

router.patch('/profile', requireAuth, async (req: Request, res: Response) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    return;
  }

  const { fullName, phone, currentPassword, newPassword } = parsed.data;
  const currentUser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { studentProfile: true, instructorProfile: true },
  });

  if (!currentUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  let nextPasswordHash: string | undefined;
  if (newPassword) {
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required to set a new password.' });
      return;
    }
    const matches = await bcrypt.compare(currentPassword, currentUser.passwordHash);
    if (!matches) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    nextPasswordHash = await bcrypt.hash(newPassword, 12);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: currentUser.id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    if (phone !== undefined && currentUser.studentProfile) {
      await tx.student.update({
        where: { userId: currentUser.id },
        data: { phone },
      });
    }

    if (phone !== undefined && currentUser.instructorProfile) {
      await tx.instructor.update({
        where: { userId: currentUser.id },
        data: { phone },
      });
    }

    return user;
  });

  await logAudit({
    actorUserId: currentUser.id,
    action: 'PROFILE_UPDATE',
    entityType: 'USER',
    entityId: currentUser.id,
    details: { passwordChanged: Boolean(nextPasswordHash) },
    ipAddress: req.ip,
  });

  res.json({ message: 'Profile updated successfully.', user: updated });
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email' });
    return;
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    res.json({
      message: 'If an active account exists for this email, a password reset token has been generated.',
    });
    return;
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  await logAudit({
    actorUserId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'USER',
    entityId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    message: 'Password reset token generated (valid for 15 minutes).',
    ...(process.env.NODE_ENV === 'development'
      ? { devResetToken: rawToken, note: 'Shown only in local development because SMTP email is not configured.' }
      : {}),
  });
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    return;
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = sha256(token);

  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
    res.status(400).json({ error: 'Reset token is invalid or has expired.' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash },
    });

    await tx.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    });
  });

  await logAudit({
    actorUserId: resetRecord.userId,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'USER',
    entityId: resetRecord.userId,
    ipAddress: req.ip,
  });

  res.json({ message: 'Password reset successful. You can now log in with your new password.' });
});

export default router;
