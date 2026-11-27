"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Users, AlertCircle, CheckCircle2, X, Trash2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type SessionStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

interface SessionRow {
  id: string;
  title: string;
  courseBatch: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  classroom: {
    id: string;
    roomCode: string;
    name: string;
    building: string;
    maxCapacity: number;
  };
  instructor: {
    id: string;
    user: { id: string; fullName: string; email: string };
  };
  _count: {
    enrollments: number;
    attendance: number;
  };
}

interface SessionDetail extends SessionRow {
  enrollments: {
    id: string;
    student: {
      id: string;
      studentCode: string;
      courseBatch: string;
      user: { fullName: string; email: string };
    };
  }[];
}

interface ClassroomOption {
  id: string;
  roomCode: string;
  name: string;
  maxCapacity: number;
  status: string;
}

interface InstructorOption {
  id: string;
  employeeCode: string;
  user: { fullName: string };
}

interface StudentOption {
  id: string;
  studentCode: string;
  courseBatch: string;
  user: { fullName: string };
}

export default function SessionsPage() {
  const { user } = useAuth();
  const canCreate = user?.role === "ADMIN" || user?.role === "INSTRUCTOR";

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [bucket, setBucket] = useState<"all" | "upcoming" | "completed">("all");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);

  const [title, setTitle] = useState("");
  const [courseBatch, setCourseBatch] = useState("BTECH-CSE-2027");
  const [classroomId, setClassroomId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [submitting, setSubmitting] = useState(false);

  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const q = bucket !== "all" ? `?bucket=${bucket}` : "";
      const data = await apiFetch<{ sessions: SessionRow[] }>(`/sessions${q}`);
      setSessions(data.sessions);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const q = bucket !== "all" ? `?bucket=${bucket}` : "";

    apiFetch<{ sessions: SessionRow[] }>(`/sessions${q}`)
      .then((data) => {
        if (!cancelled) {
          setSessions(data.sessions);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load sessions");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, bucket]);

  const openCreateModal = async () => {
    setErrorMsg("");
    setShowCreateModal(true);
    try {
      const roomsData = await apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms");
      const availRooms = roomsData.classrooms.filter(
        (r) => r.status === "AVAILABLE" || r.status === "IN_USE"
      );
      setClassrooms(availRooms);
      if (availRooms[0]) setClassroomId(availRooms[0].id);

      if (user?.role === "ADMIN") {
        const insData = await apiFetch<{ instructors: InstructorOption[] }>("/instructors");
        setInstructors(insData.instructors);
        if (insData.instructors[0]) setInstructorId(insData.instructors[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load form options");
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const startIso = new Date(`${sessionDate}T${startTime}:00`).toISOString();
      const endIso = new Date(`${sessionDate}T${endTime}:00`).toISOString();
      await apiFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({
          title,
          courseBatch,
          classroomId,
          ...(user?.role === "ADMIN" ? { instructorId } : {}),
          sessionDate: new Date(`${sessionDate}T00:00:00`).toISOString(),
          startTime: startIso,
          endTime: endIso,
        }),
      });
      setShowCreateModal(false);
      setTitle("");
      setSuccessMsg("Training session created.");
      await loadSessions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (sessionId: string, nextStatus: SessionStatus) => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccessMsg(`Session marked ${nextStatus}.`);
      await loadSessions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const openEnrollmentDrawer = async (sessionId: string) => {
    setErrorMsg("");
    try {
      const [detailRes, studentsRes] = await Promise.all([
        apiFetch<{ session: SessionDetail }>(`/sessions/${sessionId}`),
        canCreate
          ? apiFetch<{ students: StudentOption[] }>("/students?status=ACTIVE")
          : Promise.resolve({ students: [] }),
      ]);
      setSelectedSession(detailRes.session);
      setAllStudents(studentsRes.students);
      if (studentsRes.students[0]) setSelectedStudentId(studentsRes.students[0].id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to open session details");
    }
  };

  const handleEnrollStudent = async () => {
    if (!selectedSession || !selectedStudentId) return;
    try {
      const res = await apiFetch<{ message: string }>(
        `/sessions/${selectedSession.id}/enrollments`,
        {
          method: "POST",
          body: JSON.stringify({ studentIds: [selectedStudentId] }),
        }
      );
      setSuccessMsg(res.message);
      await openEnrollmentDrawer(selectedSession.id);
      await loadSessions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Enrollment failed");
    }
  };

  const handleEnrollBatch = async () => {
    if (!selectedSession) return;
    try {
      const res = await apiFetch<{ message: string }>(
        `/sessions/${selectedSession.id}/enrollments`,
        {
          method: "POST",
          body: JSON.stringify({ courseBatch: selectedSession.courseBatch }),
        }
      );
      setSuccessMsg(res.message);
      await openEnrollmentDrawer(selectedSession.id);
      await loadSessions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Batch enrollment failed");
    }
  };

  const handleUnenroll = async (studentId: string) => {
    if (!selectedSession) return;
    try {
      await apiFetch(`/sessions/${selectedSession.id}/enrollments/${studentId}`, {
        method: "DELETE",
      });
      await openEnrollmentDrawer(selectedSession.id);
      await loadSessions();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to remove student");
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Training Session Management</h1>
            <p className="mt-1 text-sm text-slate-600">
              Schedule classes, assign instructors &amp; classrooms, and manage student enrollments.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Create Session
            </button>
          )}
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

        <div className="flex gap-2">
          {(["all", "upcoming", "completed"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setBucket(tab)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold capitalize transition-colors ${
                bucket === tab
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab} Sessions
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Session &amp; Batch</th>
                  <th className="px-5 py-3.5">Classroom</th>
                  <th className="px-5 py-3.5">Instructor</th>
                  <th className="px-5 py-3.5">Schedule</th>
                  <th className="px-5 py-3.5">Enrolled</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                      Loading training sessions...
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                      No sessions scheduled for this filter.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{s.title}</p>
                        <p className="text-xs text-slate-500">{s.courseBatch}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <p className="font-semibold text-slate-800">{s.classroom.roomCode}</p>
                        <p className="text-slate-500">Cap: {s.classroom.maxCapacity}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-700">
                        {s.instructor.user.fullName}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <p>{new Date(s.sessionDate).toLocaleDateString()}</p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(s.startTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {new Date(s.endTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium text-slate-700">
                        {s._count.enrollments} student(s)
                      </td>
                      <td className="px-5 py-3.5">
                        {canCreate ? (
                          <select
                            value={s.status}
                            onChange={(e) =>
                              handleStatusChange(s.id, e.target.value as SessionStatus)
                            }
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                          >
                            <option value="SCHEDULED">Scheduled</option>
                            <option value="ACTIVE">Active</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold">
                            {s.status}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEnrollmentDrawer(s.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {canCreate ? "Enrollments" : "Details"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Create Training Session</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSession} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700">Session Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Computer Vision Lab 1"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Course / Batch</label>
                  <input
                    type="text"
                    required
                    value={courseBatch}
                    onChange={(e) => setCourseBatch(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Classroom</label>
                  <select
                    required
                    value={classroomId}
                    onChange={(e) => setClassroomId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.roomCode} ({c.maxCapacity} seats)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {user?.role === "ADMIN" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Instructor</label>
                  <select
                    required
                    value={instructorId}
                    onChange={(e) => setInstructorId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.user.fullName} ({i.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    required
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Start</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">End</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {submitting ? "Creating..." : "Create Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-indigo-600">
                  {selectedSession.classroom.roomCode} · Batch {selectedSession.courseBatch}
                </p>
                <h2 className="text-xl font-bold text-slate-900">{selectedSession.title}</h2>
                <p className="text-xs text-slate-500">
                  Instructor: {selectedSession.instructor.user.fullName} · Capacity:{" "}
                  {selectedSession.classroom.maxCapacity} seats
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {canCreate && (
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">Enroll Students</p>
                  <button
                    type="button"
                    onClick={handleEnrollBatch}
                    className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    + Enroll Entire Batch ({selectedSession.courseBatch})
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {allStudents.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.user.fullName} ({st.studentCode} - {st.courseBatch})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleEnrollStudent}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Enroll
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-800">
                Enrolled Students ({selectedSession.enrollments.length})
              </h3>
              {selectedSession.enrollments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No students enrolled yet.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {selectedSession.enrollments.map((en) => (
                    <div
                      key={en.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{en.student.user.fullName}</p>
                        <p className="text-slate-500">
                          {en.student.studentCode} · {en.student.courseBatch}
                        </p>
                      </div>
                      {canCreate && (
                        <button
                          type="button"
                          onClick={() => handleUnenroll(en.student.id)}
                          className="text-rose-600 hover:text-rose-700"
                          title="Remove from session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
