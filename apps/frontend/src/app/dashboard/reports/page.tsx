"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Download, Printer, AlertCircle, Info, Bot, UserCheck } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface OverviewResponse {
  meta: {
    from: string | null;
    to: string | null;
    generatedAt: string;
    evidenceCategories: string[];
  };
  counts: {
    totalStudents: number;
    activeStudents: number;
    totalInstructors: number;
    totalClassrooms: number;
    totalSessions: number;
    overallAttendanceRate: number;
    totalInspections: number;
    pendingMaintenance: number;
    completedMaintenance: number;
    aiEstimateFindingsCount: number;
    humanConfirmedIssuesCount: number;
    openAlertsCount: number;
  };
  charts: {
    attendanceChart: {
      name: string;
      roomCode: string;
      date: string;
      enrolled: number;
      present: number;
      rate: number;
    }[];
    maintenanceChart: {
      status: string;
      count: number;
    }[];
  };
  occupancySummary: {
    classroomId: string;
    roomCode: string;
    name: string;
    approvedCapacity: number;
    estimatedOccupancy: number | null;
    capacityStatus: string | null;
    observedAt: string | null;
  }[];
  recentInspections: {
    id: string;
    inspectionDate: string;
    overallStatus: string;
    cleanlinessRating: string;
    buildingCondition: string;
    classroom: { roomCode: string; name: string };
    inspector: { fullName: string };
  }[];
  recentMaintenance: {
    id: string;
    title: string;
    priority: string;
    status: string;
    createdAt: string;
    classroom: { roomCode: string };
    assignee: { fullName: string } | null;
  }[];
  recentAlerts: {
    id: string;
    sourceCategory: string;
    title: string;
    severity: string;
    isResolved: boolean;
    createdAt: string;
    classroom: { roomCode: string } | null;
  }[];
}

export default function ReportsAnalyticsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!user || !["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR"].includes(user.role)) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString() ? `?${params.toString()}` : "";

    apiFetch<OverviewResponse>(`/reports/overview${q}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load analytics report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, from, to]);

  const exportCsv = () => {
    if (!data) return;
    const lines: string[][] = [
      ["CentreGuard AI — Training Centre Operational Report"],
      ["Generated At", data.meta.generatedAt],
      ["Date Range", `${data.meta.from || "All"} to ${data.meta.to || "Present"}`],
      [],
      ["Category", "Metric", "Value"],
      ["Core", "Total Students", String(data.counts.totalStudents)],
      ["Core", "Total Instructors", String(data.counts.totalInstructors)],
      ["Core", "Total Classrooms", String(data.counts.totalClassrooms)],
      ["Core", "Total Training Sessions", String(data.counts.totalSessions)],
      ["Attendance", "Overall Attendance Rate", `${data.counts.overallAttendanceRate}%`],
      ["AI Estimates (Unverified)", "AI Estimate Findings", String(data.counts.aiEstimateFindingsCount)],
      ["Human Confirmed", "Confirmed Compliance Issues", String(data.counts.humanConfirmedIssuesCount)],
      ["Maintenance", "Pending / In-Progress Tasks", String(data.counts.pendingMaintenance)],
      ["Maintenance", "Completed Tasks", String(data.counts.completedMaintenance)],
      ["Alerts", "Open Alerts", String(data.counts.openAlertsCount)],
      [],
      ["Classroom Occupancy Summary (AI Estimates vs Approved Capacity)"],
      ["Room Code", "Room Name", "Approved Capacity", "Latest AI Estimate", "Status"],
      ...data.occupancySummary.map((o) => [
        o.roomCode,
        o.name,
        String(o.approvedCapacity),
        o.estimatedOccupancy !== null ? String(o.estimatedOccupancy) : "No AI Scan",
        o.capacityStatus || "N/A",
      ]),
    ];

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `centre-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports &amp; Analytics</h1>
            <p className="mt-1 text-sm text-slate-600">
              Combined operational overview separating AI estimates from human-confirmed records.
            </p>
          </div>
          {data && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
          <div>
            <label className="block text-xs font-medium text-slate-600">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear Dates
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading || !data ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Generating centre analytics...
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div>
                <p>
                  <strong>Report Scope:</strong>{" "}
                  {data.meta.from || data.meta.to
                    ? `${data.meta.from || "Start"} to ${data.meta.to || "Present"}`
                    : "All Recorded Dates"}{" "}
                  · <strong>Evidence Types:</strong> {data.meta.evidenceCategories.join(" | ")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Registered Students</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.counts.totalStudents}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {data.counts.activeStudents} active
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Instructors &amp; Classrooms</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.counts.totalInstructors} / {data.counts.totalClassrooms}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {data.counts.totalSessions} session(s) in range
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Attendance Rate</p>
                <p className="mt-1 text-2xl font-bold text-indigo-700">
                  {data.counts.overallAttendanceRate}%
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Across enrolled seats</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Maintenance (Pending / Done)</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  <span className="text-amber-700">{data.counts.pendingMaintenance}</span> /{" "}
                  <span className="text-emerald-700">{data.counts.completedMaintenance}</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {data.counts.openAlertsCount} open alert(s)
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center gap-3">
                  <Bot className="h-6 w-6 text-amber-700" />
                  <div>
                    <p className="text-xs font-semibold text-amber-900">
                      Category A: AI Estimates (Unverified)
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Model-generated observations awaiting or undergoing review
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-amber-900">
                  {data.counts.aiEstimateFindingsCount}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-6 w-6 text-rose-700" />
                  <div>
                    <p className="text-xs font-semibold text-rose-900">
                      Category B: Human-Confirmed Issues
                    </p>
                    <p className="text-[11px] text-rose-800">
                      Verified by authorized staff during review or inspection
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-rose-900">
                  {data.counts.humanConfirmedIssuesCount}
                </span>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">
                  Session Attendance (Enrolled vs Present/Late)
                </h2>
                <div className="mt-4 h-64">
                  {data.charts.attendanceChart.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      No session data in selected range.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.charts.attendanceChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="enrolled" name="Enrolled" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="present" name="Present/Late" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Maintenance Task Status</h2>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.maintenanceChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Tasks" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-slate-900">
                    Classroom Capacity vs Latest AI Occupancy Estimate
                  </h2>
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Room</th>
                      <th className="px-4 py-2.5">Approved Cap.</th>
                      <th className="px-4 py-2.5">AI Estimate</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.occupancySummary.map((room) => (
                      <tr key={room.classroomId}>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">
                          {room.roomCode}
                        </td>
                        <td className="px-4 py-2.5">{room.approvedCapacity}</td>
                        <td className="px-4 py-2.5 font-mono">
                          {room.estimatedOccupancy !== null ? `${room.estimatedOccupancy}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {room.capacityStatus || "No AI scan yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-slate-900">
                    Recent Inspections ({data.counts.totalInspections})
                  </h2>
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Room</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Inspector</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.recentInspections.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                          No inspections in selected range.
                        </td>
                      </tr>
                    ) : (
                      data.recentInspections.map((ins) => (
                        <tr key={ins.id}>
                          <td className="px-4 py-2.5 text-slate-500">
                            {new Date(ins.inspectionDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">
                            {ins.classroom.roomCode}
                          </td>
                          <td className="px-4 py-2.5 font-medium">{ins.overallStatus}</td>
                          <td className="px-4 py-2.5 text-slate-600">{ins.inspector.fullName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
