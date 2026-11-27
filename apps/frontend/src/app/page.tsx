"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  QrCode,
  ScanEye,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const FEATURES = [
  {
    title: "QR-Based Attendance Management",
    description:
      "Generate time-limited session QR codes for fast, verifiable student check-ins with automatic roster tracking and exportable attendance records.",
    icon: QrCode,
  },
  {
    title: "AI Classroom Occupancy Detection",
    description:
      "Analyze classroom snapshots and short clips to estimate room occupancy against approved seating capacity and surface overcrowding alerts.",
    icon: ScanEye,
  },
  {
    title: "Equipment and Asset Monitoring",
    description:
      "Maintain structured classroom hardware inventories and compare observed computers, monitors, and lab equipment against expected room counts.",
    icon: Monitor,
  },
  {
    title: "Digital Infrastructure Inspections",
    description:
      "Replace paper checklists with structured room inspections where staff review AI observations and confirm verified compliance issues.",
    icon: ClipboardCheck,
  },
  {
    title: "Maintenance and Issue Tracking",
    description:
      "Convert confirmed facility defects into prioritized maintenance tasks assigned to facility staff with end-to-end resolution status.",
    icon: Wrench,
  },
  {
    title: "Centralized Monitoring Dashboard",
    description:
      "Access role-specific workspaces, visual analytics charts, alert queues, and printable compliance reports from one unified portal.",
    icon: BarChart3,
  },
];

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Register and manage users",
    description:
      "Onboard administrators, instructors, facility managers, and students with role-based permissions and secure authentication.",
  },
  {
    step: "02",
    title: "Create classrooms and training sessions",
    description:
      "Configure room seating capacities, register equipment inventories, and schedule training sessions with enrolled student rosters.",
  },
  {
    step: "03",
    title: "Monitor attendance and infrastructure",
    description:
      "Launch dynamic QR attendance check-ins during classes and capture classroom snapshots for AI occupancy and equipment analysis.",
  },
  {
    step: "04",
    title: "Review AI findings and manage maintenance",
    description:
      "Verify AI-generated alerts through human inspection checklists and track repairs through completion in the maintenance queue.",
  },
];

const ROLE_HIGHLIGHTS = [
  {
    role: "Administrators",
    detail: "Manage user roles, audit logs, compliance reports, and centre-wide oversight.",
  },
  {
    role: "Instructors",
    detail: "Run scheduled sessions, generate dynamic QR tokens, and track batch attendance.",
  },
  {
    role: "Facility Managers",
    detail: "Review AI room observations, log inspections, and resolve maintenance tasks.",
  },
  {
    role: "Students",
    detail: "Scan session QR codes cleanly from mobile or desktop and track attendance history.",
  },
];

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleHomeLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  return (
    <div id="home" className="min-h-screen bg-white text-slate-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="#home" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-950 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5 text-violet-300" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              CentreGuard <span className="text-indigo-600">AI</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#home" className="transition-colors hover:text-indigo-700">
              Home
            </a>
            <a href="#about" className="transition-colors hover:text-indigo-700">
              About
            </a>
            <a href="#features" className="transition-colors hover:text-indigo-700">
              Features
            </a>
            <a href="#contact" className="transition-colors hover:text-indigo-700">
              Contact
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {!loading && user ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-900"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleHomeLogout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-indigo-700"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Student Registration
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <nav className="flex flex-col space-y-2 text-sm font-medium text-slate-700">
              <a
                href="#home"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                Home
              </a>
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                About
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                Features
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                Contact
              </a>
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
              {!loading && user ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-950 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Open Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={handleHomeLogout}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <UserPlus className="h-4 w-4" />
                    Student Registration
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200/80 bg-slate-50/70 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1 text-xs font-semibold text-indigo-800">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-600" />
              AI-Powered Training Centre Operations
            </span>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:leading-[1.12]">
              Smart Monitoring. Safer Training.{" "}
              <span className="text-indigo-700">Better Management.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              An intelligent platform designed to simplify training centre management through
              digital attendance, AI-powered classroom monitoring, equipment tracking, and
              infrastructure compliance.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={!loading && user ? "/dashboard" : "/login"}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-900"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-700"
              >
                Explore Features
              </a>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-slate-200 pt-6">
              <div>
                <p className="text-lg font-bold text-slate-900">QR Check-In</p>
                <p className="text-xs text-slate-500">Time-limited tokens</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">AI Vision</p>
                <p className="text-xs text-slate-500">Occupancy &amp; assets</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Human Review</p>
                <p className="text-xs text-slate-500">Verified inspections</p>
              </div>
            </div>
          </div>

          {/* Product Visual Preview Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-indigo-950/5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                    Smart Classroom Overview
                  </p>
                  <p className="mt-0.5 text-base font-bold text-slate-900">
                    Computer Lab &amp; Compliance Summary
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Compliant
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3.5">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <QrCode className="h-4 w-4 text-indigo-600" />
                    Session Attendance
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">94.2%</p>
                  <p className="mt-0.5 text-xs text-slate-500">Verified QR check-ins</p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Users className="h-4 w-4 text-violet-600" />
                    AI Occupancy Est.
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">34 / 40</p>
                  <p className="mt-0.5 text-xs text-slate-500">Within room capacity</p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-semibold text-slate-800">
                    <Monitor className="h-4 w-4 text-indigo-600" />
                    Equipment Inventory Match
                  </span>
                  <span className="font-semibold text-indigo-700">Observed</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-semibold text-slate-800">
                    <UserCheck className="h-4 w-4 text-violet-600" />
                    Human Inspection Review
                  </span>
                  <span className="font-semibold text-emerald-700">Confirmed</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-semibold text-slate-800">
                    <Wrench className="h-4 w-4 text-slate-600" />
                    Maintenance Queue
                  </span>
                  <span className="font-semibold text-slate-700">Tracked</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Platform Capabilities
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Everything Needed to Run a Compliant Training Centre
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Purpose-built tools connecting attendance verification, classroom monitoring,
              equipment inventories, inspections, and maintenance into one streamlined workflow.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="border-y border-slate-200/80 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-6">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-700">
              About CentreGuard AI
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Centralized Oversight Backed by Human Verification
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              Training centres often rely on disconnected spreadsheets for attendance, manual logs
              for lab equipment, and paper checklists for room inspections. CentreGuard AI brings
              these workflows into one role-based platform.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Automated AI observations assist staff by estimating classroom occupancy and spotting
              equipment availability, while strictly separating unverified AI predictions from
              human-confirmed inspection findings and maintenance decisions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-6">
            {ROLE_HIGHLIGHTS.map((item) => (
              <div
                key={item.role}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <p className="text-sm font-bold text-indigo-950">{item.role}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              How It Works
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Four Simple Steps from Setup to Compliance
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-950 text-xs font-bold text-white">
                  {item.step}
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / Portal Access CTA */}
      <section id="contact" className="border-t border-slate-200/80 bg-indigo-950 py-14 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to Access Your Training Centre Portal?
            </h2>
            <p className="mt-2 text-sm text-indigo-200 sm:text-base">
              Sign in with your assigned centre role or create a student account to get started
              with QR attendance and training session access.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={!loading && user ? "/dashboard" : "/login"}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-950 transition-colors hover:bg-indigo-50"
            >
              <LogIn className="h-4 w-4" />
              {!loading && user ? "Go to Dashboard" : "Sign In"}
            </Link>
            {(!user || loading) && (
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/50 bg-indigo-900/60 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-800"
              >
                <UserPlus className="h-4 w-4" />
                Student Registration
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-950 text-white">
                <ShieldCheck className="h-4 w-4 text-violet-300" />
              </div>
              <span className="text-base font-bold text-slate-900">CentreGuard AI</span>
            </div>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              AI-Based Real-Time Monitoring of Training Centres for Attendance and Infrastructure
              Compliance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
            <a href="#home" className="hover:text-indigo-700">
              Home
            </a>
            <a href="#about" className="hover:text-indigo-700">
              About
            </a>
            <a href="#features" className="hover:text-indigo-700">
              Features
            </a>
            <Link href="/login" className="hover:text-indigo-700">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-indigo-700">
              Student Registration
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
