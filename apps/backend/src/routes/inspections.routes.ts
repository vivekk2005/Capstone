import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router, Request, Response } from 'express';
import { FindingReviewStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'FACILITY_MANAGER'));

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `insp-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WEBP images are allowed for inspection attachments.'));
    }
  },
});

const createInspectionSchema = z.object({
  classroomId: z.string().uuid('Invalid classroom ID'),
  inspectionDate: z.string().min(1),
  cleanlinessRating: z.enum(['GOOD', 'NEEDS_ATTENTION', 'POOR']),
  buildingCondition: z.enum(['GOOD', 'MINOR_DAMAGE', 'NEEDS_REPAIR']),
  equipmentCondition: z.enum(['ALL_PRESENT_WORKING', 'NEEDS_REVIEW', 'FAULT_REPORTED']),
  overallStatus: z.enum(['PASS', 'ACTION_REQUIRED', 'PENDING_REVIEW']),
  notes: z.string().trim().max(1000).optional(),
  findingSummary: z.string().trim().max(500).optional(),
});

const reviewFindingSchema = z.object({
  decision: z.enum(['CONFIRMED', 'REJECTED', 'RECHECK_REQUESTED']),
  reviewNotes: z.string().trim().max(500).optional(),
  createMaintenanceTask: z.boolean().optional(),
  taskTitle: z.string().trim().max(120).optional(),
  taskPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : '';
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';

  const inspections = await prisma.inspection.findMany({
    where: {
      ...(classroomId ? { classroomId } : {}),
      ...(status && ['PASS', 'ACTION_REQUIRED', 'PENDING_REVIEW'].includes(status)
        ? { overallStatus: status as 'PASS' | 'ACTION_REQUIRED' | 'PENDING_REVIEW' }
        : {}),
    },
    include: {
      classroom: { select: { id: true, roomCode: true, name: true, building: true } },
      inspector: { select: { id: true, fullName: true, role: true } },
      attachmentMedia: { select: { id: true, originalFilename: true, mimeType: true } },
      _count: { select: { findings: true } },
    },
    orderBy: { inspectionDate: 'desc' },
  });

  res.json({ inspections });
});

router.post('/', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      res.status(400).json({ error: uploadErr.message || 'Invalid attachment upload.' });
      return;
    }

    const parsed = createInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) fs.unlink(req.file.path, () => undefined);
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid inspection input' });
      return;
    }

    const {
      classroomId,
      inspectionDate,
      cleanlinessRating,
      buildingCondition,
      equipmentCondition,
      overallStatus,
      notes,
      findingSummary,
    } = parsed.data;

    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!classroom) {
      if (req.file) fs.unlink(req.file.path, () => undefined);
      res.status(404).json({ error: 'Selected classroom not found.' });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      let attachmentMediaId: string | null = null;
      if (req.file) {
        const media = await tx.mediaUpload.create({
          data: {
            classroomId,
            uploadedBy: req.user!.id,
            originalFilename: req.file.originalname,
            storagePath: path.resolve(req.file.path),
            mimeType: req.file.mimetype,
            fileSizeBytes: BigInt(req.file.size),
            mediaType: 'IMAGE',
            retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        });
        attachmentMediaId = media.id;
      }

      const inspection = await tx.inspection.create({
        data: {
          classroomId,
          inspectorId: req.user!.id,
          inspectionDate: new Date(inspectionDate),
          cleanlinessRating,
          buildingCondition,
          equipmentCondition,
          overallStatus,
          notes: notes || null,
          attachmentMediaId,
        },
        include: {
          classroom: { select: { roomCode: true, name: true } },
          inspector: { select: { fullName: true } },
        },
      });

      const needsIssue =
        overallStatus === 'ACTION_REQUIRED' ||
        cleanlinessRating === 'POOR' ||
        buildingCondition === 'NEEDS_REPAIR' ||
        equipmentCondition === 'FAULT_REPORTED' ||
        Boolean(findingSummary);

      if (needsIssue) {
        const summaryText =
          findingSummary ||
          `Manual inspection flagged ${classroom.roomCode}: Cleanliness=${cleanlinessRating}, Building=${buildingCondition}, Equipment=${equipmentCondition}.`;

        await tx.inspectionFinding.create({
          data: {
            inspectionId: inspection.id,
            classroomId,
            sourceType: 'MANUAL_INSPECTION',
            reviewStatus: overallStatus === 'ACTION_REQUIRED' ? 'CONFIRMED' : 'PENDING_REVIEW',
            severity:
              buildingCondition === 'NEEDS_REPAIR' || equipmentCondition === 'FAULT_REPORTED'
                ? 'HIGH'
                : 'MEDIUM',
            summary: summaryText,
            reviewerId: overallStatus === 'ACTION_REQUIRED' ? req.user!.id : null,
            reviewedAt: overallStatus === 'ACTION_REQUIRED' ? new Date() : null,
          },
        });

        await tx.notification.create({
          data: {
            targetRole: 'FACILITY_MANAGER',
            classroomId,
            sourceCategory: 'HUMAN_CONFIRMED_ISSUE',
            severity: 'WARNING',
            title: `Inspection Issue Recorded — ${classroom.roomCode}`,
            message: summaryText,
          },
        });
      }

      return inspection;
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'CREATE_INSPECTION',
      entityType: 'INSPECTION',
      entityId: created.id,
      details: { classroomId, overallStatus },
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Inspection record saved.', inspection: created });
  });
});

router.get('/findings', async (req: Request, res: Response) => {
  const statusParam = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const sourceParam = typeof req.query.source === 'string' ? req.query.source.toUpperCase() : '';
  const validReviews: FindingReviewStatus[] = [
    'PENDING_REVIEW',
    'CONFIRMED',
    'REJECTED',
    'RECHECK_REQUESTED',
  ];

  const findings = await prisma.inspectionFinding.findMany({
    where: {
      ...(statusParam && validReviews.includes(statusParam as FindingReviewStatus)
        ? { reviewStatus: statusParam as FindingReviewStatus }
        : {}),
      ...(sourceParam && ['AI_ESTIMATE', 'MANUAL_INSPECTION'].includes(sourceParam)
        ? { sourceType: sourceParam as 'AI_ESTIMATE' | 'MANUAL_INSPECTION' }
        : {}),
    },
    include: {
      classroom: { select: { id: true, roomCode: true, name: true } },
      reviewer: { select: { id: true, fullName: true, role: true } },
      aiDetection: {
        select: {
          id: true,
          detectedClass: true,
          estimatedCount: true,
          confidence: true,
          capacityStatus: true,
          aiJob: {
            select: {
              id: true,
              mediaId: true,
              modelName: true,
            },
          },
        },
      },
      _count: { select: { maintenanceTasks: true } },
    },
    orderBy: [{ reviewStatus: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({ findings });
});

router.post('/findings/:id/review', async (req: Request, res: Response) => {
  const parsed = reviewFindingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review input' });
    return;
  }

  const findingId = String(req.params.id);
  const existing = await prisma.inspectionFinding.findUnique({
    where: { id: findingId },
    include: { classroom: true },
  });

  if (!existing) {
    res.status(404).json({ error: 'Inspection finding not found.' });
    return;
  }

  const { decision, reviewNotes, createMaintenanceTask, taskTitle, taskPriority } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const updatedFinding = await tx.inspectionFinding.update({
      where: { id: findingId },
      data: {
        reviewStatus: decision,
        reviewerId: req.user!.id,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      },
      include: {
        classroom: { select: { id: true, roomCode: true, name: true } },
        reviewer: { select: { fullName: true } },
      },
    });

    let createdTask = null;
    if (decision === 'CONFIRMED') {
      await tx.notification.create({
        data: {
          targetRole: 'FACILITY_MANAGER',
          classroomId: existing.classroomId,
          sourceCategory: 'HUMAN_CONFIRMED_ISSUE',
          severity: existing.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
          title: `Confirmed Issue — ${existing.classroom.roomCode}`,
          message: `Confirmed by ${req.user!.fullName}: ${existing.summary}`,
        },
      });

      if (createMaintenanceTask) {
        createdTask = await tx.maintenanceTask.create({
          data: {
            classroomId: existing.classroomId,
            findingId: existing.id,
            title: taskTitle || `Resolve: ${existing.classroom.roomCode} finding`,
            description: `${existing.summary}${reviewNotes ? `\nReviewer notes: ${reviewNotes}` : ''}`,
            priority: taskPriority || (existing.severity === 'HIGH' ? 'HIGH' : 'MEDIUM'),
            status: 'PENDING',
            createdBy: req.user!.id,
          },
        });
      }
    }

    return { updatedFinding, createdTask };
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: `FINDING_${decision}`,
    entityType: 'INSPECTION_FINDING',
    entityId: findingId,
    details: {
      sourceType: existing.sourceType,
      createdTaskId: result.createdTask?.id || null,
    },
    ipAddress: req.ip,
  });

  res.json({
    message: `Finding marked as ${decision}.`,
    finding: result.updatedFinding,
    maintenanceTask: result.createdTask,
  });
});

export default router;
