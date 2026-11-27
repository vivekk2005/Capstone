"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Eye, Pencil, AlertCircle, CheckCircle2, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface InstructorRow {
  id: string;
  employeeCode: string;
  department: string | null;
  phone: string | null;
  specialization: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
  };
  _count: {
    sessions: number;
  };
}

interface InstructorDetail extends InstructorRow {
  sessions: {
    id: string;
    title: string;
    courseBatch: string;
    startTime: string;
    status: string;
    classroom: { roomCode: string; name: string; maxCapacity: number };
    _count: { enrollments: number; attendance: number };
  }[];
}

export default function InstructorsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Instructor@1234");
  const [department, setDepartment] = useState("Computer Science & Engineering");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<InstructorDetail | null>(null);

  const loadInstructors = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const data = await apiFetch<{ instructors: InstructorRow[] }>(`/instructors${q}`);
      setInstructors(data.instructors);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load instructors");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!user || !["ADMIN", "INSTRUCTOR", "FACILITY_MANAGER"].includes(user.role)) return;
    let cancelled = false;
    const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";

    apiFetch<{ instructors: InstructorRow[] }>(`/instructors${q}`)
      .then((data) => {
        if (!cancelled) {
          setInstructors(data.instructors);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load instructors");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, search]);

  const openCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setFullName("");
    setEmail("");
    setPassword("Instructor@1234");
    setDepartment("Computer Science & Engineering");
    setPhone("");
    setSpecialization("");
    setIsActive(true);
  };

  const openEdit = (row: InstructorRow) => {
    setModalMode("edit");
    setEditingId(row.id);
    setFullName(row.user.fullName);
    setEmail(row.user.email);
    setDepartment(row.department || "");
    setPhone(row.phone || "");
    setSpecialization(row.specialization || "");
    setIsActive(row.user.isActive);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      if (modalMode === "create") {
        await apiFetch("/instructors", {
          method: "POST",
          body: JSON.stringify({
            fullName,
            email,
            password,
            department: department || undefined,
            phone: phone || undefined,
            specialization: specialization || undefined,
          }),
        });
        setSuccessMsg("Instructor created successfully.");
      } else if (modalMode === "edit" && editingId) {
        await apiFetch(`/instructors/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            fullName,
            department: department || null,
            phone: phone || null,
            specialization: specialization || null,
            isActive,
          }),
        });
        setSuccessMsg("Instructor updated successfully.");
      }
      setModalMode(null);
      await loadInstructors();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save instructor");
    } finally {
      setSubmitting(false);
    }
  };

  const viewDetail = async (id: string) => {
    try {
      const data = await apiFetch<{ instructor: InstructorDetail }>(`/instructors/${id}`);
      setDetail(data.instructor);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load instructor details");
    }
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "INSTRUCTOR", "FACILITY_MANAGER"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Instructor Management</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage teaching staff, assigned classes, and session attendance summaries.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Instructor
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

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, or department..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Instructor</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Sessions</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Loading instructors...
                    </td>
                  </tr>
                ) : instructors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      No instructors found.
                    </td>
                  </tr>
                ) : (
                  instructors.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-indigo-700">
                        {row.employeeCode}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{row.user.fullName}</p>
                        <p className="text-xs text-slate-500">{row.user.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <p>{row.department || "—"}</p>
                        {row.specialization && (
                          <p className="text-[11px] text-slate-400">{row.specialization}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-700">
                        {row._count.sessions} assigned
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            row.user.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {(user?.role === "ADMIN" || user?.role === "INSTRUCTOR") && (
                            <button
                              type="button"
                              onClick={() => viewDetail(row.id)}
                              title="View Assigned Sessions"
                              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              title="Edit Instructor"
                              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {modalMode === "create" ? "Add Instructor" : "Edit Instructor"}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {modalMode === "create" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Initial Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Specialization
                  </label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {modalMode === "edit" && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Account Active
                </label>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Instructor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-indigo-600">
                  {detail.employeeCode}
                </p>
                <h2 className="text-xl font-bold text-slate-900">{detail.user.fullName}</h2>
                <p className="text-sm text-slate-500">
                  {detail.user.email} · {detail.department || "No department"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800">
                Assigned Training Sessions ({detail.sessions.length})
              </h3>
              {detail.sessions.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No sessions assigned yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {detail.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{s.title}</p>
                        <p className="text-slate-500">
                          Room {s.classroom.roomCode} · Batch {s.courseBatch} ·{" "}
                          {new Date(s.startTime).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                          {s.status}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Enrolled: {s._count.enrollments} · Present: {s._count.attendance}
                        </p>
                      </div>
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
