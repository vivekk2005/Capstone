export type UserRole = "ADMIN" | "INSTRUCTOR" | "FACILITY_MANAGER" | "STUDENT";

export interface StudentProfile {
  id: string;
  studentCode: string;
  phone: string | null;
  courseBatch: string;
  enrollmentDate: string;
  status: string;
}

export interface InstructorProfile {
  id: string;
  employeeCode: string;
  department: string | null;
  phone: string | null;
  specialization: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: string;
  studentProfile?: StudentProfile | null;
  instructorProfile?: InstructorProfile | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  studentProfile?: {
    studentCode: string;
    courseBatch: string;
    status: string;
  } | null;
  instructorProfile?: {
    employeeCode: string;
    department: string | null;
  } | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detailsJson: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: {
    fullName: string;
    email: string;
    role: UserRole;
  } | null;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export function formatRoleLabel(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "INSTRUCTOR":
      return "Instructor";
    case "FACILITY_MANAGER":
      return "Facility Manager";
    case "STUDENT":
      return "Student";
  }
}
