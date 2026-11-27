"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import {
  QrCode,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  Ban,
  Info,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

interface SessionOption {
  id: string;
  title: string;
  courseBatch: string;
  status: string;
  classroom: { roomCode: string; name: string };
}

interface RosterItem {
  studentId: string;
  studentCode: string;
  fullName: string;
  email: string;
  courseBatch: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  markedAt: string | null;
  method: string | null;
}

interface SessionAttendanceData {
  session: {
    id: string;
    title: string;
    courseBatch: string;
    status: string;
    classroom: { roomCode: string; name: string; maxCapacity: number };
    instructorName: string;
  };
  activeQrToken: { id: string; expiresAt: string } | null;
  summary: {
    totalEnrolled: number;
    presentCount: number;
    absentCount: number;
    attendancePercentage: number;
  };
  roster: RosterItem[];
}

interface StudentAttendanceRecord {
  sessionId: string;
  title: string;
  sessionDate: string;
  startTime: string;
  sessionStatus: string;
  classroom: { roomCode: string; name: string };
  instructorName: string;
  attendanceStatus: string;
  markedAt: string | null;
  method: string | null;
}

export default function AttendancePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <DashboardShell allowedRoles={["ADMIN", "INSTRUCTOR", "STUDENT"]}>
      {user.role === "STUDENT" ? <StudentAttendanceView /> : <StaffAttendanceView />}
    </DashboardShell>
  );
}

function StaffAttendanceView() {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [attendanceData, setAttendanceData] = useState<SessionAttendanceData | null>(null);
  const [expiryMinutes, setExpiryMinutes] = useState(5);
  const [qrPayload, setQrPayload] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrTokenId, setQrTokenId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [generating, setGenerating] = useState(false);

  const secondsLeft = qrExpiresAt
    ? Math.max(0, Math.floor((new Date(qrExpiresAt).getTime() - nowMs) / 1000))
    : null;

  const loadSessionAttendance = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const data = await apiFetch<SessionAttendanceData>(`/attendance/sessions/${sessionId}`);
      setAttendanceData(data);
      if (data.activeQrToken) {
        setQrTokenId(data.activeQrToken.id);
        setQrExpiresAt(data.activeQrToken.expiresAt);
        setNowMs(Date.now());
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load attendance roster");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ sessions: SessionOption[] }>("/sessions")
      .then((data) => {
        if (!cancelled) {
          setSessions(data.sessions);
          setSelectedSessionId((prev) => prev || data.sessions[0]?.id || "");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load sessions");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    let cancelled = false;
    apiFetch<SessionAttendanceData>(`/attendance/sessions/${selectedSessionId}`)
      .then((data) => {
        if (!cancelled) {
          setAttendanceData(data);
          if (data.activeQrToken) {
            setQrTokenId(data.activeQrToken.id);
            setQrExpiresAt(data.activeQrToken.expiresAt);
            setNowMs(Date.now());
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load attendance roster");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  useEffect(() => {
    if (!qrExpiresAt) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [qrExpiresAt]);

  const handleGenerateQr = async () => {
    if (!selectedSessionId) return;
    setGenerating(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await apiFetch<{
        qrToken: { id: string; expiresAt: string };
        qrPayload: string;
        message: string;
      }>(`/attendance/sessions/${selectedSessionId}/qr`, {
        method: "POST",
        body: JSON.stringify({ expiresInMinutes: Number(expiryMinutes) }),
      });
      setQrPayload(res.qrPayload);
      setQrExpiresAt(res.qrToken.expiresAt);
      setQrTokenId(res.qrToken.id);
      setNowMs(Date.now());
      setSuccessMsg(res.message);
      await loadSessionAttendance(selectedSessionId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate QR");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeQr = async () => {
    if (!qrTokenId) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/attendance/qr/${qrTokenId}/revoke`, { method: "POST" });
      setQrPayload("");
      setQrExpiresAt(null);
      setQrTokenId(null);
      setSuccessMsg("Active QR token revoked.");
      await loadSessionAttendance(selectedSessionId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to revoke QR");
    }
  };

  const handleManualMark = async (studentId: string, status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED") => {
    if (!selectedSessionId) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await apiFetch<{ message: string }>(
        `/attendance/sessions/${selectedSessionId}/manual`,
        {
          method: "POST",
          body: JSON.stringify({ studentId, status }),
        }
      );
      setSuccessMsg(res.message);
      await loadSessionAttendance(selectedSessionId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update attendance");
    }
  };

  const copyPayload = async () => {
    if (!qrPayload) return;
    await navigator.clipboard.writeText(qrPayload);
    setSuccessMsg("QR payload copied to clipboard for testing.");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">QR Code Attendance Control</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate time-limited QR tokens per session and review student check-ins.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <QrCode className="h-5 w-5 text-indigo-600" />
            Session QR Generator
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">Select Session</label>
              <select
                value={selectedSessionId}
                onChange={(e) => {
                  setSelectedSessionId(e.target.value);
                  setQrPayload("");
                  setQrExpiresAt(null);
                  setQrTokenId(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {sessions.length === 0 && <option value="">No sessions available</option>}
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.classroom.roomCode} - {s.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Expiration Window (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!selectedSessionId || generating}
                onClick={handleGenerateQr}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {generating ? "Generating..." : "Generate QR Code"}
              </button>
              {qrTokenId && (
                <button
                  type="button"
                  onClick={handleRevokeQr}
                  title="Revoke active QR"
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Ban className="h-4 w-4" />
                  Revoke
                </button>
              )}
            </div>
          </div>

          {qrPayload ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <QRCodeSVG value={qrPayload} size={196} includeMargin />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {secondsLeft !== null && secondsLeft > 0
                  ? `Expires in ${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`
                  : "QR Code Expired"}
              </p>
              <button
                type="button"
                onClick={copyPayload}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy QR Payload (Desktop Test)
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
              {qrExpiresAt && secondsLeft !== null && secondsLeft > 0
                ? `An active QR token exists (expires in ${secondsLeft}s). Click Generate QR Code to issue a new visible QR.`
                : "Click Generate QR Code to display a time-limited check-in QR for students."}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Session Attendance Roster</h2>
              {attendanceData && (
                <p className="text-xs text-slate-500">
                  {attendanceData.session.title} · Room {attendanceData.session.classroom.roomCode}
                </p>
              )}
            </div>
            {selectedSessionId && (
              <button
                type="button"
                onClick={() => loadSessionAttendance(selectedSessionId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            )}
          </div>

          {attendanceData && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Enrolled</p>
                  <p className="text-lg font-bold text-slate-900">
                    {attendanceData.summary.totalEnrolled}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-[11px] font-medium text-emerald-700">Present / Late</p>
                  <p className="text-lg font-bold text-emerald-800">
                    {attendanceData.summary.presentCount}
                  </p>
                </div>
                <div className="rounded-lg bg-indigo-50 p-3">
                  <p className="text-[11px] font-medium text-indigo-700">Attendance Rate</p>
                  <p className="text-lg font-bold text-indigo-800">
                    {attendanceData.summary.attendancePercentage}%
                  </p>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Student</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Method</th>
                      <th className="px-3 py-2.5 text-right">Manual Override</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {attendanceData.roster.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          No students enrolled in this session yet. Enroll students in Training
                          Sessions first.
                        </td>
                      </tr>
                    ) : (
                      attendanceData.roster.map((r) => (
                        <tr key={r.studentId}>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-slate-900">{r.fullName}</p>
                            <p className="font-mono text-[11px] text-slate-500">{r.studentCode}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${
                                r.status === "PRESENT"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : r.status === "LATE"
                                  ? "bg-amber-50 text-amber-700"
                                  : r.status === "EXCUSED"
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {r.method ? (
                              <span>
                                {r.method === "QR_SCAN" ? "QR Check-in" : "Manual"} ·{" "}
                                {r.markedAt ? new Date(r.markedAt).toLocaleTimeString() : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <select
                              value={r.status}
                              onChange={(e) =>
                                handleManualMark(
                                  r.studentId,
                                  e.target.value as "PRESENT" | "LATE" | "ABSENT" | "EXCUSED"
                                )
                              }
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                            >
                              <option value="PRESENT">Present</option>
                              <option value="LATE">Late</option>
                              <option value="ABSENT">Absent</option>
                              <option value="EXCUSED">Excused</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <span>
          <strong>Governance Note:</strong> QR check-in confirms a time-limited token submission
          at arrival and is not proof of continuous presence for the entire class. Staff overrides
          are recorded in audit logs.
        </span>
      </div>
    </div>
  );
}

function StudentAttendanceView() {
  const [qrInput, setQrInput] = useState("");
  const [scanningCamera, setScanningCamera] = useState(false);
  const [records, setRecords] = useState<StudentAttendanceRecord[]>([]);
  const [summary, setSummary] = useState({ totalSessions: 0, attendedCount: 0, percentage: 0 });
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const loadMyAttendance = useCallback(async () => {
    try {
      const data = await apiFetch<{
        summary: { totalSessions: number; attendedCount: number; percentage: number };
        records: StudentAttendanceRecord[];
      }>("/attendance/my");
      setSummary(data.summary);
      setRecords(data.records);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load attendance history");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      summary: { totalSessions: number; attendedCount: number; percentage: number };
      records: StudentAttendanceRecord[];
    }>("/attendance/my")
      .then((data) => {
        if (!cancelled) {
          setSummary(data.summary);
          setRecords(data.records);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load attendance history");
        }
      });

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined);
      }
    };
  }, []);

  const submitQrPayload = async (payload: string) => {
    setSubmitting(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const res = await apiFetch<{ message: string }>("/attendance/check-in", {
        method: "POST",
        body: JSON.stringify({ qrPayload: payload }),
      });
      setStatusMsg(res.message);
      setQrInput("");
      await loadMyAttendance();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Attendance submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const startCameraScan = async () => {
    setErrorMsg("");
    setStatusMsg("");
    setScanningCamera(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("qr-reader-region");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText) => {
            await scanner.stop().catch(() => undefined);
            setScanningCamera(false);
            await submitQrPayload(decodedText);
          },
          () => undefined
        );
      } catch (err) {
        setScanningCamera(false);
        setErrorMsg(
          err instanceof Error
            ? `Camera unavailable: ${err.message}. You can upload a QR image or paste the code instead.`
            : "Camera unavailable."
        );
      }
    }, 100);
  };

  const stopCameraScan = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => undefined);
      scannerRef.current = null;
    }
    setScanningCamera(false);
  };

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    try {
      const scanner = new Html5Qrcode("qr-file-hidden-region");
      const decoded = await scanner.scanFile(file, true);
      await submitQrPayload(decoded);
    } catch {
      setErrorMsg("Could not read a valid QR code from that image.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Student QR Attendance Check-In</h1>
        <p className="mt-1 text-sm text-slate-600">
          Scan your instructor&apos;s time-limited QR code to mark your session check-in.
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Scan or Submit QR Code</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {!scanningCamera ? (
              <button
                type="button"
                onClick={startCameraScan}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Camera className="h-4 w-4" />
                Scan with Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCameraScan}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Stop Camera
              </button>
            )}

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Scan QR Image
              <input type="file" accept="image/*" className="hidden" onChange={handleQrImageUpload} />
            </label>
          </div>

          {scanningCamera && (
            <div id="qr-reader-region" className="mt-4 overflow-hidden rounded-xl border border-slate-200" />
          )}
          <div id="qr-file-hidden-region" className="hidden" />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitQrPayload(qrInput);
            }}
            className="mt-5 space-y-3 border-t border-slate-200 pt-4"
          >
            <label className="block text-xs font-medium text-slate-700">
              Or Paste Scanned QR Payload
            </label>
            <input
              type="text"
              required
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder='{"sessionId":"...","token":"..."}'
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Attendance"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">My Attendance Summary</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Enrolled</p>
              <p className="text-xl font-bold text-slate-900">{summary.totalSessions}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Present</p>
              <p className="text-xl font-bold text-emerald-800">{summary.attendedCount}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-3">
              <p className="text-xs text-indigo-700">Rate</p>
              <p className="text-xl font-bold text-indigo-800">{summary.percentage}%</p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Session History</p>
            {records.length === 0 ? (
              <p className="text-xs text-slate-500">You are not enrolled in any sessions yet.</p>
            ) : (
              records.map((rec) => (
                <div
                  key={rec.sessionId}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{rec.title}</p>
                    <p className="text-slate-500">
                      Room {rec.classroom.roomCode} · {new Date(rec.sessionDate).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-semibold ${
                      rec.attendanceStatus === "PRESENT"
                        ? "bg-emerald-50 text-emerald-700"
                        : rec.attendanceStatus === "LATE"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {rec.attendanceStatus}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
