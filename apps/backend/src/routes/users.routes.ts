import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(100),
  role: z.enum(['ADMIN', 'INSTRUCTOR', 'FACILITY_MANAGER', 'STUDENT']),
  phone: z.string().trim().min(7).max(20).optional(),
  courseBatch: z.string().trim().min(2).max(80).optional(),
  department: z.string().trim().min(2).max(80).optional(),
  specialization: z.string().trim().min(2).max(120).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'INSTRUCTOR', 'FACILITY_MANAGER', 'STUDENT']).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).max(100).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const roleParam = typeof req.query.role === 'string' ? req.query.role.toUpperCase() : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

  const validRoles: UserRole[] = ['ADMIN', 'INSTRUCTOR', 'FACILITY_MANAGER', 'STUDENT'];
  const roleFilter =
    roleParam && validRoles.includes(roleParam as UserRole) ? (roleParam as UserRole) : undefined;

  const users = await prisma.user.findMany({
    where: {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
      studentProfile: {
        select: { studentCode: true, courseBatch: true, status: true },
      },
      instructorProfile: {
        select: { employeeCode: true, department: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ users });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
    return;
  }

  const { fullName, email, password, role, phone, courseBatch, department, specialization } =
    parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const suffix = `${Date.now().toString().slice(-5)}${Math.floor(10 + Math.random() * 90)}`;

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role,
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

    if (role === 'STUDENT') {
      await tx.student.create({
        data: {
          userId: user.id,
          studentCode: `STU-${suffix}`,
          phone: phone ?? null,
          courseBatch: courseBatch || 'CSE-2026',
        },
      });
    } else if (role === 'INSTRUCTOR') {
      await tx.instructor.create({
        data: {
          userId: user.id,
          employeeCode: `INS-${suffix}`,
          phone: phone ?? null,
          department: department || 'Computer Science',
          specialization: specialization ?? null,
        },
      });
    }

    return user;
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'ADMIN_CREATE_USER',
    entityType: 'USER',
    entityId: created.id,
    details: { email: created.email, role: created.role },
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'User created successfully.', user: created });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update data' });
    return;
  }

  const userId = String(req.params.id);
  const { fullName, role, isActive, newPassword } = parsed.data;

  if (userId === req.user!.id && isActive === false) {
    res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : undefined;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(fullName ? { fullName } : {}),
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'ADMIN_UPDATE_USER',
    entityType: 'USER',
    entityId: updated.id,
    details: { role: updated.role, isActive: updated.isActive, passwordReset: Boolean(passwordHash) },
    ipAddress: req.ip,
  });

  res.json({ message: 'User updated successfully.', user: updated });
});

router.get('/audit-logs', async (_req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      actor: {
        select: { fullName: true, email: true, role: true },
      },
    },
  });

  res.json({ logs });
});

export default router;
