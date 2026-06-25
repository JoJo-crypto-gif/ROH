const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

let accessToken: string | null = null;

/** Store access token in memory (not localStorage — more secure) */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/** Wrapper around fetch with auth headers, JSON handling, and refresh retry */
async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include", // send httpOnly cookies (refresh token)
  });

  // If 401, try to refresh the token
  if (res.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry the original request with new token
      headers["Authorization"] = `Bearer ${accessToken}`;
      const retryRes = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
      });

      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ error: "Request failed" }));
        throw new ApiError(retryRes.status, err.error || "Request failed", err.code);
      }
      return retryRes.json();
    }

    // Refresh failed — clear token and redirect to login
    setAccessToken(null);
    window.location.href = "/login?expired=true";
    throw new ApiError(401, "Session expired", "SESSION_EXPIRED");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, err.error || "Request failed", err.code, err.details);
  }

  return res.json();
}

export interface RefreshResponse {
  accessToken: string;
  user: ApiUser;
}

let refreshPromise: Promise<RefreshResponse | null> | null = null;

/** Deduplicated function to refresh the session */
export async function refreshSession(): Promise<RefreshResponse | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) return null;

      const data = await res.json();
      setAccessToken(data.accessToken);
      return data;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Try to refresh the access token using the httpOnly cookie */
async function tryRefresh(): Promise<boolean> {
  const data = await refreshSession();
  return !!data;
}

// ── API Error class ──────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth API ─────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  me: () => request<{ user: ApiUser }>("/auth/me"),

  logout: () =>
    request<{ message: string }>("/auth/logout", { method: "POST" }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, password },
    }),

  removePermission: (roleId: string, permission: string) =>
    request<{ message: string }>(`/roles/${roleId}/permissions`, { method: "DELETE", body: { permission } }),
};

// ── Calendar API ─────────────────────────────────────────

export interface ApiCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  type: string;
  academicYearId: string;
}

export const calendarApi = {
  getEvents: (academicYearId?: string) =>
    request<{ events: ApiCalendarEvent[] }>(academicYearId ? `/calendar?academicYearId=${academicYearId}` : "/calendar"),
  createEvent: (data: { title: string; description?: string | null; startDate: string; endDate: string; type: string; academicYearId: string }) =>
    request<{ event: ApiCalendarEvent }>("/calendar", { method: "POST", body: data }),
  updateEvent: (id: string, data: Partial<{ title: string; description: string | null; startDate: string; endDate: string; type: string }>) =>
    request<{ event: ApiCalendarEvent }>(`/calendar/${id}`, { method: "PATCH", body: data }),
  deleteEvent: (id: string) =>
    request<{ message: string }>(`/calendar/${id}`, { method: "DELETE" }),
};

// ── Users API ────────────────────────────────────────────

export const usersApi = {
  list: () => request<{ users: ApiUser[] }>("/users"),
  get: (id: string) => request<{ user: ApiUser }>(`/users/${id}`),
  create: (data: { email: string; password: string; name: string; roleId: string }) =>
    request<{ user: ApiUser }>("/users", { method: "POST", body: data }),
  update: (id: string, data: { email?: string; name?: string; roleId?: string; active?: boolean }) =>
    request<{ user: ApiUser }>(`/users/${id}`, { method: "PATCH", body: data }),
  deactivate: (id: string) =>
    request<{ message: string }>(`/users/${id}`, { method: "DELETE" }),
};

// ── Roles API ────────────────────────────────────────────

export const rolesApi = {
  list: () => request<{ roles: ApiRole[] }>("/roles"),
  get: (id: string) => request<{ role: ApiRole }>(`/roles/${id}`),
  create: (data: { name: string; slug: string; description?: string; permissions: string[] }) =>
    request<{ role: ApiRole }>("/roles", { method: "POST", body: data }),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ role: ApiRole }>(`/roles/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    request<{ message: string }>(`/roles/${id}`, { method: "DELETE" }),
};

// ── Academic API ─────────────────────────────────────────

export interface ApiTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

export interface ApiAcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
  terms: ApiTerm[];
}

export interface ApiClassRoom {
  id: string;
  name: string;
  level: number;
  capacity: number;
  teacherId: string | null;
  teacherName: string;
  studentCount: number;
}

export interface ApiSubject {
  id: string;
  name: string;
  code: string;
  teachers: { id: string; name: string }[];
}

export const academicApi = {
  getYears: () => request<{ years: ApiAcademicYear[] }>("/academic/years"),
  getTeachers: () => request<{ teachers: { id: string; name: string; email: string; staffNo: string }[] }>("/academic/teachers"),
  createYear: (data: { name: string; startDate: string; endDate: string; active?: boolean; terms: Omit<ApiTerm, "id" | "active">[] }) =>
    request<{ year: ApiAcademicYear }>("/academic/years", { method: "POST", body: data }),
  updateYear: (id: string, data: { name?: string; startDate?: string; endDate?: string; active?: boolean }) =>
    request<{ year: ApiAcademicYear }>(`/academic/years/${id}`, { method: "PATCH", body: data }),
  deleteYear: (id: string) =>
    request<{ message: string }>(`/academic/years/${id}`, { method: "DELETE" }),
  updateTerm: (id: string, data: { name?: string; startDate?: string; endDate?: string; active?: boolean }) =>
    request<{ term: ApiTerm }>(`/academic/terms/${id}`, { method: "PATCH", body: data }),

  getClasses: () => request<{ classrooms: ApiClassRoom[] }>("/academic/classes"),
  createClass: (data: { name: string; level: number; capacity: number; teacherId?: string | null }) =>
    request<{ classroom: ApiClassRoom }>("/academic/classes", { method: "POST", body: data }),
  updateClass: (id: string, data: { name?: string; level?: number; capacity?: number; teacherId?: string | null }) =>
    request<{ classroom: ApiClassRoom }>(`/academic/classes/${id}`, { method: "PATCH", body: data }),
  deleteClass: (id: string) =>
    request<{ message: string }>(`/academic/classes/${id}`, { method: "DELETE" }),
  getClassroomSubjects: (classId: string) =>
    request<{ classSubjects: { id: string; subjectId: string; subjectName: string; subjectCode: string; teacherId: string | null; teacherName: string; passMark: number; weight: number }[] }>(`/academic/classes/${classId}/subjects`),
  saveClassroomSubjects: (classId: string, data: { subjects: { subjectId: string; teacherId?: string | null; passMark: number; weight: number }[] }) =>
    request<{ message: string }>(`/academic/classes/${classId}/subjects`, { method: "POST", body: data }),

  getSubjects: () => request<{ subjects: ApiSubject[] }>("/academic/subjects"),
  createSubject: (data: { name: string; code: string; teacherIds?: string[] }) =>
    request<{ subject: ApiSubject }>("/academic/subjects", { method: "POST", body: data }),
  updateSubject: (id: string, data: { name?: string; code?: string; teacherIds?: string[] }) =>
    request<{ subject: ApiSubject }>(`/academic/subjects/${id}`, { method: "PATCH", body: data }),
  deleteSubject: (id: string) =>
    request<{ message: string }>(`/academic/subjects/${id}`, { method: "DELETE" }),

  getAttendance: (classId: string, date: string) =>
    request<{ attendance: { id: string | null; firstName: string; lastName: string; admissionNo: string; photoColor: string; status: string }[] }>(
      `/academic/attendance?classId=${classId}&date=${date}`
    ),
  getAttendanceDates: (classId: string) =>
    request<{ dates: string[] }>(`/academic/attendance/dates?classId=${classId}`),
  saveAttendance: (data: { classId: string; date: string; marks: { studentId: string; status: string }[] }) =>
    request<{ message: string }>("/academic/attendance", { method: "POST", body: data }),

  getClassSubjects: () =>
    request<{ classSubjects: { id: string; classId: string; className: string; subjectName: string; subjectCode: string; teacherId: string | null; teacherName: string; passMark: number; weight: number }[] }>("/academic/class-subjects"),
  getGradebook: (classSubjectId: string) =>
    request<{ classSubject: any; records: any[] }>(`/academic/gradebook?classSubjectId=${classSubjectId}`),
  saveGradebook: (data: { classSubjectId: string; entries: { studentId: string; classScore: number; examScore: number }[] }) =>
    request<{ message: string }>("/academic/gradebook", { method: "POST", body: data }),

  getClassReports: (classId: string) =>
    request<{ reports: { studentId: string; firstName: string; lastName: string; admissionNo: string; photoColor: string; averageScore: number; teacherRemarks: string | null; principalRemark: string | null; published: boolean }[] }>(`/academic/reports?classId=${classId}`),
  getStudentReport: (studentId: string) =>
    request<{ student: any; attendance: any; subjects: any[]; reportSummary: any }>(`/academic/reports/student/${studentId}`),
  saveRemarks: (data: { studentId: string; teacherRemarks?: string; principalRemark?: string; published?: boolean }) =>
    request<{ message: string }>("/academic/reports/remarks", { method: "POST", body: data }),

  getPromotions: (classId: string) =>
    request<{ promotions: { studentId: string; firstName: string; lastName: string; admissionNo: string; photoColor: string; status: string; enrolmentId: string; recommendation: string; promotionStatus: string; remarks: string }[] }>(`/academic/promotions?classId=${classId}`),
  saveRecommendations: (data: { classId: string; recommendations: { studentId: string; recommendation: string; remarks?: string }[] }) =>
    request<{ message: string }>("/academic/promotions/recommend", { method: "POST", body: data }),
  approvePromotions: (data: { classId: string; targetClassId: string }) =>
    request<{ message: string }>("/academic/promotions/approve", { method: "POST", body: data }),
};

// ── Students API ─────────────────────────────────────────

export interface ApiStudent {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  dob: string;
  status: string;
  enrolledAt: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  guardianEmail: string | null;
  guardian: {
    name: string;
    phone: string;
    relation: string;
    email: string | null;
  };
  address: string;
  photoColor: string;
  classId: string | null;
  className: string;
}

export const studentsApi = {
  list: (params?: { classId?: string; status?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.classId) query.set("classId", params.classId);
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    const qStr = query.toString();
    return request<{ students: ApiStudent[] }>(`/students${qStr ? `?${qStr}` : ""}`);
  },
  get: (id: string) => request<{ student: ApiStudent }>(`/students/${id}`),
  create: (data: {
    firstName: string;
    lastName: string;
    gender: string;
    dob: string;
    guardianName: string;
    guardianPhone: string;
    guardianRelation: string;
    guardianEmail?: string | null;
    address: string;
    classId: string;
  }) => request<{ student: ApiStudent }>("/students", { method: "POST", body: data }),
  update: (
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      gender?: string;
      dob?: string;
      status?: string;
      guardianName?: string;
      guardianPhone?: string;
      guardianRelation?: string;
      guardianEmail?: string | null;
      address?: string;
      classId?: string;
    }
  ) => request<{ student: ApiStudent }>(`/students/${id}`, { method: "PATCH", body: data }),
  getAttendance: (id: string, yearId: string, termId: string) =>
    request<{ attendance: { id: string; date: string; status: string; className: string }[] }>(
      `/students/${id}/attendance?academicYearId=${yearId}&termId=${termId}`
    ),
};

// ── API Types ────────────────────────────────────────────

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  avatarInitials: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  permissions: string[];
  assignedClassId?: string | null;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  builtIn: boolean;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}
