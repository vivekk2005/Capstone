"use client";

import React, { useEffect, useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AttendanceReportResponse {
  summary: {
    totalSessions: number;
    totalEnrollments: number;
    totalPresent: number;
    overallPercentage: number;
  };
  sessionReports: {
    id: string;
    title: string;
    courseBatch: string;
    roomCode: string;
    sessionDate: string;
    status: string;
    enrolledCount: number;
    presentCount: number;
    percentage: number;
  }[];
  studentReports: {
    studentId: string;
    studentCode: string;
    fullName: string;
    courseBatch: string;
    enrolled: number;
    present: number;
    percentage: number;
  }[];
}

export default function AttendanceReportsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [batch, setBatch] = useState("");
  const [report, setReport] = useState<AttendanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "INSTRUCTOR")) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (batch.trim()) params.set("batch", batch.trim());
    const q = params.toString() ? `?${params.toString()}` : "";

    apiFetch<AttendanceReportResponse>(`/attendance/reports${q}`)
      .then((data) => {
        if (!cancelled) {
          setReport(data);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load attendance report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, from, to, batch]);

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ["Student ID", "Student Name", "Batch", "Sessions Enrolled", "Present/Late", "Percentage"],
      ...report.studentReports.map((s) => [
        s.studentCode,
        s.fullName,
        s.courseBatch,
        String(s.enrolled),
        String(s.present),
        `${s.percentage}%`,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "INSTRUCTOR"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Attendance Percentage Reports</h1>
            <p className="mt-1 text-sm text-slate-600">
              Filter session and student attendance percentages by date range or batch.
            </p>
          </div>
          {report && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
          <div>
            <label className="block text-xs font-medium text-slate-600">Batch Filter</label>
            <input
              type="text"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="e.g. BTECH-CSE-2027"
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {loading || !report ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading attendance analytics...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Total Sessions</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {report.summary.totalSessions}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Total Seat Enrollments</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {report.summary.totalEnrollments}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Verified Check-ins</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {report.summary.totalPresent}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs text-slate-500">Overall Attendance</p>
                <p className="mt-1 text-2xl font-bold text-indigo-700">
                  {report.summary.overallPercentage}%
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-slate-900">By Session</h2>
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Session</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Present / Enrolled</th>
                      <th className="px-4 py-2.5 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.sessionReports.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{s.title}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {new Date(s.sessionDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5">
                          {s.presentCount} / {s.enrolledCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-indigo-700">
                          {s.percentage}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-slate-900">By Student</h2>
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Student</th>
                      <th className="px-4 py-2.5">Batch</th>
                      <th className="px-4 py-2.5">Attended</th>
                      <th className="px-4 py-2.5 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.studentReports.map((st) => (
                      <tr key={st.studentId}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-900">{st.fullName}</p>
                          <p className="font-mono text-[11px] text-slate-500">{st.studentCode}</p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{st.courseBatch}</td>
                        <td className="px-4 py-2.5">
                          {st.present} / {st.enrolled}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                          {st.percentage}%
                        </td>
                      </tr>
                    ))}
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
