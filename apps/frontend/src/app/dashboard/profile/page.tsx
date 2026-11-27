"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatRoleLabel } from "@/lib/api";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const fullName = fullNameDraft ?? user?.fullName ?? "";
  const phone = phoneDraft ?? user?.studentProfile?.phone ?? user?.instructorProfile?.phone ?? "";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");
    setSaving(true);
    try {
      const res = await apiFetch<{ message: string }>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName,
          phone: phone || undefined,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      await refreshUser();
      setFullNameDraft(null);
      setPhoneDraft(null);
      setStatusMsg(res.message);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      {user && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage your personal details and account password.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {statusMsg && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Assigned Role</label>
                  <input
                    type="text"
                    disabled
                    value={formatRoleLabel(user.role)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                  />
                </div>
              </div>

              {user.studentProfile && (
                <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Student ID</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                      {user.studentProfile.studentCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Course / Batch</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {user.studentProfile.courseBatch}
                    </p>
                  </div>
                </div>
              )}

              {user.instructorProfile && (
                <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Employee Code</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                      {user.instructorProfile.employeeCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Department</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {user.instructorProfile.department || "—"}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullNameDraft(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              {(user.studentProfile || user.instructorProfile) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="9876543210"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Change Password (Optional)
                </h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Required only if changing"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
