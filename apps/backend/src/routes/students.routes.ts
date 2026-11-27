import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { StudentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const createStudentSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(100).default('Student@1234'),
  studentCode: z.string().trim().min(3).max(40).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  courseBatch: z.string().trim().min(2).max(80),
  enrollmentDate: z.string().optional(),
});

const updateStudentSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  courseBatch: z.string().trim().min(2).max(80).optional(),
  enrollmentDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED']).optional(),
});

router.get('/', requireRole('ADMIN', 'INSTRUCTOR'), async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const batch = typeof req.query.batch === 'string' ? req.query.batch.trim() : '';
  const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const validStatuses: StudentStatus[] = ['ACTIVE', 'INACTIVE', 'GRADUATED'];
  const statusFilter = validStatuses.includes(statusParam as StudentStatus)
    ? (statusParam as StudentStatus)
    : undefined;

  const students = await prisma.student.findMany({
    where: {
      ...(batch ? { courseBatch: { equals: batch, mode: 'insensitive' } } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search
        ? {
            OR: [
              { studentCode: { contains: search, mode: 'insensitive' } },
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      user: {
        select: { id: true, fullName: true, email: true, isActive: true },
      },
      _count: {
        select: { enrollments: true, attendance: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const batches = await prisma.student.findMany({
    distinct: ['courseBatch'],
    select: { courseBatch: true },
    orderBy: { courseBatch: 'asc' },
  });

  res.json({
    students,
    batches: batches.map((b) => b.courseBatch),
  });
});

router.get('/:id', requireRole('ADMIN', 'INSTRUCTOR'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, fullName: true, email: true, isActive: true, createdAt: true },
      },
      enrollments: {
        include: {
          session: {
            include: {
              classroom: { select: { roomCode: true, name: true } },
              instructor: { include: { user: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
      },
      attendance: {
        include: {
          session: { select: { id: true, title: true, sessionDate: true } },
        },
        orderBy: { markedAt: 'desc' },
      },
    },
  });

  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  res.json({ student });
});

router.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid student data' });
    return;
  }

  const { fullName, email, password, studentCode, phone, courseBatch, enrollmentDate } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const finalCode =
    studentCode || `STU-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  const existingCode = await prisma.student.findUnique({ where: { studentCode: finalCode } });
  if (existingCode) {
    res.status(409).json({ error: 'Student ID already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const student = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: 'STUDENT',
      },
    });

    return tx.student.create({
      data: {
        userId: user.id,
        studentCode: finalCode,
        phone: phone ?? null,
        courseBatch,
        enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : new Date(),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, isActive: true } },
      },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'CREATE_STUDENT',
    entityType: 'STUDENT',
    entityId: student.id,
    details: { studentCode: student.studentCode, email },
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Student created successfully.', student });
});

router.patch('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid student update' });
    return;
  }

  const id = String(req.params.id);
  const existing = await prisma.student.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!existing) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  const { fullName, email, phone, courseBatch, enrollmentDate, status } = parsed.data;

  if (email && email !== existing.user.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      res.status(409).json({ error: 'Email is already in use by another account.' });
      return;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (fullName || email || status !== undefined) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(fullName ? { fullName } : {}),
          ...(email ? { email } : {}),
          ...(status !== undefined ? { isActive: status === 'ACTIVE' } : {}),
        },
      });
    }

    return tx.student.update({
      where: { id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(courseBatch ? { courseBatch } : {}),
        ...(enrollmentDate ? { enrollmentDate: new Date(enrollmentDate) } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, isActive: true } },
      },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'UPDATE_STUDENT',
    entityType: 'STUDENT',
    entityId: updated.id,
    details: { status: updated.status, courseBatch: updated.courseBatch },
    ipAddress: req.ip,
  });

  res.json({ message: 'Student updated successfully.', student: updated });
});

router.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const student = await prisma.student.findUnique({
    where: { id },
    include: { _count: { select: { attendance: true } } },
  });

  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  if (student._count.attendance > 0) {
    await prisma.$transaction([
      prisma.student.update({ where: { id }, data: { status: 'INACTIVE' } }),
      prisma.user.update({ where: { id: student.userId }, data: { isActive: false } }),
    ]);

    await logAudit({
      actorUserId: req.user!.id,
      action: 'DEACTIVATE_STUDENT',
      entityType: 'STUDENT',
      entityId: id,
      details: { reason: 'Preserved attendance history' },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Student has attendance history, so record was deactivated instead of deleted.',
      deactivated: true,
    });
    return;
  }

  await prisma.user.delete({ where: { id: student.userId } });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'DELETE_STUDENT',
    entityType: 'STUDENT',
    entityId: id,
    ipAddress: req.ip,
  });

  res.json({ message: 'Student deleted successfully.', deactivated: false });
});

export default router;
