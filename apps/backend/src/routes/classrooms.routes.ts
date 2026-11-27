import { Router, Request, Response } from 'express';
import { ClassroomStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const createClassroomSchema = z.object({
  roomCode: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(100),
  building: z.string().trim().min(1).max(100),
  maxCapacity: z.number().int().min(1, 'Capacity must be at least 1').max(500),
  status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE']).default('AVAILABLE'),
});

const updateClassroomSchema = createClassroomSchema.partial();

const equipmentSchema = z.object({
  itemType: z.enum(['COMPUTER', 'MONITOR', 'PROJECTOR', 'FIRE_EXTINGUISHER', 'OTHER']),
  label: z.string().trim().min(2).max(100),
  expectedQuantity: z.number().int().min(0).max(500),
  notes: z.string().trim().max(300).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const validStatuses: ClassroomStatus[] = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'];
  const statusFilter = validStatuses.includes(statusParam as ClassroomStatus)
    ? (statusParam as ClassroomStatus)
    : undefined;

  const classrooms = await prisma.classroom.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search
        ? {
            OR: [
              { roomCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { building: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      equipment: {
        orderBy: { itemType: 'asc' },
      },
      detectionResults: {
        where: { detectionCategory: 'PERSON_COUNT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: { sessions: true, maintenanceTasks: true },
      },
    },
    orderBy: { roomCode: 'asc' },
  });

  res.json({ classrooms });
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const classroom = await prisma.classroom.findUnique({
    where: { id },
    include: {
      equipment: { orderBy: { itemType: 'asc' } },
      sessions: {
        include: {
          instructor: { include: { user: { select: { fullName: true } } } },
        },
        orderBy: { startTime: 'desc' },
        take: 10,
      },
      detectionResults: {
        where: { detectionCategory: 'PERSON_COUNT' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!classroom) {
    res.status(404).json({ error: 'Classroom not found.' });
    return;
  }

  res.json({ classroom });
});

router.post('/', requireRole('ADMIN', 'FACILITY_MANAGER'), async (req: Request, res: Response) => {
  const parsed = createClassroomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid classroom data' });
    return;
  }

  const existing = await prisma.classroom.findUnique({
    where: { roomCode: parsed.data.roomCode },
  });
  if (existing) {
    res.status(409).json({ error: 'A classroom with this Room ID already exists.' });
    return;
  }

  const classroom = await prisma.classroom.create({
    data: parsed.data,
    include: { equipment: true },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'CREATE_CLASSROOM',
    entityType: 'CLASSROOM',
    entityId: classroom.id,
    details: { roomCode: classroom.roomCode, maxCapacity: classroom.maxCapacity },
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Classroom created successfully.', classroom });
});

router.patch('/:id', requireRole('ADMIN', 'FACILITY_MANAGER'), async (req: Request, res: Response) => {
  const parsed = updateClassroomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid classroom update' });
    return;
  }

  const id = String(req.params.id);
  const existing = await prisma.classroom.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Classroom not found.' });
    return;
  }

  if (parsed.data.roomCode && parsed.data.roomCode !== existing.roomCode) {
    const duplicate = await prisma.classroom.findUnique({
      where: { roomCode: parsed.data.roomCode },
    });
    if (duplicate) {
      res.status(409).json({ error: 'Another classroom already uses this Room ID.' });
      return;
    }
  }

  const classroom = await prisma.classroom.update({
    where: { id },
    data: parsed.data,
    include: { equipment: true },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'UPDATE_CLASSROOM',
    entityType: 'CLASSROOM',
    entityId: classroom.id,
    details: { status: classroom.status, maxCapacity: classroom.maxCapacity },
    ipAddress: req.ip,
  });

  res.json({ message: 'Classroom updated successfully.', classroom });
});

router.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const classroom = await prisma.classroom.findUnique({
    where: { id },
    include: { _count: { select: { sessions: true, inspections: true, mediaUploads: true } } },
  });

  if (!classroom) {
    res.status(404).json({ error: 'Classroom not found.' });
    return;
  }

  if (
    classroom._count.sessions > 0 ||
    classroom._count.inspections > 0 ||
    classroom._count.mediaUploads > 0
  ) {
    res.status(409).json({
      error:
        'Cannot delete classroom with existing sessions, inspections, or media records. Set status to INACTIVE instead.',
    });
    return;
  }

  await prisma.classroom.delete({ where: { id } });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'DELETE_CLASSROOM',
    entityType: 'CLASSROOM',
    entityId: id,
    ipAddress: req.ip,
  });

  res.json({ message: 'Classroom deleted successfully.' });
});

router.post(
  '/:id/equipment',
  requireRole('ADMIN', 'FACILITY_MANAGER'),
  async (req: Request, res: Response) => {
    const parsed = equipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid equipment data' });
      return;
    }

    const classroomId = String(req.params.id);
    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found.' });
      return;
    }

    const item = await prisma.equipment.create({
      data: {
        classroomId,
        ...parsed.data,
      },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'ADD_CLASSROOM_EQUIPMENT',
      entityType: 'EQUIPMENT',
      entityId: item.id,
      details: { classroomId, itemType: item.itemType, expectedQuantity: item.expectedQuantity },
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Equipment item added.', equipment: item });
  }
);

router.delete(
  '/:id/equipment/:equipmentId',
  requireRole('ADMIN', 'FACILITY_MANAGER'),
  async (req: Request, res: Response) => {
    const classroomId = String(req.params.id);
    const equipmentId = String(req.params.equipmentId);

    const item = await prisma.equipment.findFirst({
      where: { id: equipmentId, classroomId },
    });
    if (!item) {
      res.status(404).json({ error: 'Equipment item not found in this classroom.' });
      return;
    }

    await prisma.equipment.delete({ where: { id: equipmentId } });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'DELETE_CLASSROOM_EQUIPMENT',
      entityType: 'EQUIPMENT',
      entityId: equipmentId,
      ipAddress: req.ip,
    });

    res.json({ message: 'Equipment item removed.' });
  }
);

export default router;
