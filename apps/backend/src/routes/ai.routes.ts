import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router, Request, Response } from 'express';
import { AiTaskType, MediaType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'FACILITY_MANAGER'));

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const MAX_MB = Number(process.env.MAX_FILE_SIZE_MB) || 25;

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype) || ALLOWED_VIDEO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, MP4, WEBM, MOV, AVI.'));
    }
  },
});

function getAiServiceUrl(): string {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(
    '://localhost:',
    '://127.0.0.1:'
  );
}

interface FastApiDetection {
  category: 'PERSON_COUNT' | 'OBJECT_DETECTION';
  detected_class: string;
  raw_label: string;
  confidence: number;
  bbox: number[];
  frame_index: number;
}

interface FastApiResponse {
  media_type: 'IMAGE' | 'VIDEO';
  image_width: number;
  image_height: number;
  frames_analyzed: number;
  people_count: number;
  peak_people_count: number;
  equipment_counts: Record<string, number>;
  detections: FastApiDetection[];
  supported_classes: string[];
  model_name: string;
  model_version: string;
  confidence_threshold: number;
  processing_ms: number;
}

router.get('/service-status', async (_req: Request, res: Response) => {
  const aiUrl = getAiServiceUrl();
  try {
    const response = await fetch(`${aiUrl}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      res.json({ reachable: false, url: aiUrl, error: `Status ${response.status}` });
      return;
    }
    const data = await response.json();
    res.json({ reachable: true, url: aiUrl, details: data });
  } catch {
    res.json({
      reachable: false,
      url: aiUrl,
      error: 'Python AI service is currently unreachable.',
    });
  }
});

router.post('/analyze', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg =
        uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
          ? `File exceeds maximum allowed size of ${MAX_MB} MB.`
          : uploadErr.message || 'Invalid file upload.';
      res.status(400).json({ error: msg });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Please select an image or short video file to analyze.' });
      return;
    }

    const classroomId = typeof req.body.classroomId === 'string' ? req.body.classroomId : '';
    const sessionId =
      typeof req.body.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : null;
    const rawTaskType =
      typeof req.body.taskType === 'string' ? req.body.taskType.toUpperCase() : 'COMBINED';
    const validTasks: AiTaskType[] = ['OCCUPANCY', 'EQUIPMENT_DETECTION', 'COMBINED'];
    const taskType: AiTaskType = validTasks.includes(rawTaskType as AiTaskType)
      ? (rawTaskType as AiTaskType)
      : 'COMBINED';

    const rawThreshold = Number(req.body.confidenceThreshold);
    const confidenceThreshold =
      !Number.isNaN(rawThreshold) && rawThreshold >= 0.1 && rawThreshold <= 0.95
        ? rawThreshold
        : 0.35;

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { equipment: true },
    });

    if (!classroom) {
      fs.unlink(file.path, () => undefined);
      res.status(404).json({ error: 'Selected classroom not found.' });
      return;
    }

    const mediaType: MediaType = ALLOWED_VIDEO_MIME.has(file.mimetype) ? 'VIDEO' : 'IMAGE';
    const retentionUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { media, job } = await prisma.$transaction(async (tx) => {
      const createdMedia = await tx.mediaUpload.create({
        data: {
          classroomId: classroom.id,
          sessionId,
          uploadedBy: req.user!.id,
          originalFilename: file.originalname,
          storagePath: path.resolve(file.path),
          mimeType: file.mimetype,
          fileSizeBytes: BigInt(file.size),
          mediaType,
          retentionUntil,
        },
      });

      const createdJob = await tx.aiJob.create({
        data: {
          mediaId: createdMedia.id,
          taskType,
          status: 'PROCESSING',
          confidenceThreshold,
          requestedBy: req.user!.id,
          startedAt: new Date(),
        },
      });

      return { media: createdMedia, job: createdJob };
    });

    const aiUrl = getAiServiceUrl();

    try {
      const aiResponse = await fetch(`${aiUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: path.resolve(file.path),
          media_type: mediaType,
          task_type: taskType,
          confidence_threshold: confidenceThreshold,
        }),
        signal: AbortSignal.timeout(90000),
      });

      const aiJson = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok) {
        throw new Error(aiJson.detail || `AI service returned HTTP ${aiResponse.status}`);
      }

      const result = aiJson as FastApiResponse;
      const estimatedPeople = result.people_count;
      const isOvercrowded = estimatedPeople > classroom.maxCapacity;
      const capacityStatus =
        taskType !== 'EQUIPMENT_DETECTION'
          ? isOvercrowded
            ? 'POSSIBLE_OVERCROWDING_REVIEW_REQUIRED'
            : 'WITHIN_ESTIMATED_CAPACITY'
          : null;

      await prisma.$transaction(async (tx) => {
        await tx.aiJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            modelName: result.model_name,
            modelVersion: result.model_version,
            completedAt: new Date(),
          },
        });

        let occupancyRowId: string | null = null;
        if (taskType === 'OCCUPANCY' || taskType === 'COMBINED') {
          const personConfs = result.detections
            .filter((d) => d.detected_class === 'PERSON')
            .map((d) => d.confidence);
          const avgConf =
            personConfs.length > 0
              ? personConfs.reduce((a, b) => a + b, 0) / personConfs.length
              : null;

          const occRow = await tx.aiDetectionResult.create({
            data: {
              aiJobId: job.id,
              classroomId: classroom.id,
              detectionCategory: 'PERSON_COUNT',
              detectedClass: 'PERSON',
              estimatedCount: estimatedPeople,
              confidence: avgConf ? Number(avgConf.toFixed(4)) : null,
              bboxJson: {
                imageWidth: result.image_width,
                imageHeight: result.image_height,
                framesAnalyzed: result.frames_analyzed,
                peakPeopleCount: result.peak_people_count,
              } as Prisma.InputJsonValue,
              capacityStatus,
            },
          });
          occupancyRowId = occRow.id;
        }

        const boxRows = result.detections.map((d) => ({
          aiJobId: job.id,
          classroomId: classroom.id,
          detectionCategory: d.category,
          detectedClass: d.detected_class,
          estimatedCount: 1,
          confidence: d.confidence,
          bboxJson: {
            bbox: d.bbox,
            rawLabel: d.raw_label,
            imageWidth: result.image_width,
            imageHeight: result.image_height,
          } as Prisma.InputJsonValue,
          frameIndex: d.frame_index,
        }));

        if (boxRows.length > 0) {
          await tx.aiDetectionResult.createMany({ data: boxRows });
        }

        if (isOvercrowded && (taskType === 'OCCUPANCY' || taskType === 'COMBINED')) {
          await tx.inspectionFinding.create({
            data: {
              classroomId: classroom.id,
              aiDetectionId: occupancyRowId,
              sourceType: 'AI_ESTIMATE',
              reviewStatus: 'PENDING_REVIEW',
              severity: 'HIGH',
              summary: `AI estimated ${estimatedPeople} people visible in ${classroom.roomCode}, exceeding approved capacity (${classroom.maxCapacity}). Staff review required.`,
            },
          });

          await tx.notification.create({
            data: {
              targetRole: 'FACILITY_MANAGER',
              classroomId: classroom.id,
              sourceCategory: 'AI_ESTIMATE_ALERT',
              severity: 'WARNING',
              title: `Possible Overcrowding Estimate — ${classroom.roomCode}`,
              message: `AI detected ~${estimatedPeople} people vs approved capacity of ${classroom.maxCapacity}. Marked for human review.`,
            },
          });
        }

        if (taskType === 'EQUIPMENT_DETECTION' || taskType === 'COMBINED') {
          for (const inv of classroom.equipment) {
            if (inv.itemType === 'OTHER' || inv.expectedQuantity === 0) continue;
            const isSupported = result.supported_classes.includes(inv.itemType);
            const observed = result.equipment_counts[inv.itemType] || 0;

            if (!isSupported) {
              await tx.inspectionFinding.create({
                data: {
                  classroomId: classroom.id,
                  sourceType: 'AI_ESTIMATE',
                  reviewStatus: 'PENDING_REVIEW',
                  severity: 'LOW',
                  summary: `Manual check needed for ${inv.label} (${inv.itemType}, expected ${inv.expectedQuantity}) in ${classroom.roomCode}: not supported by current base model weights.`,
                },
              });
            } else if (observed < inv.expectedQuantity) {
              await tx.inspectionFinding.create({
                data: {
                  classroomId: classroom.id,
                  sourceType: 'AI_ESTIMATE',
                  reviewStatus: 'PENDING_REVIEW',
                  severity: 'MEDIUM',
                  summary: `AI observed ${observed} ${inv.itemType}(s) vs expected ${inv.expectedQuantity} (${inv.label}) in ${classroom.roomCode}. Needs staff review (may be occluded or outside camera view).`,
                },
              });

              await tx.notification.create({
                data: {
                  targetRole: 'FACILITY_MANAGER',
                  classroomId: classroom.id,
                  sourceCategory: 'AI_ESTIMATE_ALERT',
                  severity: 'INFO',
                  title: `Equipment Review Needed — ${classroom.roomCode}`,
                  message: `AI observed ${observed} of ${inv.expectedQuantity} expected ${inv.label}. Please verify visually.`,
                },
              });
            }
          }
        }
      });

      await logAudit({
        actorUserId: req.user!.id,
        action: 'AI_JOB_COMPLETED',
        entityType: 'AI_JOB',
        entityId: job.id,
        details: {
          classroomId: classroom.id,
          taskType,
          peopleCount: estimatedPeople,
          equipmentCounts: result.equipment_counts,
        },
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: 'AI analysis completed. Results saved as estimates pending staff review.',
        jobId: job.id,
        mediaId: media.id,
        result,
        capacityComparison: {
          approvedCapacity: classroom.maxCapacity,
          estimatedOccupancy: estimatedPeople,
          capacityStatus,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'AI service unavailable during analysis.';

      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage,
        },
      });

      await logAudit({
        actorUserId: req.user!.id,
        action: 'AI_JOB_FAILED',
        entityType: 'AI_JOB',
        entityId: job.id,
        details: { errorMessage },
        ipAddress: req.ip,
      });

      res.status(503).json({
        error: `AI processing failed: ${errorMessage}. Core attendance and room records remain unaffected.`,
        jobId: job.id,
      });
    }
  });
});

router.get('/jobs', async (_req: Request, res: Response) => {
  const jobs = await prisma.aiJob.findMany({
    take: 30,
    orderBy: { createdAt: 'desc' },
    include: {
      media: {
        select: {
          id: true,
          originalFilename: true,
          mediaType: true,
          fileSizeBytes: true,
          classroom: { select: { id: true, roomCode: true, name: true, maxCapacity: true } },
        },
      },
      requester: { select: { fullName: true } },
      detectionResults: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  res.json({
    jobs: jobs.map((j) => ({
      ...j,
      media: {
        ...j.media,
        fileSizeBytes: Number(j.media.fileSizeBytes),
      },
    })),
  });
});

router.get('/jobs/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const job = await prisma.aiJob.findUnique({
    where: { id },
    include: {
      media: {
        include: {
          classroom: { include: { equipment: true } },
        },
      },
      detectionResults: true,
    },
  });

  if (!job) {
    res.status(404).json({ error: 'AI job not found.' });
    return;
  }

  res.json({
    job: {
      ...job,
      media: {
        ...job.media,
        fileSizeBytes: Number(job.media.fileSizeBytes),
      },
    },
  });
});

export default router;
