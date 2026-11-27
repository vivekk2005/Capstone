"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch, AuditLogRow, formatRoleLabel } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    apiFetch<{ logs: AuditLogRow[] }>("/users/audit-logs")
      .then((data) => setLogs(data.logs))
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : "Failed to load logs"))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Security Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Traceable record of logins, account provisioning, role updates, and password changes.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Actor</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Entity</th>
                  <th className="px-5 py-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Loading audit records...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      No audit logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        {log.actor ? (
                          <div>
                            <p className="font-medium text-slate-900">{log.actor.fullName}</p>
                            <p className="text-xs text-slate-500">
                              {formatRoleLabel(log.actor.role)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">System / Anonymous</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-800">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">{log.entityType}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">
                        {log.detailsJson ? JSON.stringify(log.detailsJson) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
