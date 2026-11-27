"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Eye, Pencil, Trash2, AlertCircle, CheckCircle2, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface StudentRow {
  id: string;
  studentCode: string;
  phone: string | null;
  courseBatch: string;
  enrollmentDate: string;
  status: "ACTIVE" | "INACTIVE" | "GRADUATED";
  user: {
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
  };
  _count: {
    enrollments: number;
    attendance: number;
  };
}

interface StudentDetail extends StudentRow {
  enrollments: {
    id: string;
    enrolledAt: string;
    session: {
      id: string;
      title: string;
      sessionDate: string;
      status: string;
      classroom: { roomCode: string; name: string };
      instructor: { user: { fullName: string } };
    };
  }[];
  attendance: {
    id: string;
    status: string;
    markedAt: string;
    session: { id: string; title: string; sessionDate: string };
  }[];
}

export default function StudentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [phone, setPhone] = useState("");
  const [courseBatch, setCourseBatch] = useState("BTECH-CSE-2027");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "GRADUATED">("ACTIVE");
  const [password, setPassword] = useState("Student@1234");
  const [submitting, setSubmitting] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (batchFilter) params.set("batch", batchFilter);
      if (statusFilter) params.set("status", statusFilter);
      const q = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<{ students: StudentRow[]; batches: string[] }>(`/students${q}`);
      setStudents(data.students);
      setBatches(data.batches);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [search, batchFilter, statusFilter]);

  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "INSTRUCTOR")) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (batchFilter) params.set("batch", batchFilter);
    if (statusFilter) params.set("status", statusFilter);
    const q = params.toString() ? `?${params.toString()}` : "";

    apiFetch<{ students: StudentRow[]; batches: string[] }>(`/students${q}`)
      .then((data) => {
        if (!cancelled) {
          setStudents(data.students);
          setBatches(data.batches);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load students");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, search, batchFilter, statusFilter]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingId(null);
    setFullName("");
    setEmail("");
    setStudentCode("");
    setPhone("");
    setCourseBatch("BTECH-CSE-2027");
    setStatus("ACTIVE");
    setPassword("Student@1234");
  };

  const openEditModal = (row: StudentRow) => {
    setModalMode("edit");
    setEditingId(row.id);
    setFullName(row.user.fullName);
    setEmail(row.user.email);
    setStudentCode(row.studentCode);
    setPhone(row.phone || "");
    setCourseBatch(row.courseBatch);
    setStatus(row.status);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      if (modalMode === "create") {
        await apiFetch("/students", {
          method: "POST",
          body: JSON.stringify({
            fullName,
            email,
            password,
            studentCode: studentCode || undefined,
            phone: phone || undefined,
            courseBatch,
          }),
        });
        setSuccessMsg("Student registered successfully.");
      } else if (modalMode === "edit" && editingId) {
        await apiFetch(`/students/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            fullName,
            email,
            phone: phone || null,
            courseBatch,
            status,
          }),
        });
        setSuccessMsg("Student record updated.");
      }
      setModalMode(null);
      await loadStudents();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save student");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: StudentRow) => {
    if (!window.confirm(`Remove or deactivate student ${row.user.fullName} (${row.studentCode})?`)) {
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await apiFetch<{ message: string }>(`/students/${row.id}`, {
        method: "DELETE",
      });
      setSuccessMsg(res.message);
      await loadStudents();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to remove student");
    }
  };

  const viewDetails = async (id: string) => {
    try {
      const data = await apiFetch<{ student: StudentDetail }>(`/students/${id}`);
      setSelectedStudent(data.student);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load student details");
    }
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "INSTRUCTOR"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Management</h1>
            <p className="mt-1 text-sm text-slate-600">
              View student profiles, batches, session enrollments, and account statuses.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Student
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

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, Student ID, or email..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="GRADUATED">Graduated</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Student ID</th>
                  <th className="px-5 py-3.5">Name &amp; Email</th>
                  <th className="px-5 py-3.5">Course / Batch</th>
                  <th className="px-5 py-3.5">Enrollments</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Loading students...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      No students found.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-indigo-700">
                        {s.studentCode}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{s.user.fullName}</p>
                        <p className="text-xs text-slate-500">{s.user.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium text-slate-700">
                        {s.courseBatch}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {s._count.enrollments} session(s)
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            s.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700"
                              : s.status === "GRADUATED"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => viewDetails(s.id)}
                            title="View Details"
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(s)}
                                title="Edit Student"
                                className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(s)}
                                title="Deactivate / Delete"
                                className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
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
                {modalMode === "create" ? "Add New Student" : "Edit Student Record"}
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
              <div className="grid gap-3 sm:grid-cols-2">
                {modalMode === "create" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Student ID (optional)
                    </label>
                    <input
                      type="text"
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value)}
                      placeholder="Auto-generated"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}
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
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {modalMode === "edit" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Status</label>
                    <select
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as "ACTIVE" | "INACTIVE" | "GRADUATED")
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="GRADUATED">Graduated</option>
                    </select>
                  </div>
                )}
              </div>
              {modalMode === "create" && (
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
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-indigo-600">
                  {selectedStudent.studentCode}
                </p>
                <h2 className="text-xl font-bold text-slate-900">
                  {selectedStudent.user.fullName}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedStudent.user.email} · Batch: {selectedStudent.courseBatch}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Enrolled Sessions ({selectedStudent.enrollments.length})
                </h3>
                {selectedStudent.enrollments.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Not enrolled in any sessions yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedStudent.enrollments.map((en) => (
                      <div
                        key={en.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{en.session.title}</p>
                          <p className="text-slate-500">
                            Room {en.session.classroom.roomCode} ·{" "}
                            {en.session.instructor.user.fullName}
                          </p>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                          {en.session.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Attendance History ({selectedStudent.attendance.length})
                </h3>
                {selectedStudent.attendance.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No attendance marked yet.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {selectedStudent.attendance.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-800">{att.session.title}</span>
                        <span className="font-semibold text-emerald-700">{att.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
