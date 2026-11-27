"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ScanEye,
  Upload,
  AlertCircle,
  CheckCircle2,
  Cpu,
  AlertTriangle,
  Info,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface EquipmentItem {
  id: string;
  itemType: string;
  label: string;
  expectedQuantity: number;
}

interface ClassroomOption {
  id: string;
  roomCode: string;
  name: string;
  maxCapacity: number;
  equipment: EquipmentItem[];
}

interface DetectionBox {
  category: "PERSON_COUNT" | "OBJECT_DETECTION";
  detected_class: string;
  raw_label: string;
  confidence: number;
  bbox: number[];
  frame_index: number;
}

interface AnalyzeResponse {
  message: string;
  jobId: string;
  mediaId: string;
  result: {
    media_type: "IMAGE" | "VIDEO";
    image_width: number;
    image_height: number;
    frames_analyzed: number;
    people_count: number;
    peak_people_count: number;
    equipment_counts: Record<string, number>;
    detections: DetectionBox[];
    supported_classes: string[];
    model_name: string;
    model_version: string;
    confidence_threshold: number;
    processing_ms: number;
  };
  capacityComparison: {
    approvedCapacity: number;
    estimatedOccupancy: number;
    capacityStatus: string | null;
  };
}

interface AiJobRow {
  id: string;
  taskType: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  modelName: string | null;
  modelVersion: string | null;
  confidenceThreshold: number | null;
  errorMessage: string | null;
  createdAt: string;
  media: {
    id: string;
    originalFilename: string;
    mediaType: "IMAGE" | "VIDEO";
    classroom: {
      id: string;
      roomCode: string;
      name: string;
      maxCapacity: number;
    };
  };
  detectionResults: {
    id: string;
    detectionCategory: "PERSON_COUNT" | "OBJECT_DETECTION";
    detectedClass: string;
    estimatedCount: number;
    confidence: number | null;
    bboxJson: {
      bbox?: number[];
      rawLabel?: string;
      imageWidth?: number;
      imageHeight?: number;
      framesAnalyzed?: number;
    } | null;
    capacityStatus: string | null;
  }[];
}

export default function AiMonitoringPage() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [taskType, setTaskType] = useState<"COMBINED" | "OCCUPANCY" | "EQUIPMENT_DETECTION">(
    "COMBINED"
  );
  const [threshold, setThreshold] = useState(0.35);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [serviceStatus, setServiceStatus] = useState<{
    reachable: boolean;
    supportedClasses: string[];
    error?: string;
  } | null>(null);

  const [jobs, setJobs] = useState<AiJobRow[]>([]);
  const [activePreview, setActivePreview] = useState<{
    mediaId: string;
    mediaType: "IMAGE" | "VIDEO";
    imageWidth: number;
    imageHeight: number;
    detections: DetectionBox[];
    peopleCount: number;
    approvedCapacity: number;
    capacityStatus: string | null;
    equipmentCounts: Record<string, number>;
    supportedClasses: string[];
    roomEquipment: EquipmentItem[];
    roomCode: string;
    modelLabel: string;
    processingMs?: number;
  } | null>(null);

  const [previewState, setPreviewState] = useState<{ mediaId: string; url: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const previewUrl =
    activePreview?.mediaType === "IMAGE" && previewState?.mediaId === activePreview.mediaId
      ? previewState.url
      : null;

  const loadInitial = useCallback(async () => {
    try {
      const [roomsRes, jobsRes, statusRes] = await Promise.all([
        apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms"),
        apiFetch<{ jobs: AiJobRow[] }>("/ai/jobs"),
        apiFetch<{
          reachable: boolean;
          details?: { supported_classes?: string[] };
          error?: string;
        }>("/ai/service-status"),
      ]);
      setClassrooms(roomsRes.classrooms);
      if (roomsRes.classrooms[0] && !selectedRoomId) {
        setSelectedRoomId(roomsRes.classrooms[0].id);
      }
      setJobs(jobsRes.jobs);
      setServiceStatus({
        reachable: statusRes.reachable,
        supportedClasses: statusRes.details?.supported_classes || ["PERSON", "COMPUTER", "MONITOR"],
        error: statusRes.error,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to initialize AI dashboard");
    }
  }, [selectedRoomId]);

  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "FACILITY_MANAGER")) return;
    let cancelled = false;

    Promise.all([
      apiFetch<{ classrooms: ClassroomOption[] }>("/classrooms"),
      apiFetch<{ jobs: AiJobRow[] }>("/ai/jobs"),
      apiFetch<{
        reachable: boolean;
        details?: { supported_classes?: string[] };
        error?: string;
      }>("/ai/service-status"),
    ])
      .then(([roomsRes, jobsRes, statusRes]) => {
        if (!cancelled) {
          setClassrooms(roomsRes.classrooms);
          setSelectedRoomId((prev) => prev || roomsRes.classrooms[0]?.id || "");
          setJobs(jobsRes.jobs);
          setServiceStatus({
            reachable: statusRes.reachable,
            supportedClasses: statusRes.details?.supported_classes || [
              "PERSON",
              "COMPUTER",
              "MONITOR",
            ],
            error: statusRes.error,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to initialize AI dashboard");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!activePreview || activePreview.mediaType !== "IMAGE") return;
    let cancelled = false;
    let revokeTarget: string | null = null;
    const mediaId = activePreview.mediaId;

    fetch(`${API_BASE_URL}/media/${mediaId}/file`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Image load failed"))))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revokeTarget = url;
        setPreviewState({ mediaId, url });
      })
      .catch(() => {
        if (!cancelled) setPreviewState(null);
      });

    return () => {
      cancelled = true;
      if (revokeTarget) URL.revokeObjectURL(revokeTarget);
    };
  }, [activePreview]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !selectedFile) {
      setErrorMsg("Please select a classroom and choose an image or short video file.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("classroomId", selectedRoomId);
      formData.append("taskType", taskType);
      formData.append("confidenceThreshold", String(threshold));

      const res = await apiFetch<AnalyzeResponse>("/ai/analyze", {
        method: "POST",
        body: formData,
      });

      const room = classrooms.find((c) => c.id === selectedRoomId);
      setSuccessMsg(res.message);
      setActivePreview({
        mediaId: res.mediaId,
        mediaType: res.result.media_type,
        imageWidth: res.result.image_width,
        imageHeight: res.result.image_height,
        detections: res.result.detections,
        peopleCount: res.result.people_count,
        approvedCapacity: res.capacityComparison.approvedCapacity,
        capacityStatus: res.capacityComparison.capacityStatus,
        equipmentCounts: res.result.equipment_counts,
        supportedClasses: res.result.supported_classes,
        roomEquipment: room?.equipment || [],
        roomCode: room?.roomCode || "",
        modelLabel: `${res.result.model_name} (${res.result.model_version})`,
        processingMs: res.result.processing_ms,
      });
      await loadInitial();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI analysis failed");
      await loadInitial();
    } finally {
      setSubmitting(false);
    }
  };

  const inspectSavedJob = (job: AiJobRow) => {
    if (job.status !== "COMPLETED") return;
    const occ = job.detectionResults.find(
      (d) => d.detectionCategory === "PERSON_COUNT" && !d.bboxJson?.bbox
    );
    const boxRows = job.detectionResults.filter((d) => Array.isArray(d.bboxJson?.bbox));
    const room = classrooms.find((c) => c.id === job.media.classroom.id);

    const eqCounts: Record<string, number> = {};
    const detections: DetectionBox[] = boxRows.map((r) => {
      if (r.detectionCategory === "OBJECT_DETECTION") {
        eqCounts[r.detectedClass] = (eqCounts[r.detectedClass] || 0) + 1;
      }
      return {
        category: r.detectionCategory,
        detected_class: r.detectedClass,
        raw_label: r.bboxJson?.rawLabel || r.detectedClass.toLowerCase(),
        confidence: r.confidence || 0,
        bbox: r.bboxJson?.bbox || [0, 0, 0, 0],
        frame_index: 0,
      };
    });

    const firstWithDims = job.detectionResults.find((d) => d.bboxJson?.imageWidth);
    setActivePreview({
      mediaId: job.media.id,
      mediaType: job.media.mediaType,
      imageWidth: firstWithDims?.bboxJson?.imageWidth || 640,
      imageHeight: firstWithDims?.bboxJson?.imageHeight || 480,
      detections,
      peopleCount: occ ? occ.estimatedCount : detections.filter((d) => d.detected_class === "PERSON").length,
      approvedCapacity: job.media.classroom.maxCapacity,
      capacityStatus: occ?.capacityStatus || null,
      equipmentCounts: eqCounts,
      supportedClasses: serviceStatus?.supportedClasses || ["PERSON", "COMPUTER", "MONITOR"],
      roomEquipment: room?.equipment || [],
      roomCode: job.media.classroom.roomCode,
      modelLabel: `${job.modelName || "YOLO"} (${job.modelVersion || "base"})`,
    });
  };

  return (
    <DashboardShell allowedRoles={["ADMIN", "FACILITY_MANAGER"]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              AI Occupancy &amp; Equipment Monitoring
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Upload classroom images or short video clips for computer vision estimates.
            </p>
          </div>
          {serviceStatus && (
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                serviceStatus.reachable
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
              }`}
            >
              <Cpu className="h-4 w-4" />
              {serviceStatus.reachable
                ? `AI Service Online (${serviceStatus.supportedClasses.join(", ")})`
                : "AI Service Offline (Core App Safe)"}
            </div>
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

        <div className="grid gap-6 lg:grid-cols-5">
          <form
            onSubmit={handleAnalyze}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
          >
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Upload className="h-5 w-5 text-indigo-600" />
              Upload Media for AI Analysis
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-700">Classroom</label>
              <select
                required
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.roomCode} — {c.name} (Cap: {c.maxCapacity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">AI Task Type</label>
              <select
                value={taskType}
                onChange={(e) =>
                  setTaskType(e.target.value as "COMBINED" | "OCCUPANCY" | "EQUIPMENT_DETECTION")
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="COMBINED">Combined (Occupancy + Equipment)</option>
                <option value="OCCUPANCY">People Counting / Occupancy Only</option>
                <option value="EQUIPMENT_DETECTION">Equipment &amp; Safety Objects Only</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700">
                <span>Confidence Threshold</span>
                <span className="font-mono">{threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={0.8}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="mt-1.5 w-full accent-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Image or Short Video (JPG, PNG, WEBP, MP4, WEBM — max 25 MB)
              </label>
              <input
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? "Running YOLO Inference..." : "Run AI Analysis"}
            </button>

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[11px] text-amber-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span>
                AI outputs are stored strictly as estimates for staff review. Pretrained COCO
                weights detect People, Computers, and Monitors; Projectors and Fire Extinguishers
                require custom weights or human inspection.
              </span>
            </div>
          </form>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <ScanEye className="h-5 w-5 text-indigo-600" />
                Detection Evidence &amp; Inventory Comparison
              </h2>
              {activePreview?.processingMs && (
                <span className="font-mono text-xs text-slate-500">
                  {activePreview.processingMs} ms
                </span>
              )}
            </div>

            {!activePreview ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                Upload an image/video or click &quot;Inspect&quot; on a completed AI job below to
                view bounding boxes, occupancy estimates, and inventory comparisons.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      AI Estimated Occupancy ({activePreview.roomCode})
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {activePreview.peopleCount}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        / {activePreview.approvedCapacity} approved seats
                      </span>
                    </p>
                    {activePreview.capacityStatus && (
                      <p
                        className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold ${
                          activePreview.capacityStatus.includes("OVERCROWDING")
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {activePreview.capacityStatus.includes("OVERCROWDING") ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Possible overcrowding. Staff review required.
                          </>
                        ) : (
                          "Within estimated capacity"
                        )}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Detected Equipment Summary
                    </p>
                    {Object.keys(activePreview.equipmentCounts).length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">
                        No target equipment classes detected in this view.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(activePreview.equipmentCounts).map(([cls, count]) => (
                          <span
                            key={cls}
                            className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-xs ring-1 ring-slate-200"
                          >
                            {cls}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-slate-400">{activePreview.modelLabel}</p>
                  </div>
                </div>

                {activePreview.mediaType === "IMAGE" && previewUrl && (
                  <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                    {/* Authenticated blob object URL requires native <img> for SVG bounding box overlay */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Analyzed classroom frame"
                      className="block h-auto w-full"
                    />
                    <svg
                      viewBox={`0 0 ${activePreview.imageWidth} ${activePreview.imageHeight}`}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      preserveAspectRatio="none"
                    >
                      {activePreview.detections.map((d, idx) => {
                        const [x1, y1, x2, y2] = d.bbox;
                        const color = d.detected_class === "PERSON" ? "#10b981" : "#6366f1";
                        return (
                          <g key={`${d.detected_class}-${idx}`}>
                            <rect
                              x={x1}
                              y={y1}
                              width={Math.max(1, x2 - x1)}
                              height={Math.max(1, y2 - y1)}
                              fill="none"
                              stroke={color}
                              strokeWidth={Math.max(2, activePreview.imageWidth / 320)}
                            />
                            <text
                              x={x1 + 4}
                              y={Math.max(16, y1 + 16)}
                              fill={color}
                              fontSize={Math.max(12, activePreview.imageWidth / 45)}
                              fontWeight="bold"
                            >
                              {`${d.detected_class} ${(d.confidence * 100).toFixed(0)}%`}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}

                {activePreview.roomEquipment.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Expected Item</th>
                          <th className="px-3 py-2">Inventory Qty</th>
                          <th className="px-3 py-2">AI Observed</th>
                          <th className="px-3 py-2">Review Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activePreview.roomEquipment.map((item) => {
                          const supported = activePreview.supportedClasses.includes(item.itemType);
                          const observed = activePreview.equipmentCounts[item.itemType] || 0;
                          return (
                            <tr key={item.id}>
                              <td className="px-3 py-2 font-medium text-slate-900">{item.label}</td>
                              <td className="px-3 py-2 font-mono">{item.expectedQuantity}</td>
                              <td className="px-3 py-2 font-mono">
                                {supported ? observed : "Unsupported class"}
                              </td>
                              <td className="px-3 py-2">
                                {!supported ? (
                                  <span className="text-slate-500">Manual check required</span>
                                ) : observed >= item.expectedQuantity ? (
                                  <span className="font-semibold text-emerald-700">
                                    Observed count matches
                                  </span>
                                ) : (
                                  <span className="font-semibold text-amber-700">
                                    Needs staff review (not automatic fault)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Recent AI Processing Jobs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Classroom</th>
                  <th className="px-4 py-3">File &amp; Task</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3 text-right">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No AI jobs executed yet.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => {
                    const occ = job.detectionResults.find(
                      (d) => d.detectionCategory === "PERSON_COUNT" && !d.bboxJson?.bbox
                    );
                    return (
                      <tr key={job.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(job.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {job.media.classroom.roomCode}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{job.media.originalFilename}</p>
                          <p className="text-[11px] text-slate-500">
                            {job.media.mediaType} · {job.taskType}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              job.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-700"
                                : job.status === "FAILED"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {job.status === "FAILED"
                            ? job.errorMessage || "Failed"
                            : occ
                            ? `Est. ${occ.estimatedCount} people`
                            : `${job.detectionResults.length} detection(s)`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {job.status === "COMPLETED" && (
                            <button
                              type="button"
                              onClick={() => inspectSavedJob(job)}
                              className="rounded border border-slate-200 px-2.5 py-1 font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                              Inspect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
