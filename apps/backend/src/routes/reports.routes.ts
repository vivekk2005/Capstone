import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'FACILITY_MANAGER', 'INSTRUCTOR'));

router.get('/overview', async (req: Request, res: Response) => {
  const fromParam = typeof req.query.from === 'string' ? req.query.from : '';
  const toParam = typeof req.query.to === 'string' ? req.query.to : '';

  const dateRange =
    fromParam || toParam
      ? {
          ...(fromParam ? { gte: new Date(`${fromParam}T00:00:00`) } : {}),
          ...(toParam ? { lte: new Date(`${toParam}T23:59:59`) } : {}),
        }
      : undefined;

  const [
    totalStudents,
    activeStudents,
    totalInstructors,
    totalClassrooms,
    sessions,
    classrooms,
    inspections,
    findings,
    maintenanceTasks,
    recentAlerts,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.instructor.count(),
    prisma.classroom.count(),
    prisma.trainingSession.findMany({
      where: dateRange ? { sessionDate: dateRange } : undefined,
      include: {
        classroom: { select: { roomCode: true } },
        _count: { select: { enrollments: true, attendance: true } },
      },
      orderBy: { sessionDate: 'asc' },
      take: 25,
    }),
    prisma.classroom.findMany({
      include: {
        detectionResults: {
          where: {
            detectionCategory: 'PERSON_COUNT',
            ...(dateRange ? { createdAt: dateRange } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { roomCode: 'asc' },
    }),
    prisma.inspection.findMany({
      where: dateRange ? { inspectionDate: dateRange } : undefined,
      include: {
        classroom: { select: { roomCode: true, name: true } },
        inspector: { select: { fullName: true } },
      },
      orderBy: { inspectionDate: 'desc' },
      take: 20,
    }),
    prisma.inspectionFinding.findMany({
      where: dateRange ? { createdAt: dateRange } : undefined,
      select: { sourceType: true, reviewStatus: true, severity: true },
    }),
    prisma.maintenanceTask.findMany({
      where: dateRange ? { createdAt: dateRange } : undefined,
      include: {
        classroom: { select: { roomCode: true, name: true } },
        assignee: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.findMany({
      where: dateRange ? { createdAt: dateRange } : undefined,
      include: { classroom: { select: { roomCode: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ]);

  let totalEnrollments = 0;
  let totalAttendanceRecords = 0;

  const attendanceChart = sessions.map((s) => {
    totalEnrollments += s._count.enrollments;
    totalAttendanceRecords += s._count.attendance;
    return {
      name: s.title.length > 18 ? `${s.title.slice(0, 16)}..` : s.title,
      roomCode: s.classroom.roomCode,
      date: s.sessionDate.toISOString().slice(0, 10),
      enrolled: s._count.enrollments,
      present: s._count.attendance,
      rate:
        s._count.enrollments > 0
          ? Math.round((s._count.attendance / s._count.enrollments) * 100)
          : 0,
    };
  });

  const occupancySummary = classrooms.map((c) => {
    const latest = c.detectionResults[0];
    return {
      classroomId: c.id,
      roomCode: c.roomCode,
      name: c.name,
      approvedCapacity: c.maxCapacity,
      estimatedOccupancy: latest ? latest.estimatedCount : null,
      capacityStatus: latest ? latest.capacityStatus : null,
      observedAt: latest ? latest.createdAt : null,
    };
  });

  const maintenanceByStatus = {
    PENDING: maintenanceTasks.filter((t) => t.status === 'PENDING').length,
    IN_PROGRESS: maintenanceTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    COMPLETED: maintenanceTasks.filter((t) => t.status === 'COMPLETED').length,
    CANCELLED: maintenanceTasks.filter((t) => t.status === 'CANCELLED').length,
  };

  const maintenanceChart = [
    { status: 'Pending', count: maintenanceByStatus.PENDING },
    { status: 'In Progress', count: maintenanceByStatus.IN_PROGRESS },
    { status: 'Completed', count: maintenanceByStatus.COMPLETED },
    { status: 'Cancelled', count: maintenanceByStatus.CANCELLED },
  ];

  const aiEstimateFindings = findings.filter((f) => f.sourceType === 'AI_ESTIMATE');
  const humanConfirmedIssues = findings.filter((f) => f.reviewStatus === 'CONFIRMED');

  res.json({
    meta: {
      from: fromParam || null,
      to: toParam || null,
      generatedAt: new Date().toISOString(),
      evidenceCategories: [
        'Verified QR/Manual Attendance Records',
        'AI Occupancy & Object Estimates (Unverified)',
        'Human-Confirmed Inspection & Maintenance Records',
      ],
    },
    counts: {
      totalStudents,
      activeStudents,
      totalInstructors,
      totalClassrooms,
      totalSessions: sessions.length,
      overallAttendanceRate:
        totalEnrollments > 0 ? Math.round((totalAttendanceRecords / totalEnrollments) * 100) : 0,
      totalInspections: inspections.length,
      pendingMaintenance: maintenanceByStatus.PENDING + maintenanceByStatus.IN_PROGRESS,
      completedMaintenance: maintenanceByStatus.COMPLETED,
      aiEstimateFindingsCount: aiEstimateFindings.length,
      humanConfirmedIssuesCount: humanConfirmedIssues.length,
      openAlertsCount: recentAlerts.filter((a) => !a.isResolved).length,
    },
    charts: {
      attendanceChart,
      maintenanceChart,
    },
    occupancySummary,
    recentInspections: inspections,
    recentMaintenance: maintenanceTasks.slice(0, 15),
    recentAlerts,
  });
});

export default router;
