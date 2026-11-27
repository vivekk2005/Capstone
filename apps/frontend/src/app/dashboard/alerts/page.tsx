"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bell, Bot, UserCheck, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface NotificationRow {
  id: string;
  sourceCategory: "AI_ESTIMATE_ALERT" | "HUMAN_CONFIRMED_ISSUE" | "OPERATIONAL_SYSTEM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  isRead: boolean;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  classroom: { roomCode: string; name: string } | null;
  resolver: { fullName: string } | null;
}

export default function AlertsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [category, setCategory] = useState("");
  const [resolvedFilter, setResolvedFilter] = useState("false");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (resolvedFilter) params.set("resolved", resolvedFilter);
      const q = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<{ notifications: NotificationRow[] }>(`/notifications${q}`);
      setNotifications(data.notifications);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [category, resolvedFilter]);

  useEffect(() => {
    if (!user || !["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR"].includes(user.role)) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (resolvedFilter) params.set("resolved", resolvedFilter);
    const q = params.toString() ? `?${params.toString()}` : "";

    apiFetch<{ notifications: NotificationRow[] }>(`/notifications${q}`)
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.notifications);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load alerts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, category, resolvedFilter]);

  const handleResolve = async (id: string) => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/notifications/${id}/resolve`, { method: "PATCH" });
      setSuccessMsg("Alert marked as resolved.");
      await loadAlerts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to resolve alert");
    }
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "FACILITY_MANAGER", "INSTRUCTOR"]}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alerts &amp; Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">
            AI-generated observation alerts are explicitly separated from human-confirmed
            compliance issues.
          </p>
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
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            <option value="AI_ESTIMATE_ALERT">AI Estimate Alerts (Unconfirmed)</option>
            <option value="HUMAN_CONFIRMED_ISSUE">Human-Confirmed Issues</option>
            <option value="OPERATIONAL_SYSTEM">Operational / Maintenance</option>
          </select>

          <select
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="false">Open Alerts</option>
            <option value="true">Resolved Alerts</option>
            <option value="">All Alerts</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading alerts...
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            <Bell className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2">No alerts in this view.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        n.sourceCategory === "AI_ESTIMATE_ALERT"
                          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20"
                          : n.sourceCategory === "HUMAN_CONFIRMED_ISSUE"
                          ? "bg-rose-50 text-rose-800 ring-1 ring-rose-600/20"
                          : "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-600/20"
                      }`}
                    >
                      {n.sourceCategory === "AI_ESTIMATE_ALERT" ? (
                        <>
                          <Bot className="h-3 w-3" />
                          AI Estimate Alert
                        </>
                      ) : n.sourceCategory === "HUMAN_CONFIRMED_ISSUE" ? (
                        <>
                          <UserCheck className="h-3 w-3" />
                          Human-Confirmed Issue
                        </>
                      ) : (
                        <>
                          <Settings2 className="h-3 w-3" />
                          Operational Event
                        </>
                      )}
                    </span>
                    {n.classroom && (
                      <span className="font-mono text-xs font-semibold text-slate-600">
                        {n.classroom.roomCode}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">{n.title}</h2>
                  <p className="text-xs text-slate-600">{n.message}</p>
                  {n.isResolved && n.resolver && (
                    <p className="text-[11px] text-emerald-700">
                      Resolved by {n.resolver.fullName} on{" "}
                      {n.resolvedAt ? new Date(n.resolvedAt).toLocaleString() : ""}
                    </p>
                  )}
                </div>

                {!n.isResolved && (
                  <button
                    type="button"
                    onClick={() => handleResolve(n.id)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Resolve Alert
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
