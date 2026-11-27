# CentreGuard AI — Training Centre Attendance & Infrastructure Compliance Platform

**AI-Based Real-Time Monitoring of Training Centres for Attendance and Infrastructure Compliance**  
B.Tech CSE Final-Year Capstone Project (2026–2027)

---

## Architecture Overview

| Service | Stack | Port | Responsibility |
| --- | --- | --- | --- |
| `apps/frontend` | Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Recharts | `3000` | Role-based web portal, QR attendance, AI job inspection & reports |
| `apps/backend` | Node.js + Express + TypeScript + Prisma + PostgreSQL | `4000` | REST API, JWT auth, RBAC, audit logs, QR tokens, media & compliance workflows |
| `services/ai-service` | Python + FastAPI + OpenCV (`4.10.0`) + Ultralytics YOLOv8 | `8000` | Occupancy estimation (`PERSON`) & equipment observation (`COMPUTER`, `MONITOR`, etc.) |

---

## Implemented Modules & Scope Boundaries

### Modules Covered
1. **Authentication, RBAC & Audit Logs** (`/api/auth`, `/api/users`) — `ADMIN`, `INSTRUCTOR`, `FACILITY_MANAGER`, `STUDENT` roles, HTTP-only JWT cookies, password reset tokens, audit trail.
2. **Core Operations** (`/api/students`, `/api/instructors`, `/api/classrooms`, `/api/sessions`) — Student/instructor directory, classroom capacity & equipment inventory, training session scheduling & enrollment.
3. **Time-Limited QR Attendance** (`/api/attendance`) — SHA-256 hashed dynamic QR payloads (`qrcode.react` + `html5-qrcode`), expiry/revocation, duplicate check-in prevention, manual overrides, and CSV attendance exports.
4. **AI Snapshot & Short-Clip Monitoring** (`/api/ai`, `/api/media`, FastAPI `/analyze`) — Authenticated media upload, path-traversal protection (`isPathInsideRoot` & `resolve_safe_media_path`), YOLOv8 person & equipment detection with bounding-box overlay.
5. **Human Inspections, Maintenance & Alerts** (`/api/inspections`, `/api/maintenance`, `/api/notifications`) — Structured inspection checklists, human review/confirmation workflow, maintenance ticket lifecycle, and categorized alerts.
6. **Analytics Dashboard & Reports** (`/api/reports/overview`, `/dashboard/reports`) — Date-filtered operational KPIs, Recharts bar visualizations, CSV export, and Print/Save PDF reports.

### Explicit v1 Design Boundaries
- **Single-centre prototype scope** (no multi-tenant centre hierarchy).
- **No facial recognition** and **no continuous 24/7 CCTV RTSP streaming** in v1 (uses session QR check-ins + uploaded snapshots/short video clips).
- **Strict Evidence Separation:** **AI Estimates (Unverified)** (`AI_ESTIMATE_ALERT`, `AiDetectionResult`) are always tracked and displayed separately from **Human-Confirmed Issues** (`HUMAN_CONFIRMED_ISSUE`, verified `InspectionFinding` records).

---

## Prerequisites & Setup

1. **PostgreSQL** running locally with database `capstone_monitoring`.
2. **Backend environment** — copy `apps/backend/.env.example` to `apps/backend/.env` and update `DATABASE_URL` and `JWT_SECRET`:
   ```env
   PORT=4000
   NODE_ENV=development
   DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/capstone_monitoring?schema=public"
   JWT_SECRET="replace-with-a-long-random-secret-key-min-32-chars"
   JWT_EXPIRES_IN="1d"
   FRONTEND_URL="http://localhost:3000"
   AI_SERVICE_URL="http://127.0.0.1:8000"
   UPLOAD_DIR="./uploads"
   MAX_FILE_SIZE_MB=25
   ```
3. **AI service environment** — `services/ai-service/.env` (from `.env.example`):
   ```env
   AI_PORT=8000
   ALLOWED_UPLOAD_ROOT=../../apps/backend/uploads
   DEFAULT_CONFIDENCE_THRESHOLD=0.35
   BASE_MODEL_PATH=yolov8n.pt
   CUSTOM_EQUIPMENT_MODEL_PATH=
   ```

### Database Migration & Seed Data

```powershell
cd apps\backend
npx prisma migrate dev --name init
npm run db:seed
```

Seeded demo accounts (from `apps/backend/prisma/seed.ts`):
- **Admin:** `admin@centreguard.local` / `Admin@1234`
- **Instructor:** `instructor@centreguard.local` / `Instructor@1234`
- **Facility Manager:** `facility@centreguard.local` / `Facility@1234`
- **Student:** `student@centreguard.local` / `Student@1234`

---

## Running Locally (3 Terminals)

1. **Backend REST API (`http://localhost:4000`):**
   ```powershell
   cd apps\backend
   npm run dev
   ```
2. **AI Vision Service (`http://127.0.0.1:8000`):**
   ```powershell
   cd services\ai-service
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
   ```
3. **Frontend Web Portal (`http://localhost:3000`):**
   ```powershell
   cd apps\frontend
   npm run dev
   ```

---

## Verification & Automated Tests

### Backend Build & Tests (`apps/backend`)
```powershell
npm --prefix apps\backend run build
npm --prefix apps\backend test
```

### AI Service Unit Tests (`services/ai-service`)
```powershell
cd services\ai-service
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

### Frontend Lint & Production Build (`apps/frontend`)
```powershell
npm --prefix apps\frontend run lint
npm --prefix apps\frontend run build
```
