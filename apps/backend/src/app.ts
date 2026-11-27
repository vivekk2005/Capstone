import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { prisma } from './lib/prisma';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import studentsRoutes from './routes/students.routes';
import instructorsRoutes from './routes/instructors.routes';
import classroomsRoutes from './routes/classrooms.routes';
import sessionsRoutes from './routes/sessions.routes';
import attendanceRoutes from './routes/attendance.routes';
import mediaRoutes from './routes/media.routes';
import aiRoutes from './routes/ai.routes';
import inspectionsRoutes from './routes/inspections.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import notificationsRoutes from './routes/notifications.routes';
import reportsRoutes from './routes/reports.routes';

dotenv.config();

/**
 * Builds and configures the Express application instance without binding a network port.
 */
export function createApp(): Express {
  const app = express();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(helmet());
  app.use(
    cors({
      origin: frontendUrl,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/', (_req, res) => {
    res.json({
      message: 'Training Centre Monitoring Backend API is running.',
      healthEndpoint: '/api/health',
      frontendUrl,
    });
  });

  app.get('/api/health', async (_req, res) => {
    let database: 'connected' | 'disconnected' = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    res.json({
      status: 'ok',
      service: 'capstone-backend',
      database,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/students', studentsRoutes);
  app.use('/api/instructors', instructorsRoutes);
  app.use('/api/classrooms', classroomsRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/inspections', inspectionsRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/reports', reportsRoutes);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled backend error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

export const app = createApp();
