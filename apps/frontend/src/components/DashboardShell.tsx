"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  UserCircle,
  LogOut,
  Menu,
  X,
  Building2,
  ClipboardList,
  GraduationCap,
  BookOpenCheck,
  DoorOpen,
  CalendarClock,
  QrCode,
  BarChart3,
  ScanEye,
  ClipboardCheck,
  Wrench,
  Bell,
  PieChart,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatRoleLabel, UserRole } from "@/lib/api";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "INSTRUCTOR", "FACILITY_MANAGER", "STUDENT"],
  },
  {
    label: "Students",
    href: "/dashboard/students",
    icon: GraduationCap,
    roles: ["ADMIN", "INSTRUCTOR"],
  },
  {
    label: "Instructors",
    href: "/dashboard/instructors",
    icon: BookOpenCheck,
    roles: ["ADMIN", "INSTRUCTOR", "FACILITY_MANAGER"],
  },
  {
    label: "Classrooms & Inventory",
    href: "/dashboard/classrooms",
    icon: DoorOpen,
    roles: ["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR", "STUDENT"],
  },
  {
    label: "Training Sessions",
    href: "/dashboard/sessions",
    icon: CalendarClock,
    roles: ["ADMIN", "INSTRUCTOR", "FACILITY_MANAGER", "STUDENT"],
  },
  {
    label: "QR Attendance",
    href: "/dashboard/attendance",
    icon: QrCode,
    roles: ["ADMIN", "INSTRUCTOR", "STUDENT"],
  },
  {
    label: "Attendance Reports",
    href: "/dashboard/attendance/reports",
    icon: BarChart3,
    roles: ["ADMIN", "INSTRUCTOR"],
  },
  {
    label: "AI Monitoring",
    href: "/dashboard/ai-monitoring",
    icon: ScanEye,
    roles: ["ADMIN", "FACILITY_MANAGER"],
  },
  {
    label: "Inspections & Review",
    href: "/dashboard/inspections",
    icon: ClipboardCheck,
    roles: ["ADMIN", "FACILITY_MANAGER"],
  },
  {
    label: "Maintenance Tasks",
    href: "/dashboard/maintenance",
    icon: Wrench,
    roles: ["ADMIN", "FACILITY_MANAGER"],
  },
  {
    label: "Alerts & Notifications",
    href: "/dashboard/alerts",
    icon: Bell,
    roles: ["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR"],
  },
  {
    label: "Reports & Analytics",
    href: "/dashboard/reports",
    icon: PieChart,
    roles: ["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR"],
  },
  {
    label: "User & Role Management",
    href: "/dashboard/users",
    icon: Users,
    roles: ["ADMIN"],
  },
  {
    label: "Audit Logs",
    href: "/dashboard/audit-logs",
    icon: ClipboardList,
    roles: ["ADMIN"],
  },
  {
    label: "My Profile",
    href: "/dashboard/profile",
    icon: UserCircle,
    roles: ["ADMIN", "INSTRUCTOR", "FACILITY_MANAGER", "STUDENT"],
  },
];

export default function DashboardShell({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isAuthorized = !allowedRoles || allowedRoles.includes(user.role);
  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const performLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setConfirmLogoutOpen(false);
      setMobileOpen(false);
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">CentreGuard AI</p>
              <p className="text-[11px] font-medium text-slate-500">Single-Centre Prototype</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Active Modules
          </p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => setConfirmLogoutOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>RBAC Protected Session</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20 sm:px-3">
              {formatRoleLabel(user.role)}
            </span>
            <button
              type="button"
              onClick={() => setConfirmLogoutOpen(true)}
              aria-label="Logout"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {!isAuthorized ? (
            <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-xl font-bold text-slate-900">403 — Access Denied</h1>
              <p className="mt-2 text-sm text-slate-600">
                Your current role (<strong>{formatRoleLabel(user.role)}</strong>) does not have
                permission to access this page.
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Return to My Dashboard
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {confirmLogoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <h2 id="logout-dialog-title" className="text-base font-bold text-slate-900">
                  Sign Out of CentreGuard AI?
                </h2>
                <p className="text-xs text-slate-500">
                  Signed in as {user.fullName} ({formatRoleLabel(user.role)})
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Your active session cookie will be cleared and you will need to sign in again to access
              dashboard pages.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setConfirmLogoutOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={performLogout}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? "Signing out..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
