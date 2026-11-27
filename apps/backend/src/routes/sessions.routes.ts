import { Router, Request, Response } from 'express';
import { SessionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const createSessionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  courseBatch: z.string().trim().min(2).max(80),
  classroomId: z.string().uuid('Invalid classroom ID'),
  instructorId: z.string().uuid('Invalid instructor ID').optional(),
  sessionDate: z.string().min(1, 'Session date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
});

const updateSessionSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  courseBatch: z.string().trim().min(2).max(80).optional(),
  classroomId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
  sessionDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

const enrollStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid()).optional(),
  courseBatch: z.string().trim().min(1).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const bucket = typeof req.query.bucket === 'string' ? req.query.bucket : '';
  const validStatuses: SessionStatus[] = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
  const statusFilter = validStatuses.includes(statusParam as SessionStatus)
    ? (statusParam as SessionStatus)
    : undefined;

  let studentFilterId: string | undefined;
  let instructorFilterId: string | undefined;

  if (req.user!.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
    if (!student) {
      res.json({ sessions: [] });
      return;
    }
    studentFilterId = student.id;
  } else if (req.user!.role === 'INSTRUCTOR' && req.query.mine === 'true') {
    const instructor = await prisma.instructor.findUnique({ where: { userId: req.user!.id } });
    if (!instructor) {
      res.json({ sessions: [] });
      return;
    }
    instructorFilterId = instructor.id;
  }

  const sessions = await prisma.trainingSession.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(bucket === 'upcoming' ? { status: { in: ['SCHEDULED', 'ACTIVE'] } } : {}),
      ...(bucket === 'completed' ? { status: 'COMPLETED' } : {}),
      ...(studentFilterId ? { enrollments: { some: { studentId: studentFilterId } } } : {}),
      ...(instructorFilterId ? { instructorId: instructorFilterId } : {}),
    },
    include: {
      classroom: {
        select: { id: true, roomCode: true, name: true, building: true, maxCapacity: true },
      },
      instructor: {
        include: { user: { select: { id: true, fullName: true, email: true } } },
      },
      _count: {
        select: { enrollments: true, attendance: true },
      },
    },
    orderBy: { startTime: 'desc' },
  });

  res.json({ sessions });
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const session = await prisma.trainingSession.findUnique({
    where: { id },
    include: {
      classroom: { include: { equipment: true } },
      instructor: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      enrollments: {
        include: {
          student: {
            include: { user: { select: { fullName: true, email: true } } },
          },
        },
        orderBy: { enrolledAt: 'asc' },
      },
      attendance: {
        include: {
          student: {
            include: { user: { select: { fullName: true, email: true } } },
          },
        },
      },
    },
  });

  if (!session) {
    res.status(404).json({ error: 'Training session not found.' });
    return;
  }

  if (req.user!.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
    const isEnrolled = student && session.enrollments.some((e) => e.studentId === student.id);
    if (!isEnrolled) {
      res.status(403).json({ error: 'You are not enrolled in this training session.' });
      return;
    }
  }

  res.json({ session });
});

router.post('/', requireRole('ADMIN', 'INSTRUCTOR'), async (req: Request, res: Response) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid session data' });
    return;
  }

  const { title, courseBatch, classroomId, sessionDate, startTime, endTime, status } = parsed.data;
  let { instructorId } = parsed.data;

  if (req.user!.role === 'INSTRUCTOR') {
    const ownInstructor = await prisma.instructor.findUnique({ where: { userId: req.user!.id } });
    if (!ownInstructor) {
      res.status(400).json({ error: 'Instructor profile not found for your account.' });
      return;
    }
    instructorId = ownInstructor.id;
  }

  if (!instructorId) {
    res.status(400).json({ error: 'An instructor must be assigned to the session.' });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    res.status(400).json({ error: 'End time must be later than start time.' });
    return;
  }

  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) {
    res.status(404).json({ error: 'Selected classroom not found.' });
    return;
  }
  if (classroom.status === 'MAINTENANCE' || classroom.status === 'INACTIVE') {
    res.status(400).json({ error: `Classroom ${classroom.roomCode} is currently ${classroom.status}.` });
    return;
  }

  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } });
  if (!instructor) {
    res.status(404).json({ error: 'Selected instructor not found.' });
    return;
  }

  const session = await prisma.trainingSession.create({
    data: {
      title,
      courseBatch,
      classroomId,
      instructorId,
      sessionDate: new Date(sessionDate),
      startTime: start,
      endTime: end,
      status,
    },
    include: {
      classroom: { select: { roomCode: true, name: true, maxCapacity: true } },
      instructor: { include: { user: { select: { fullName: true } } } },
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'CREATE_SESSION',
    entityType: 'TRAINING_SESSION',
    entityId: session.id,
    details: { title: session.title, classroomId, instructorId },
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Training session created successfully.', session });
});

router.patch('/:id', requireRole('ADMIN', 'INSTRUCTOR'), async (req: Request, res: Response) => {
  const parsed = updateSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid session update' });
    return;
  }

  const id = String(req.params.id);
  const existing = await prisma.trainingSession.findUnique({
    where: { id },
    include: { instructor: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Training session not found.' });
    return;
  }

  if (req.user!.role === 'INSTRUCTOR' && existing.instructor.userId !== req.user!.id) {
    res.status(403).json({ error: 'You can only update training sessions assigned to you.' });
    return;
  }

  const nextStart = parsed.data.startTime ? new Date(parsed.data.startTime) : existing.startTime;
  const nextEnd = parsed.data.endTime ? new Date(parsed.data.endTime) : existing.endTime;
  if (nextEnd <= nextStart) {
    res.status(400).json({ error: 'End time must be later than start time.' });
    return;
  }

  const updated = await prisma.trainingSession.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.courseBatch ? { courseBatch: parsed.data.courseBatch } : {}),
      ...(parsed.data.classroomId ? { classroomId: parsed.data.classroomId } : {}),
      ...(parsed.data.instructorId && req.user!.role === 'ADMIN'
        ? { instructorId: parsed.data.instructorId }
        : {}),
      ...(parsed.data.sessionDate ? { sessionDate: new Date(parsed.data.sessionDate) } : {}),
      ...(parsed.data.startTime ? { startTime: nextStart } : {}),
      ...(parsed.data.endTime ? { endTime: nextEnd } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    include: {
      classroom: { select: { roomCode: true, name: true } },
      instructor: { include: { user: { select: { fullName: true } } } },
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: 'UPDATE_SESSION',
    entityType: 'TRAINING_SESSION',
    entityId: updated.id,
    details: { status: updated.status },
    ipAddress: req.ip,
  });

  res.json({ message: 'Session updated successfully.', session: updated });
});

router.post(
  '/:id/enrollments',
  requireRole('ADMIN', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const parsed = enrollStudentsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid enrollment data' });
      return;
    }

    const sessionId = String(req.params.id);
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { instructor: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Training session not found.' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR' && session.instructor.userId !== req.user!.id) {
      res.status(403).json({ error: 'You can only manage enrollments for your own sessions.' });
      return;
    }

    let targetStudentIds = parsed.data.studentIds || [];
    if (parsed.data.courseBatch) {
      const batchStudents = await prisma.student.findMany({
        where: { courseBatch: parsed.data.courseBatch, status: 'ACTIVE' },
        select: { id: true },
      });
      targetStudentIds = [...new Set([...targetStudentIds, ...batchStudents.map((s) => s.id)])];
    }

    if (targetStudentIds.length === 0) {
      res.status(400).json({ error: 'No active students matched for enrollment.' });
      return;
    }

    const result = await prisma.enrollment.createMany({
      data: targetStudentIds.map((studentId) => ({ sessionId, studentId })),
      skipDuplicates: true,
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'ENROLL_STUDENTS',
      entityType: 'TRAINING_SESSION',
      entityId: sessionId,
      details: { addedCount: result.count, requestedCount: targetStudentIds.length },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: `Enrolled ${result.count} new student(s) in this session.`,
      addedCount: result.count,
    });
  }
);

router.delete(
  '/:id/enrollments/:studentId',
  requireRole('ADMIN', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const sessionId = String(req.params.id);
    const studentId = String(req.params.studentId);

    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { instructor: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Training session not found.' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR' && session.instructor.userId !== req.user!.id) {
      res.status(403).json({ error: 'You can only manage enrollments for your own sessions.' });
      return;
    }

    await prisma.enrollment.deleteMany({
      where: { sessionId, studentId },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'UNENROLL_STUDENT',
      entityType: 'TRAINING_SESSION',
      entityId: sessionId,
      details: { studentId },
      ipAddress: req.ip,
    });

    res.json({ message: 'Student removed from session.' });
  }
);

export default router;
