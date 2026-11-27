"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, AlertCircle, CheckCircle2, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type MaintenanceStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface MaintenanceTaskRow {
  id: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  classroom: { id: string; roomCode: string; name: string };
  assignee: { id: string; fullName: string; email: string } | null;
  creator: { fullName: string };
  finding: { id: string; sourceType: string; summary: string } | null;
}

interface StaffOption {
  id: string;
  fullName: string;
  role: string;
}

interface ClassroomOption {
  id: string;
  roomCode: string;
  name: string;
}

export default function MaintenancePage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<MaintenanceTaskRow[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [classroomId, setClassroomId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MaintenancePriority>("MEDIUM");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      const q = params.toString() ? `?${params.toString()}` : "";

      const [tasksRes, roomsRes, staffRes] = await Promise.all([
        apiFetch<{ tasks: MaintenanceTaskRow[] }>(`/maintenance${q}`),
        apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms"),
        apiFetch<{ staff: StaffOption[] }>("/maintenance/assignees"),
      ]);
      setTasks(tasksRes.tasks);
      setClassrooms(roomsRes.classrooms);
      if (roomsRes.classrooms[0] && !classroomId) setClassroomId(roomsRes.classrooms[0].id);
      setStaff(staffRes.staff);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load maintenance tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, classroomId]);

  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "FACILITY_MANAGER")) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    const q = params.toString() ? `?${params.toString()}` : "";

    Promise.all([
      apiFetch<{ tasks: MaintenanceTaskRow[] }>(`/maintenance${q}`),
      apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms"),
      apiFetch<{ staff: StaffOption[] }>("/maintenance/assignees"),
    ])
      .then(([tasksRes, roomsRes, staffRes]) => {
        if (!cancelled) {
          setTasks(tasksRes.tasks);
          setClassrooms(roomsRes.classrooms);
          setClassroomId((prev) => prev || roomsRes.classrooms[0]?.id || "");
          setStaff(staffRes.staff);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load maintenance tasks");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, statusFilter, priorityFilter]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch("/maintenance", {
        method: "POST",
        body: JSON.stringify({
          classroomId,
          title,
          description,
          priority,
          assignedTo: assignedTo || null,
          dueDate: dueDate || null,
        }),
      });
      setShowModal(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      setSuccessMsg("Maintenance task created.");
      await loadTasks();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, nextStatus: MaintenanceStatus) => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/maintenance/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccessMsg(`Task updated to ${nextStatus}.`);
      await loadTasks();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "FACILITY_MANAGER"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Maintenance Tracking</h1>
            <p className="mt-1 text-sm text-slate-600">
              Assign facility work orders, track progress, and maintain resolution history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Task
          </button>
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

        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Classroom &amp; Task</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Due / Completed</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Loading maintenance tasks...
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No maintenance tasks found.
                    </td>
                  </tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[11px] font-bold text-indigo-700">
                          {t.classroom.roomCode}
                        </p>
                        <p className="font-semibold text-slate-900">{t.title}</p>
                        <p className="mt-0.5 text-slate-500">{t.description}</p>
                        {t.finding && (
                          <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            Linked to {t.finding.sourceType} finding
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-semibold ${
                            t.priority === "CRITICAL"
                              ? "bg-rose-100 text-rose-800"
                              : t.priority === "HIGH"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.assignee ? t.assignee.fullName : "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {t.completedAt
                          ? `Done: ${new Date(t.completedAt).toLocaleDateString()}`
                          : t.dueDate
                          ? `Due: ${new Date(t.dueDate).toLocaleDateString()}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={t.status}
                          onChange={(e) =>
                            handleStatusChange(t.id, e.target.value as MaintenanceStatus)
                          }
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Create Maintenance Task</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="mt-4 space-y-3.5">
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
                      {c.roomCode} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Replace projector HDMI cable"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Assign To</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {staff.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {submitting ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
