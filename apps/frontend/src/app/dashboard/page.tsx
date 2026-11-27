"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Users,
  ClipboardList,
  UserCircle,
  ArrowRight,
  Info,
  GraduationCap,
  DoorOpen,
  CalendarClock,
  QrCode,
  ScanEye,
  ClipboardCheck,
  Wrench,
  Bell,
  PieChart,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatRoleLabel, UserRole } from "@/lib/api";

interface StaffSummaryCounts {
  totalStudents: number;
  totalClassrooms: number;
  overallAttendanceRate: number;
  pendingMaintenance: number;
  openAlertsCount: number;
}

const ROLE_SUMMARY: Record<
  UserRole,
  { heading: string; description: string; capabilities: string[] }
> = {
  ADMIN: {
    heading: "Administrator Control Panel",
    description:
      "Full oversight of user accounts, role assignments, classrooms, training sessions, AI findings review, maintenance, and audit logs.",
    capabilities: [
      "Create, activate, and deactivate user accounts across all 4 roles",
      "Monitor security audit logs for logins, role changes, and attendance actions",
      "Access all core management, AI analysis, and reporting modules (Phases 3–7)",
    ],
  },
  INSTRUCTOR: {
    heading: "Instructor Workspace",
    description:
      "Manage scheduled training sessions, generate time-limited QR attendance tokens, and review session attendance records.",
    capabilities: [
      "Create sessions and issue time-limited QR codes (Phase 3–4)",
      "View enrolled student lists and attendance summaries (Phase 4)",
      "Manage personal profile and account security",
    ],
  },
  FACILITY_MANAGER: {
    heading: "Facility & Compliance Workspace",
    description:
      "Monitor classroom capacity estimates, inspect equipment observations, confirm or reject AI findings, and track maintenance tasks.",
    capabilities: [
      "Review AI occupancy & equipment estimates alongside human inspections (Phases 5–6)",
      "Create and resolve facility maintenance tasks (Phase 6)",
      "Keep AI predictions separate from confirmed compliance issues",
    ],
  },
  STUDENT: {
    heading: "Student Portal",
    description:
      "View your enrollment profile, check in to active sessions via time-limited QR codes, and track your attendance records.",
    capabilities: [
      "Scan session QR codes for verified check-in (Phase 4)",
      "Review personal batch details and attendance history",
      "Restricted from administrative, staff inspection, and other students' records",
    ],
  },
};

export default function DashboardHomePage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<StaffSummaryCounts | null>(null);

  useEffect(() => {
    if (user && user.role !== "STUDENT") {
      apiFetch<{ counts: StaffSummaryCounts }>("/reports/overview")
        .then((res) => setCounts(res.counts))
        .catch(() => undefined);
    }
  }, [user]);

  return (
    <DashboardShell>
      {user && (
        <div className="mx-auto max-w-5xl space-y-6">
          {counts && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="text-xs text-slate-500">Students</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{counts.totalStudents}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="text-xs text-slate-500">Classrooms</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{counts.totalClassrooms}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="text-xs text-slate-500">Attendance Rate</p>
                <p className="mt-1 text-xl font-bold text-indigo-700">
                  {counts.overallAttendanceRate}%
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="text-xs text-slate-500">Pending Maint. / Open Alerts</p>
                <p className="mt-1 text-xl font-bold text-amber-700">
                  {counts.pendingMaintenance} / {counts.openAlertsCount}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {formatRoleLabel(user.role)}
                </span>
                <h1 className="mt-3 text-2xl font-bold text-slate-900">
                  Welcome back, {user.fullName}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  {ROLE_SUMMARY[user.role].description}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {ROLE_SUMMARY[user.role].heading} — Role Permissions
              </p>
              <ul className="mt-2.5 space-y-1.5 text-sm text-slate-700">
                {ROLE_SUMMARY[user.role].capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(user.role === "ADMIN" || user.role === "INSTRUCTOR" || user.role === "STUDENT") && (
              <Link
                href="/dashboard/attendance"
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
              >
                <div className="flex items-center justify-between">
                  <QrCode className="h-6 w-6 text-indigo-600" />
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </div>
                <h2 className="mt-3 font-semibold text-slate-900">QR Attendance</h2>
                <p className="mt-1 text-xs text-slate-600">
                  {user.role === "STUDENT"
                    ? "Scan session QR codes and view your attendance history."
                    : "Issue time-limited QR tokens and review live session rosters."}
                </p>
              </Link>
            )}

            {(user.role === "ADMIN" || user.role === "FACILITY_MANAGER") && (
              <>
                <Link
                  href="/dashboard/ai-monitoring"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <ScanEye className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">AI Vision Monitoring</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Estimate room occupancy and observe classroom equipment with YOLO.
                  </p>
                </Link>

                <Link
                  href="/dashboard/inspections"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <ClipboardCheck className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">Inspections &amp; Review</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Confirm or reject AI observations and log physical room inspections.
                  </p>
                </Link>

                <Link
                  href="/dashboard/maintenance"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <Wrench className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">Maintenance Tasks</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Assign repairs, track progress, and close resolved facility issues.
                  </p>
                </Link>
              </>
            )}

            {(user.role === "ADMIN" ||
              user.role === "FACILITY_MANAGER" ||
              user.role === "INSTRUCTOR") && (
              <>
                <Link
                  href="/dashboard/alerts"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <Bell className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">Alerts &amp; Notifications</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Review AI estimate alerts separately from human-confirmed issues.
                  </p>
                </Link>

                <Link
                  href="/dashboard/reports"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <PieChart className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">Reports &amp; Analytics</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Interactive charts, occupancy comparisons, and CSV/PDF exports.
                  </p>
                </Link>
              </>
            )}

            <Link
              href="/dashboard/sessions"
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
            >
              <div className="flex items-center justify-between">
                <CalendarClock className="h-6 w-6 text-indigo-600" />
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <h2 className="mt-3 font-semibold text-slate-900">Training Sessions</h2>
              <p className="mt-1 text-xs text-slate-600">
                View schedules, classroom assignments, and enrolled student rosters.
              </p>
            </Link>

            <Link
              href="/dashboard/classrooms"
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
            >
              <div className="flex items-center justify-between">
                <DoorOpen className="h-6 w-6 text-indigo-600" />
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <h2 className="mt-3 font-semibold text-slate-900">Classrooms &amp; Inventory</h2>
              <p className="mt-1 text-xs text-slate-600">
                Manage room capacities, equipment checklists, and occupancy status.
              </p>
            </Link>

            {(user.role === "ADMIN" || user.role === "INSTRUCTOR") && (
              <Link
                href="/dashboard/students"
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
              >
                <div className="flex items-center justify-between">
                  <GraduationCap className="h-6 w-6 text-indigo-600" />
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </div>
                <h2 className="mt-3 font-semibold text-slate-900">Student Management</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Search student profiles, batches, enrollments, and attendance records.
                </p>
              </Link>
            )}

            <Link
              href="/dashboard/profile"
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
            >
              <div className="flex items-center justify-between">
                <UserCircle className="h-6 w-6 text-indigo-600" />
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <h2 className="mt-3 font-semibold text-slate-900">My Profile &amp; Security</h2>
              <p className="mt-1 text-xs text-slate-600">
                Update your name, contact details, or change your password.
              </p>
            </Link>

            {user.role === "ADMIN" && (
              <>
                <Link
                  href="/dashboard/users"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <Users className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">User &amp; Role Management</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Provision accounts, assign roles, and enable or disable users.
                  </p>
                </Link>

                <Link
                  href="/dashboard/audit-logs"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <ClipboardList className="h-6 w-6 text-indigo-600" />
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h2 className="mt-3 font-semibold text-slate-900">Security Audit Logs</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Review recorded logins, account updates, and system actions.
                  </p>
                </Link>
              </>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Phase 7 Active — Full Platform Analytics &amp; Reports Ready</p>
              <p className="mt-0.5 text-amber-800">
                This platform avoids face recognition and continuous CCTV surveillance in v1. All
                future AI outputs (Phase 5+) will be clearly labeled as estimates requiring human
                review before compliance or safety decisions are recorded.
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
