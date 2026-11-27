import { Router, Request, Response } from 'express';
import { NotificationCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  const categoryParam =
    typeof req.query.category === 'string' ? req.query.category.toUpperCase() : '';
  const resolvedParam = typeof req.query.resolved === 'string' ? req.query.resolved : '';

  const validCategories: NotificationCategory[] = [
    'AI_ESTIMATE_ALERT',
    'HUMAN_CONFIRMED_ISSUE',
    'OPERATIONAL_SYSTEM',
  ];

  const isAdmin = req.user!.role === 'ADMIN';

  const notifications = await prisma.notification.findMany({
    where: {
      ...(!isAdmin
        ? {
            OR: [{ targetUserId: req.user!.id }, { targetRole: req.user!.role }],
          }
        : {}),
      ...(validCategories.includes(categoryParam as NotificationCategory)
        ? { sourceCategory: categoryParam as NotificationCategory }
        : {}),
      ...(resolvedParam === 'true'
        ? { isResolved: true }
        : resolvedParam === 'false'
        ? { isResolved: false }
        : {}),
    },
    include: {
      classroom: { select: { roomCode: true, name: true } },
      resolver: { select: { fullName: true } },
    },
    orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
    take: 60,
  });

  res.json({ notifications });
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json({ notification: updated });
});

router.patch(
  '/:id/resolve',
  requireRole('ADMIN', 'FACILITY_MANAGER', 'INSTRUCTOR'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        isResolved: true,
        resolvedBy: req.user!.id,
        resolvedAt: new Date(),
      },
      include: {
        classroom: { select: { roomCode: true, name: true } },
        resolver: { select: { fullName: true } },
      },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: 'RESOLVE_NOTIFICATION',
      entityType: 'NOTIFICATION',
      entityId: id,
      details: { sourceCategory: existing.sourceCategory },
      ipAddress: req.ip,
    });

    res.json({ message: 'Alert resolved.', notification: updated });
  }
);

export default router;
