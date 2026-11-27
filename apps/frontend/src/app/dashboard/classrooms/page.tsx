"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, Monitor, AlertCircle, CheckCircle2, X } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type ClassroomStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "INACTIVE";
type EquipmentType = "COMPUTER" | "MONITOR" | "PROJECTOR" | "FIRE_EXTINGUISHER" | "OTHER";

interface EquipmentItem {
  id: string;
  itemType: EquipmentType;
  label: string;
  expectedQuantity: number;
  notes: string | null;
}

interface ClassroomRow {
  id: string;
  roomCode: string;
  name: string;
  building: string;
  maxCapacity: number;
  status: ClassroomStatus;
  equipment: EquipmentItem[];
  detectionResults: {
    estimatedCount: number;
    capacityStatus: string | null;
    createdAt: string;
  }[];
  _count: {
    sessions: number;
    maintenanceTasks: number;
  };
}

export default function ClassroomsPage() {
  const { user } = useAuth();
  const canManageRooms = user?.role === "ADMIN" || user?.role === "FACILITY_MANAGER";
  const isAdmin = user?.role === "ADMIN";

  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [building, setBuilding] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(40);
  const [status, setStatus] = useState<ClassroomStatus>("AVAILABLE");
  const [submitting, setSubmitting] = useState(false);

  const [inventoryRoom, setInventoryRoom] = useState<ClassroomRow | null>(null);
  const [eqType, setEqType] = useState<EquipmentType>("COMPUTER");
  const [eqLabel, setEqLabel] = useState("");
  const [eqQty, setEqQty] = useState(1);

  const loadClassrooms = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const q = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<{ classrooms: ClassroomRow[] }>(`/classrooms${q}`);
      setClassrooms(data.classrooms);
      if (inventoryRoom) {
        const refreshed = data.classrooms.find((c) => c.id === inventoryRoom.id) || null;
        setInventoryRoom(refreshed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load classrooms");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, inventoryRoom]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    const q = params.toString() ? `?${params.toString()}` : "";

    apiFetch<{ classrooms: ClassroomRow[] }>(`/classrooms${q}`)
      .then((data) => {
        if (!cancelled) {
          setClassrooms(data.classrooms);
          setInventoryRoom((prev) =>
            prev ? data.classrooms.find((c) => c.id === prev.id) || null : null
          );
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to load classrooms");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, search, statusFilter]);

  const openCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setRoomCode("");
    setName("");
    setBuilding("Block 34");
    setMaxCapacity(40);
    setStatus("AVAILABLE");
  };

  const openEdit = (room: ClassroomRow) => {
    setModalMode("edit");
    setEditingId(room.id);
    setRoomCode(room.roomCode);
    setName(room.name);
    setBuilding(room.building);
    setMaxCapacity(room.maxCapacity);
    setStatus(room.status);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const payload = { roomCode, name, building, maxCapacity: Number(maxCapacity), status };
      if (modalMode === "create") {
        await apiFetch("/classrooms", { method: "POST", body: JSON.stringify(payload) });
        setSuccessMsg("Classroom created successfully.");
      } else if (modalMode === "edit" && editingId) {
        await apiFetch(`/classrooms/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setSuccessMsg("Classroom updated successfully.");
      }
      setModalMode(null);
      await loadClassrooms();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save classroom");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoom = async (room: ClassroomRow) => {
    if (!window.confirm(`Delete classroom ${room.roomCode} (${room.name})?`)) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiFetch(`/classrooms/${room.id}`, { method: "DELETE" });
      setSuccessMsg("Classroom deleted.");
      await loadClassrooms();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete classroom");
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventoryRoom) return;
    setErrorMsg("");
    try {
      await apiFetch(`/classrooms/${inventoryRoom.id}/equipment`, {
        method: "POST",
        body: JSON.stringify({
          itemType: eqType,
          label: eqLabel,
          expectedQuantity: Number(eqQty),
        }),
      });
      setEqLabel("");
      setEqQty(1);
      await loadClassrooms();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add equipment");
    }
  };

  const handleRemoveEquipment = async (equipmentId: string) => {
    if (!inventoryRoom) return;
    try {
      await apiFetch(`/classrooms/${inventoryRoom.id}/equipment/${equipmentId}`, {
        method: "DELETE",
      });
      await loadClassrooms();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to remove equipment");
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Classrooms &amp; Equipment Inventory</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage approved room capacities, equipment checklists, and occupancy estimates.
            </p>
          </div>
          {canManageRooms && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Classroom
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
              placeholder="Search by Room ID, name, or building..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="IN_USE">In Use</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading classrooms...
          </div>
        ) : classrooms.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No classrooms found.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classrooms.map((room) => {
              const latestOccupancy = room.detectionResults[0];
              return (
                <div
                  key={room.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-semibold text-indigo-700">
                          {room.roomCode}
                        </span>
                        <h2 className="mt-0.5 text-lg font-bold text-slate-900">{room.name}</h2>
                        <p className="text-xs text-slate-500">{room.building}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          room.status === "AVAILABLE"
                            ? "bg-emerald-50 text-emerald-700"
                            : room.status === "IN_USE"
                            ? "bg-indigo-50 text-indigo-700"
                            : room.status === "MAINTENANCE"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {room.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                      <div>
                        <p className="text-slate-500">Approved Capacity</p>
                        <p className="mt-0.5 text-base font-bold text-slate-900">
                          {room.maxCapacity} seats
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">AI Occupancy Est.</p>
                        <p className="mt-0.5 font-semibold text-slate-800">
                          {latestOccupancy
                            ? `${latestOccupancy.estimatedCount} visible`
                            : "No AI scan yet"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-700">
                        Equipment Inventory ({room.equipment.length})
                      </p>
                      {room.equipment.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-400">No items listed.</p>
                      ) : (
                        <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                          {room.equipment.slice(0, 4).map((eq) => (
                            <li key={eq.id} className="flex justify-between">
                              <span>{eq.label}</span>
                              <span className="font-mono font-semibold">×{eq.expectedQuantity}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {canManageRooms && (
                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setInventoryRoom(room)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        Inventory
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(room)}
                          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                          title="Edit Classroom"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room)}
                            className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Delete Classroom"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {modalMode === "create" ? "Add Classroom" : "Edit Classroom"}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoom} className="mt-4 space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Room ID</label>
                  <input
                    type="text"
                    required
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="LAB-302"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Max Capacity</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Room Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Software Engineering Lab"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Building</label>
                  <input
                    type="text"
                    required
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="Block 34"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ClassroomStatus)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="IN_USE">In Use</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

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
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  {submitting ? "Saving..." : "Save Classroom"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inventoryRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-indigo-600">
                  {inventoryRoom.roomCode}
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Equipment Inventory — {inventoryRoom.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInventoryRoom(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
              {inventoryRoom.equipment.length === 0 ? (
                <p className="text-xs text-slate-500">No inventory items added yet.</p>
              ) : (
                inventoryRoom.equipment.map((eq) => (
                  <div
                    key={eq.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{eq.label}</p>
                      <p className="text-slate-500">{eq.itemType}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-800">
                        Qty: {eq.expectedQuantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEquipment(eq.id)}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddEquipment} className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Add Expected Item
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <select
                  value={eqType}
                  onChange={(e) => setEqType(e.target.value as EquipmentType)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                >
                  <option value="COMPUTER">Computer</option>
                  <option value="MONITOR">Monitor</option>
                  <option value="PROJECTOR">Projector</option>
                  <option value="FIRE_EXTINGUISHER">Fire Extinguisher</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  type="text"
                  required
                  value={eqLabel}
                  onChange={(e) => setEqLabel(e.target.value)}
                  placeholder="Item label"
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={eqQty}
                  onChange={(e) => setEqQty(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Add to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
