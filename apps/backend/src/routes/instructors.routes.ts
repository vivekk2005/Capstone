import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const createInstructorSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(100).default('Instructor@1234'),
  employeeCode: z.string().trim().min(3).max(40).optional(),
  department: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  specialization: z.string().trim().max(120).optional(),
});

const updateInstructorSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  department: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  specialization: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireRole('ADMIN', 'INSTRUCTOR', 'FACILITY_MANAGER'), async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const instructors = await prisma.instructor.findMany({
    where: search
      ? {
          OR: [
            { employeeCode: { contains: search, mode: 'insensitive' } },
            { department: { contains: search, mode: 'insensitive' } },
            { user: { fullName: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : undefined,
    include: {
      user: {
        select: { id: true, fullName: true, email: true, isActive: true },
      },
      _count: {
        select: { sessions: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ instructors });
});

router.get('/:id', requireRole('ADMIN', 'INSTRUCTOR'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const instructor = await prisma.instructor.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, fullName: true, email: true, isActive: true, createdAt: true },
      },
      sessions: {
        include: {
          classroom: { select: { roomCode: true, name: true, maxCapacity: true } },
          _count: { select: { enrollments: true, attendance: true } },
        },
        orderBy: { startTime: 'desc' },
      },
    },
  });

  if (!instructor) {
    res.status(404).json({ error: 'Instructor not found.' });
    return;
  }

  res.json({ instructor });
});

router.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createInstructorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid instructor data' });
    return;
  }

  const { fullName, email, password, employeeCode, department, phone, specialization } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const finalCode =
    employeeCode || `INS-${Date.now().toString().slice(-5)}-${Math.floor(10 + Math.random() * 90)}`;

  const existingCode = await prisma.instructor.findUnique({ where: { employeeCode: finalCode } });
  if (existingCode) {
    res.status(409).json({ error: 'Employee code already exists.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const instructor = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: 'INSTRUCTOR',
      },
    });

    return tx.instructor.create({
      data: {
        userId: user.id,
        employeeCode: finalCode,
        department: department ?? 'Computer Science',
        phone: phone ?? null,
        specialization: specialization ?? null,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, isActive: true } },
      },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'CREATE_INSTRUCTOR',
    entityType: 'INSTRUCTOR',
    entityId: instructor.id,
    details: { employeeCode: instructor.employeeCode, email },
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Instructor created successfully.', instructor });
});

router.patch('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateInstructorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update data' });
    return;
  }

  const id = String(req.params.id);
  const existing = await prisma.instructor.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Instructor not found.' });
    return;
  }

  const { fullName, department, phone, specialization, isActive } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    if (fullName || isActive !== undefined) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(fullName ? { fullName } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });
    }

    return tx.instructor.update({
      where: { id },
      data: {
        ...(department !== undefined ? { department } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(specialization !== undefined ? { specialization } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, isActive: true } },
      },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'UPDATE_INSTRUCTOR',
    entityType: 'INSTRUCTOR',
    entityId: updated.id,
    ipAddress: req.ip,
  });

  res.json({ message: 'Instructor updated successfully.', instructor: updated });
});

export default router;
