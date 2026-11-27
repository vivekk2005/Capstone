"use client";

import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, Search, AlertCircle, CheckCircle2, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { AdminUserRow, apiFetch, formatRoleLabel, UserRole } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("INSTRUCTOR");
  const [newBatch, setNewBatch] = useState("BTECH-CSE-2027");
  const [newDept, setNewDept] = useState("Computer Science & Engineering");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set("role", roleFilter);
      if (search.trim()) params.set("search", search.trim());
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<{ users: AdminUserRow[] }>(`/users${query}`);
      setUsers(data.users);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (roleFilter) params.set("role", roleFilter);
    if (search.trim()) params.set("search", search.trim());
    const query = params.toString() ? `?${params.toString()}` : "";

    apiFetch<{ users: AdminUserRow[] }>(`/users${query}`)
      .then((data) => {
        if (!cancelled) {
          setUsers(data.users);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load users");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, roleFilter, search]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          fullName: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          ...(newRole === "STUDENT" ? { courseBatch: newBatch } : {}),
          ...(newRole === "INSTRUCTOR" ? { department: newDept } : {}),
        }),
      });
      setShowCreateModal(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setSuccessMsg("User account created successfully.");
      await loadUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (target: AdminUserRow) => {
    const actionLabel = target.isActive ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${target.fullName}?`)) {
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !target.isActive }),
      });
      setSuccessMsg(`Account ${target.isActive ? "deactivated" : "activated"} successfully.`);
      await loadUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  const handleRoleChange = async (target: AdminUserRow, nextRole: UserRole) => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      setSuccessMsg(`Updated role for ${target.fullName} to ${formatRoleLabel(nextRole)}.`);
      await loadUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to change role");
    }
  };

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User &amp; Role Management</h1>
            <p className="mt-1 text-sm text-slate-600">
              Provision staff and student accounts and enforce role-based access rules.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <UserPlus className="h-4 w-4" />
            Add User
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

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="">All Roles</option>
            <option value="ADMIN">Administrator</option>
            <option value="INSTRUCTOR">Instructor</option>
            <option value="FACILITY_MANAGER">Facility Manager</option>
            <option value="STUDENT">Student</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Linked Profile</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      No matching users found.
                    </td>
                  </tr>
                ) : (
                  users.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{row.fullName}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={row.role}
                          disabled={row.id === currentUser?.id}
                          onChange={(e) => handleRoleChange(row, e.target.value as UserRole)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 disabled:bg-slate-100"
                        >
                          <option value="ADMIN">Administrator</option>
                          <option value="INSTRUCTOR">Instructor</option>
                          <option value="FACILITY_MANAGER">Facility Manager</option>
                          <option value="STUDENT">Student</option>
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {row.studentProfile
                          ? `${row.studentProfile.studentCode} (${row.studentProfile.courseBatch})`
                          : row.instructorProfile
                          ? `${row.instructorProfile.employeeCode} (${row.instructorProfile.department || "Staff"})`
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            row.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={row.id === currentUser?.id}
                          onClick={() => handleToggleActive(row)}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {row.isActive ? "Disable" : "Activate"}
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
              <h2 className="text-lg font-bold text-slate-900">Create New Account</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="ADMIN">Administrator</option>
                  <option value="INSTRUCTOR">Instructor</option>
                  <option value="FACILITY_MANAGER">Facility Manager</option>
                  <option value="STUDENT">Student</option>
                </select>
              </div>

              {newRole === "STUDENT" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Course / Batch</label>
                  <input
                    type="text"
                    value={newBatch}
                    onChange={(e) => setNewBatch(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {newRole === "INSTRUCTOR" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Department</label>
                  <input
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Temporary Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
