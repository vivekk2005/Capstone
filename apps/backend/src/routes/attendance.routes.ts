import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { parseQrInput, sha256 } from '../lib/security';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const generateQrSchema = z.object({
  expiresInMinutes: z.number().int().min(1).max(120).default(5),
});

const checkInSchema = z.object({
  qrPayload: z.string().trim().min(10, 'QR token payload is required'),
});

const manualAttendanceSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']),
  notes: z.string().trim().max(300).optional(),
});

router.post(
  '/sessions/:sessionId/qr',
  requireRole('ADMIN', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const parsed = generateQrSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expiry minutes' });
      return;
    }

    const sessionId = String(req.params.sessionId);
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { instructor: true, classroom: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Training session not found.' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR' && session.instructor.userId !== req.user!.id) {
      res.status(403).json({ error: 'You can only generate QR codes for your assigned sessions.' });
      return;
    }

    if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
      res.status(400).json({ error: `Cannot generate QR code for a ${session.status} session.` });
      return;
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + parsed.data.expiresInMinutes * 60 * 1000);

    const qrRecord = await prisma.$transaction(async (tx) => {
      await tx.qrToken.updateMany({
        where: { sessionId, isRevoked: false },
        data: { isRevoked: true },
      });

      if (session.status === 'SCHEDULED') {
        await tx.trainingSession.update({
          where: { id: sessionId },
          data: { status: 'ACTIVE' },
        });
      }

      return tx.qrToken.create({
        data: {
          sessionId,
          tokenHash,
          expiresAt,
          createdBy: req.user!.id,
        },
        select: {
          id: true,
          sessionId: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    });

    const qrPayload = JSON.stringify({
      sessionId,
      token: rawToken,
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'GENERATE_QR_TOKEN',
      entityType: 'QR_TOKEN',
      entityId: qrRecord.id,
      details: { sessionId, expiresAt: qrRecord.expiresAt.toISOString() },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: 'Time-limited QR code generated.',
      qrToken: qrRecord,
      qrPayload,
    });
  }
);

router.post(
  '/qr/:tokenId/revoke',
  requireRole('ADMIN', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const tokenId = String(req.params.tokenId);
    const qrToken = await prisma.qrToken.findUnique({
      where: { id: tokenId },
      include: { session: { include: { instructor: true } } },
    });

    if (!qrToken) {
      res.status(404).json({ error: 'QR token not found.' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR' && qrToken.session.instructor.userId !== req.user!.id) {
      res.status(403).json({ error: 'You can only revoke QR codes for your own sessions.' });
      return;
    }

    await prisma.qrToken.update({
      where: { id: tokenId },
      data: { isRevoked: true },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'REVOKE_QR_TOKEN',
      entityType: 'QR_TOKEN',
      entityId: tokenId,
      ipAddress: req.ip,
    });

    res.json({ message: 'QR token revoked.' });
  }
);

router.post('/check-in', requireRole('STUDENT'), async (req: Request, res: Response) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid QR payload' });
    return;
  }

  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
  });
  if (!student || student.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Active student profile not found.' });
    return;
  }

  const { token, sessionId: payloadSessionId } = parseQrInput(parsed.data.qrPayload);
  const tokenHash = sha256(token);

  const qrRecord = await prisma.qrToken.findUnique({
    where: { tokenHash },
    include: {
      session: {
        include: { classroom: { select: { roomCode: true, name: true } } },
      },
    },
  });

  if (!qrRecord) {
    res.status(400).json({ error: 'Invalid QR code. Please scan a valid session QR.' });
    return;
  }

  if (payloadSessionId && payloadSessionId !== qrRecord.sessionId) {
    res.status(400).json({ error: 'QR token does not match the specified session.' });
    return;
  }

  if (qrRecord.isRevoked) {
    res.status(400).json({ error: 'This QR code has been revoked. Ask your instructor for a new code.' });
    return;
  }

  const now = new Date();
  if (qrRecord.expiresAt < now) {
    await logAudit({
      actorUserId: req.user!.id,
      action: 'EXPIRED_QR_ATTEMPT',
      entityType: 'QR_TOKEN',
      entityId: qrRecord.id,
      details: { sessionId: qrRecord.sessionId, studentId: student.id },
      ipAddress: req.ip,
    });
    res.status(400).json({ error: 'This QR code has expired. Please request a fresh QR code.' });
    return;
  }

  if (qrRecord.session.status === 'CANCELLED' || qrRecord.session.status === 'COMPLETED') {
    res.status(400).json({
      error: `Session "${qrRecord.session.title}" is ${qrRecord.session.status} and closed for check-in.`,
    });
    return;
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      sessionId_studentId: {
        sessionId: qrRecord.sessionId,
        studentId: student.id,
      },
    },
  });

  if (!enrollment) {
    res.status(403).json({
      error: 'You are not enrolled in this training session.',
    });
    return;
  }

  const lateCutoff = new Date(qrRecord.session.startTime.getTime() + 15 * 60 * 1000);
  const attendanceStatus: AttendanceStatus = now > lateCutoff ? 'LATE' : 'PRESENT';

  try {
    const attendance = await prisma.attendance.create({
      data: {
        sessionId: qrRecord.sessionId,
        studentId: student.id,
        qrTokenId: qrRecord.id,
        status: attendanceStatus,
        method: 'QR_SCAN',
        notes: 'Session check-in recorded via time-limited QR code.',
      },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            classroom: { select: { roomCode: true, name: true } },
          },
        },
      },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'ATTENDANCE_QR_CHECKIN',
      entityType: 'ATTENDANCE',
      entityId: attendance.id,
      details: {
        sessionId: qrRecord.sessionId,
        studentId: student.id,
        status: attendanceStatus,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: `Check-in recorded as ${attendanceStatus} for ${attendance.session.title}.`,
      attendance,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({
        error: 'Duplicate submission rejected: your attendance is already recorded for this session.',
      });
      return;
    }
    throw error;
  }
});

router.post(
  '/sessions/:sessionId/manual',
  requireRole('ADMIN', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const parsed = manualAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid attendance input' });
      return;
    }

    const sessionId = String(req.params.sessionId);
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { instructor: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Training session not found.' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR' && session.instructor.userId !== req.user!.id) {
      res.status(403).json({ error: 'You can only update attendance for your own sessions.' });
      return;
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        sessionId_studentId: {
          sessionId,
          studentId: parsed.data.studentId,
        },
      },
    });
    if (!enrollment) {
      res.status(400).json({ error: 'Student is not enrolled in this session.' });
      return;
    }

    const record = await prisma.attendance.upsert({
      where: {
        sessionId_studentId: {
          sessionId,
          studentId: parsed.data.studentId,
        },
      },
      update: {
        status: parsed.data.status,
        method: 'MANUAL_OVERRIDE',
        notes: parsed.data.notes || 'Updated manually by authorized staff.',
        markedAt: new Date(),
      },
      create: {
        sessionId,
        studentId: parsed.data.studentId,
        status: parsed.data.status,
        method: 'MANUAL_OVERRIDE',
        notes: parsed.data.notes || 'Recorded manually by authorized staff.',
      },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'ATTENDANCE_MANUAL_OVERRIDE',
      entityType: 'ATTENDANCE',
      entityId: record.id,
      details: {
        sessionId,
        studentId: parsed.data.studentId,
        status: parsed.data.status,
      },
      ipAddress: req.ip,
    });

    res.json({ message: `Attendance updated to ${record.status}.`, attendance: record });
  }
);

router.get(
  '/sessions/:sessionId',
  requireRole('ADMIN', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        classroom: { select: { roomCode: true, name: true, maxCapacity: true } },
        instructor: { include: { user: { select: { fullName: true } } } },
        enrollments: {
          include: {
            student: {
              include: { user: { select: { fullName: true, email: true } } },
            },
          },
          orderBy: { enrolledAt: 'asc' },
        },
        attendance: true,
        qrTokens: {
          where: { isRevoked: false, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, expiresAt: true, createdAt: true },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Training session not found.' });
      return;
    }

    if (req.user!.role === 'INSTRUCTOR' && session.instructor.userId !== req.user!.id) {
      res.status(403).json({ error: 'You can only view attendance for your own sessions.' });
      return;
    }

    const attendanceMap = new Map(session.attendance.map((a) => [a.studentId, a]));

    const roster = session.enrollments.map((en) => {
      const att = attendanceMap.get(en.studentId);
      return {
        studentId: en.student.id,
        studentCode: en.student.studentCode,
        fullName: en.student.user.fullName,
        email: en.student.user.email,
        courseBatch: en.student.courseBatch,
        status: att ? att.status : 'ABSENT',
        markedAt: att ? att.markedAt : null,
        method: att ? att.method : null,
        notes: att ? att.notes : null,
      };
    });

    const presentCount = roster.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const totalEnrolled = roster.length;
    const attendancePercentage =
      totalEnrolled > 0 ? Math.round((presentCount / totalEnrolled) * 100) : 0;

    res.json({
      session: {
        id: session.id,
        title: session.title,
        courseBatch: session.courseBatch,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        classroom: session.classroom,
        instructorName: session.instructor.user.fullName,
      },
      activeQrToken: session.qrTokens[0] || null,
      summary: {
        totalEnrolled,
        presentCount,
        absentCount: totalEnrolled - presentCount,
        attendancePercentage,
      },
      roster,
    });
  }
);

router.get('/my', requireRole('STUDENT'), async (req: Request, res: Response) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
  });

  if (!student) {
    res.status(404).json({ error: 'Student profile not found.' });
    return;
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id },
    include: {
      session: {
        include: {
          classroom: { select: { roomCode: true, name: true } },
          instructor: { include: { user: { select: { fullName: true } } } },
          attendance: {
            where: { studentId: student.id },
            take: 1,
          },
        },
      },
    },
    orderBy: { session: { startTime: 'desc' } },
  });

  const records = enrollments.map((en) => {
    const att = en.session.attendance[0];
    return {
      sessionId: en.session.id,
      title: en.session.title,
      sessionDate: en.session.sessionDate,
      startTime: en.session.startTime,
      endTime: en.session.endTime,
      sessionStatus: en.session.status,
      classroom: en.session.classroom,
      instructorName: en.session.instructor.user.fullName,
      attendanceStatus: att ? att.status : 'ABSENT',
      markedAt: att ? att.markedAt : null,
      method: att ? att.method : null,
    };
  });

  const attendedCount = records.filter(
    (r) => r.attendanceStatus === 'PRESENT' || r.attendanceStatus === 'LATE'
  ).length;
  const totalSessions = records.length;
  const percentage = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;

  res.json({
    summary: {
      totalSessions,
      attendedCount,
      percentage,
    },
    records,
  });
});

router.get('/reports', requireRole('ADMIN', 'INSTRUCTOR'), async (req: Request, res: Response) => {
  const fromParam = typeof req.query.from === 'string' ? req.query.from : '';
  const toParam = typeof req.query.to === 'string' ? req.query.to : '';
  const batchParam = typeof req.query.batch === 'string' ? req.query.batch.trim() : '';

  let instructorIdFilter: string | undefined;
  if (req.user!.role === 'INSTRUCTOR') {
    const ins = await prisma.instructor.findUnique({ where: { userId: req.user!.id } });
    if (ins) instructorIdFilter = ins.id;
  }

  const sessions = await prisma.trainingSession.findMany({
    where: {
      ...(instructorIdFilter ? { instructorId: instructorIdFilter } : {}),
      ...(batchParam ? { courseBatch: { equals: batchParam, mode: 'insensitive' } } : {}),
      ...(fromParam || toParam
        ? {
            sessionDate: {
              ...(fromParam ? { gte: new Date(`${fromParam}T00:00:00`) } : {}),
              ...(toParam ? { lte: new Date(`${toParam}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    include: {
      classroom: { select: { roomCode: true, name: true } },
      enrollments: {
        include: {
          student: {
            include: { user: { select: { fullName: true } } },
          },
        },
      },
      attendance: true,
    },
    orderBy: { sessionDate: 'desc' },
  });

  const studentStats = new Map<
    string,
    { studentCode: string; fullName: string; courseBatch: string; enrolled: number; present: number }
  >();

  let totalEnrollments = 0;
  let totalPresent = 0;

  const sessionReports = sessions.map((s) => {
    const presentIds = new Set(
      s.attendance
        .filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
        .map((a) => a.studentId)
    );
    const enrolledCount = s.enrollments.length;
    const presentCount = s.enrollments.filter((e) => presentIds.has(e.studentId)).length;

    totalEnrollments += enrolledCount;
    totalPresent += presentCount;

    for (const en of s.enrollments) {
      const existing = studentStats.get(en.studentId) || {
        studentCode: en.student.studentCode,
        fullName: en.student.user.fullName,
        courseBatch: en.student.courseBatch,
        enrolled: 0,
        present: 0,
      };
      existing.enrolled += 1;
      if (presentIds.has(en.studentId)) {
        existing.present += 1;
      }
      studentStats.set(en.studentId, existing);
    }

    return {
      id: s.id,
      title: s.title,
      courseBatch: s.courseBatch,
      roomCode: s.classroom.roomCode,
      sessionDate: s.sessionDate,
      status: s.status,
      enrolledCount,
      presentCount,
      percentage: enrolledCount > 0 ? Math.round((presentCount / enrolledCount) * 100) : 0,
    };
  });

  const studentReports = Array.from(studentStats.entries()).map(([studentId, st]) => ({
    studentId,
    ...st,
    percentage: st.enrolled > 0 ? Math.round((st.present / st.enrolled) * 100) : 0,
  }));

  res.json({
    summary: {
      totalSessions: sessions.length,
      totalEnrollments,
      totalPresent,
      overallPercentage:
        totalEnrollments > 0 ? Math.round((totalPresent / totalEnrollments) * 100) : 0,
    },
    sessionReports,
    studentReports,
  });
});

export default router;
