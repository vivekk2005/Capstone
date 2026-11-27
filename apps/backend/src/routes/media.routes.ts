import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isPathInsideRoot } from '../lib/security';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole('ADMIN', 'FACILITY_MANAGER'), async (_req: Request, res: Response) => {
  const media = await prisma.mediaUpload.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: {
      classroom: { select: { roomCode: true, name: true } },
      uploader: { select: { fullName: true, role: true } },
    },
  });

  res.json({
    media: media.map((m) => ({
      ...m,
      fileSizeBytes: Number(m.fileSizeBytes),
    })),
  });
});

router.get(
  '/:id/file',
  requireRole('ADMIN', 'FACILITY_MANAGER', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const media = await prisma.mediaUpload.findUnique({ where: { id } });

    if (!media) {
      res.status(404).json({ error: 'Media record not found.' });
      return;
    }

    const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
    const resolvedFile = path.resolve(media.storagePath);

    if (!isPathInsideRoot(uploadRoot, resolvedFile)) {
      res.status(403).json({ error: 'Access denied: invalid media path.' });
      return;
    }

    if (!fs.existsSync(resolvedFile)) {
      res.status(404).json({ error: 'Media file is no longer present on disk.' });
      return;
    }

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(resolvedFile);
  }
);

export default router;
