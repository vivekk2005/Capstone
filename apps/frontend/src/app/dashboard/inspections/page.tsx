"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ClipboardCheck,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  Bot,
  UserCheck,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface ClassroomOption {
  id: string;
  roomCode: string;
  name: string;
}

interface InspectionRow {
  id: string;
  inspectionDate: string;
  cleanlinessRating: string;
  buildingCondition: string;
  equipmentCondition: string;
  overallStatus: string;
  notes: string | null;
  classroom: { id: string; roomCode: string; name: string; building: string };
  inspector: { fullName: string };
  _count: { findings: number };
}

interface FindingRow {
  id: string;
  sourceType: "AI_ESTIMATE" | "MANUAL_INSPECTION";
  reviewStatus: "PENDING_REVIEW" | "CONFIRMED" | "REJECTED" | "RECHECK_REQUESTED";
  severity: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  classroom: { id: string; roomCode: string; name: string };
  reviewer: { fullName: string } | null;
  aiDetection: {
    detectedClass: string;
    estimatedCount: number;
    confidence: number | null;
  } | null;
  _count: { maintenanceTasks: number };
}

export default function InspectionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"findings" | "inspections">("findings");
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [classroomId, setClassroomId] = useState("");
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cleanlinessRating, setCleanlinessRating] = useState("GOOD");
  const [buildingCondition, setBuildingCondition] = useState("GOOD");
  const [equipmentCondition, setEquipmentCondition] = useState("ALL_PRESENT_WORKING");
  const [overallStatus, setOverallStatus] = useState("PASS");
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<FindingRow | null>(null);
  const [decision, setDecision] = useState<"CONFIRMED" | "REJECTED" | "RECHECK_REQUESTED">(
    "CONFIRMED"
  );
  const [reviewNotes, setReviewNotes] = useState("");
  const [createTask, setCreateTask] = useState(true);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">(
    "MEDIUM"
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const fParams = new URLSearchParams();
      if (statusFilter) fParams.set("status", statusFilter);
      if (sourceFilter) fParams.set("source", sourceFilter);
      const fq = fParams.toString() ? `?${fParams.toString()}` : "";

      const [roomsRes, inspRes, findRes] = await Promise.all([
        apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms"),
        apiFetch<{ inspections: InspectionRow[] }>("/inspections"),
        apiFetch<{ findings: FindingRow[] }>(`/inspections/findings${fq}`),
      ]);

      setClassrooms(roomsRes.classrooms);
      if (roomsRes.classrooms[0] && !classroomId) setClassroomId(roomsRes.classrooms[0].id);
      setInspections(inspRes.inspections);
      setFindings(findRes.findings);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load inspection data");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, classroomId]);

  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "FACILITY_MANAGER")) return;
    let cancelled = false;
    const fParams = new URLSearchParams();
    if (statusFilter) fParams.set("status", statusFilter);
    if (sourceFilter) fParams.set("source", sourceFilter);
    const fq = fParams.toString() ? `?${fParams.toString()}` : "";

    Promise.all([
      apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms"),
      apiFetch<{ inspections: InspectionRow[] }>("/inspections"),
      apiFetch<{ findings: FindingRow[] }>(`/inspections/findings${fq}`),
    ])
      .then(([roomsRes, inspRes, findRes]) => {
        if (!cancelled) {
          setClassrooms(roomsRes.classrooms);
          setClassroomId((prev) => prev || roomsRes.classrooms[0]?.id || "");
          setInspections(inspRes.inspections);
          setFindings(findRes.findings);
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load inspection data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, statusFilter, sourceFilter]);

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const fd = new FormData();
      fd.append("classroomId", classroomId);
      fd.append("inspectionDate", inspectionDate);
      fd.append("cleanlinessRating", cleanlinessRating);
      fd.append("buildingCondition", buildingCondition);
      fd.append("equipmentCondition", equipmentCondition);
      fd.append("overallStatus", overallStatus);
      if (notes.trim()) fd.append("notes", notes.trim());
      if (attachment) fd.append("file", attachment);

      await apiFetch("/inspections", { method: "POST", body: fd });
      setShowCreateModal(false);
      setNotes("");
      setAttachment(null);
      setSuccessMsg("Inspection recorded successfully.");
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save inspection");
    } finally {
      setSubmitting(false);
    }
  };

  const openReviewModal = (f: FindingRow) => {
    setReviewTarget(f);
    setDecision("CONFIRMED");
    setReviewNotes("");
    setCreateTask(true);
    setTaskTitle(`Follow-up: ${f.classroom.roomCode}`);
    setTaskPriority(f.severity === "HIGH" ? "HIGH" : "MEDIUM");
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await apiFetch<{ message: string; maintenanceTask: { id: string } | null }>(
        `/inspections/findings/${reviewTarget.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reviewNotes: reviewNotes || undefined,
            createMaintenanceTask: decision === "CONFIRMED" && createTask,
            taskTitle: decision === "CONFIRMED" && createTask ? taskTitle : undefined,
            taskPriority: decision === "CONFIRMED" && createTask ? taskPriority : undefined,
          }),
        }
      );
      setReviewTarget(null);
      setSuccessMsg(
        res.maintenanceTask
          ? `${res.message} Maintenance task created automatically.`
          : res.message
      );
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "FACILITY_MANAGER"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Infrastructure Inspections &amp; Finding Review
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Confirm or reject AI observations and record physical room, cleanliness, and safety
              inspections.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Inspection
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("findings")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                tab === "findings"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Findings Review Queue ({findings.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("inspections")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                tab === "inspections"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Inspection Logs ({inspections.length})
            </button>
          </div>

          {tab === "findings" && (
            <div className="flex gap-2">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              >
                <option value="">All Sources</option>
                <option value="AI_ESTIMATE">AI Estimates Only</option>
                <option value="MANUAL_INSPECTION">Manual Inspections Only</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              >
                <option value="">All Review Statuses</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
                <option value="RECHECK_REQUESTED">Recheck Requested</option>
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading inspection records...
          </div>
        ) : tab === "findings" ? (
          <div className="space-y-3">
            {findings.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No findings match the selected filter.
              </div>
            ) : (
              findings.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-700">
                        {f.classroom.roomCode}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          f.sourceType === "AI_ESTIMATE"
                            ? "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20"
                            : "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-600/20"
                        }`}
                      >
                        {f.sourceType === "AI_ESTIMATE" ? (
                          <>
                            <Bot className="h-3 w-3" />
                            AI Estimate (Unverified)
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3 w-3" />
                            Staff Inspection
                          </>
                        )}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          f.reviewStatus === "CONFIRMED"
                            ? "bg-rose-50 text-rose-700"
                            : f.reviewStatus === "REJECTED"
                            ? "bg-slate-100 text-slate-600"
                            : f.reviewStatus === "RECHECK_REQUESTED"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {f.reviewStatus}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{f.summary}</p>
                    {f.reviewer && (
                      <p className="text-xs text-slate-500">
                        Reviewed by <strong>{f.reviewer.fullName}</strong> on{" "}
                        {f.reviewedAt ? new Date(f.reviewedAt).toLocaleString() : ""}
                        {f.reviewNotes ? ` — "${f.reviewNotes}"` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openReviewModal(f)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600" />
                      {f.reviewStatus === "PENDING_REVIEW" ? "Review Finding" : "Update Review"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Classroom</th>
                    <th className="px-4 py-3">Cleanliness / Building</th>
                    <th className="px-4 py-3">Equipment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Inspector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {inspections.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No manual inspections recorded yet.
                      </td>
                    </tr>
                  ) : (
                    inspections.map((ins) => (
                      <tr key={ins.id}>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(ins.inspectionDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {ins.classroom.roomCode}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {ins.cleanlinessRating} / {ins.buildingCondition}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{ins.equipmentCondition}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              ins.overallStatus === "PASS"
                                ? "bg-emerald-50 text-emerald-700"
                                : ins.overallStatus === "ACTION_REQUIRED"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {ins.overallStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{ins.inspector.fullName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New Classroom Inspection</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateInspection} className="mt-4 space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
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
                  <label className="block text-xs font-medium text-slate-700">
                    Inspection Date
                  </label>
                  <input
                    type="date"
                    required
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Cleanliness</label>
                  <select
                    value={cleanlinessRating}
                    onChange={(e) => setCleanlinessRating(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="GOOD">Good</option>
                    <option value="NEEDS_ATTENTION">Needs Attention</option>
                    <option value="POOR">Poor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Building Condition
                  </label>
                  <select
                    value={buildingCondition}
                    onChange={(e) => setBuildingCondition(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="GOOD">Good</option>
                    <option value="MINOR_DAMAGE">Minor Damage</option>
                    <option value="NEEDS_REPAIR">Needs Repair</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Equipment Condition
                  </label>
                  <select
                    value={equipmentCondition}
                    onChange={(e) => setEquipmentCondition(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="ALL_PRESENT_WORKING">All Present &amp; Working</option>
                    <option value="NEEDS_REVIEW">Needs Review</option>
                    <option value="FAULT_REPORTED">Fault Reported</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Overall Status</label>
                  <select
                    value={overallStatus}
                    onChange={(e) => setOverallStatus(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="PASS">Pass</option>
                    <option value="ACTION_REQUIRED">Action Required</option>
                    <option value="PENDING_REVIEW">Pending Review</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Attach Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations on cleanliness, fire extinguisher service tag, seating, etc."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {submitting ? "Saving..." : "Save Inspection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Human Review Decision</h2>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {reviewTarget.summary}
            </p>
            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700">Decision</label>
                <select
                  value={decision}
                  onChange={(e) =>
                    setDecision(
                      e.target.value as "CONFIRMED" | "REJECTED" | "RECHECK_REQUESTED"
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="CONFIRMED">Confirm as Real Issue</option>
                  <option value="REJECTED">Reject (False Alarm / Occluded)</option>
                  <option value="RECHECK_REQUESTED">Request New Check</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Review Notes</label>
                <textarea
                  rows={2}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Reason for confirmation or rejection..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {decision === "CONFIRMED" && (
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={createTask}
                      onChange={(e) => setCreateTask(e.target.checked)}
                    />
                    Also create a Maintenance Task
                  </label>
                  {createTask && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Task title"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <select
                        value={taskPriority}
                        onChange={(e) =>
                          setTaskPriority(
                            e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="LOW">Low Priority</option>
                        <option value="MEDIUM">Medium Priority</option>
                        <option value="HIGH">High Priority</option>
                        <option value="CRITICAL">Critical Priority</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {submitting ? "Saving..." : "Submit Decision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
