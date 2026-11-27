import { Router, Request, Response } from 'express';
import { MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'FACILITY_MANAGER'));

const createTaskSchema = z.object({
  classroomId: z.string().uuid('Invalid classroom ID'),
  findingId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(1000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(3).max(1000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

router.get('/assignees', async (_req: Request, res: Response) => {
  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['ADMIN', 'FACILITY_MANAGER'] },
    },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: { fullName: 'asc' },
  });
  res.json({ staff });
});

router.get('/', async (req: Request, res: Response) => {
  const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const priorityParam =
    typeof req.query.priority === 'string' ? req.query.priority.toUpperCase() : '';
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';

  const validStatuses: MaintenanceStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  const validPriorities: MaintenancePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      ...(validStatuses.includes(statusParam as MaintenanceStatus)
        ? { status: statusParam as MaintenanceStatus }
        : {}),
      ...(validPriorities.includes(priorityParam as MaintenancePriority)
        ? { priority: priorityParam as MaintenancePriority }
        : {}),
      ...(classroomId ? { classroomId } : {}),
    },
    include: {
      classroom: { select: { id: true, roomCode: true, name: true, building: true } },
      assignee: { select: { id: true, fullName: true, email: true } },
      creator: { select: { id: true, fullName: true } },
      finding: {
        select: { id: true, sourceType: true, reviewStatus: true, summary: true },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({ tasks });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid maintenance task' });
    return;
  }

  const { classroomId, findingId, title, description, priority, assignedTo, dueDate } = parsed.data;

  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) {
    res.status(404).json({ error: 'Selected classroom not found.' });
    return;
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceTask.create({
      data: {
        classroomId,
        findingId: findingId || null,
        title,
        description,
        priority,
        status: 'PENDING',
        assignedTo: assignedTo || null,
        createdBy: req.user!.id,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        classroom: { select: { roomCode: true, name: true } },
        assignee: { select: { fullName: true } },
      },
    });

    await tx.notification.create({
      data: {
        targetUserId: assignedTo || null,
        targetRole: assignedTo ? null : 'FACILITY_MANAGER',
        classroomId,
        sourceCategory: 'OPERATIONAL_SYSTEM',
        severity: priority === 'CRITICAL' || priority === 'HIGH' ? 'WARNING' : 'INFO',
        title: `Maintenance Task Created (${priority}) — ${classroom.roomCode}`,
        message: `${title}: ${description.slice(0, 140)}`,
      },
    });

    return created;
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'CREATE_MAINTENANCE_TASK',
    entityType: 'MAINTENANCE_TASK',
    entityId: task.id,
    details: { classroomId, priority, assignedTo: assignedTo || null },
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Maintenance task created.', task });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task update' });
    return;
  }

  const id = String(req.params.id);
  const existing = await prisma.maintenanceTask.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Maintenance task not found.' });
    return;
  }

  const nextStatus = parsed.data.status;
  const completedAt =
    nextStatus === 'COMPLETED'
      ? existing.completedAt || new Date()
      : nextStatus
      ? null
      : existing.completedAt;

  const updated = await prisma.maintenanceTask.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
      ...(nextStatus ? { status: nextStatus, completedAt } : {}),
      ...(parsed.data.assignedTo !== undefined ? { assignedTo: parsed.data.assignedTo } : {}),
      ...(parsed.data.dueDate !== undefined
        ? { dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null }
        : {}),
    },
    include: {
      classroom: { select: { roomCode: true, name: true } },
      assignee: { select: { fullName: true } },
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'UPDATE_MAINTENANCE_TASK',
    entityType: 'MAINTENANCE_TASK',
    entityId: updated.id,
    details: { status: updated.status, priority: updated.priority },
    ipAddress: req.ip,
  });

  res.json({ message: 'Maintenance task updated.', task: updated });
});

export default router;
