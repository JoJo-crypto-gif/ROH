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

async function requestBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
  const { body, headers: customHeaders, ...rest } = options;
  const headers: Record<string, string> = { ...(customHeaders as Record<string, string>) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const send = () =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  let response = await send();
  if (response.status === 401 && accessToken && (await tryRefresh())) {
    headers.Authorization = `Bearer ${accessToken}`;
    response = await send();
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(response.status, error.error || "Request failed", error.code, error.details);
  }
  return response.blob();
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

  logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),

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
    request<{ message: string }>(`/roles/${roleId}/permissions`, {
      method: "DELETE",
      body: { permission },
    }),
};

export interface ApiDashboardAction {
  id: string;
  label: string;
  description: string;
  to: string;
  enabled: boolean;
  reason: string | null;
}

export interface ApiDashboard {
  generatedAt: string;
  focus: "TEACHING" | "LEADERSHIP" | "ADMINISTRATION" | "GENERAL";
  actions: ApiDashboardAction[];
  widgets: {
    students?: {
      total: number;
      active: number;
      recentAdmissions: {
        id: string;
        name: string;
        admissionNo: string;
        sectionName: string;
        admittedAt: string;
      }[];
    };
    staff?: {
      total: number;
      active: number;
      inactive: number;
      teaching: number;
      administration: number;
      support: number;
    };
    academic?: {
      available: boolean;
      reason: string | null;
      year: {
        id: string;
        name: string;
        startDate: string;
        endDate: string;
      } | null;
      term: {
        id: string;
        name: string;
        sequence: number;
        startDate: string;
        endDate: string;
        status: string;
      } | null;
      sections: {
        id: string;
        name: string;
        gradeLevelName: string;
        studentCount: number;
        teacherName: string;
      }[];
    };
    attendance?: {
      date: string;
      available: boolean;
      reason: string | null;
      enrolled: number;
      marked: number;
      missing: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      rate: number | null;
    };
    gradebook?: {
      available: boolean;
      reason: string | null;
      termName: string | null;
      students: number;
      completeStudents: number;
      incompleteStudents: number;
      completedSubjects: number;
      expectedSubjects: number;
      completionRate: number | null;
    };
    reports?: {
      available: boolean;
      reason: string | null;
      termName: string | null;
      total: number;
      published: number;
      ready: number;
      draft: number;
      notStarted: number;
    };
    promotions?: {
      available: boolean;
      reason: string | null;
      total: number;
      awaitingRecommendation: number;
      awaitingApproval: number;
      approved: number;
    };
    finance?: {
      available: boolean;
      reason: string | null;
      academicYearName?: string;
      termName?: string;
      billed: number;
      collected: number;
      outstanding: number;
      collectionRate: number | null;
      recentPayments: {
        id: string;
        studentName: string;
        amount: number;
        postedAt: string;
        receiptNumber: string | null;
      }[];
    };
    accounting?: {
      available: boolean;
      reason: string | null;
      cashPosition: number;
      receivables: number;
      payables: number;
      income: number;
      expenses: number;
      surplus: number;
      unreconciled: number;
    };
  };
}

export const dashboardApi = {
  get: () => request<{ dashboard: ApiDashboard }>("/dashboard"),
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
    request<{ events: ApiCalendarEvent[] }>(
      academicYearId ? `/calendar?academicYearId=${academicYearId}` : "/calendar",
    ),
  createEvent: (data: {
    title: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    type: string;
    academicYearId: string;
  }) => request<{ event: ApiCalendarEvent }>("/calendar", { method: "POST", body: data }),
  updateEvent: (
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      startDate: string;
      endDate: string;
      type: string;
    }>,
  ) => request<{ event: ApiCalendarEvent }>(`/calendar/${id}`, { method: "PATCH", body: data }),
  deleteEvent: (id: string) =>
    request<{ message: string }>(`/calendar/${id}`, { method: "DELETE" }),
};

// ── Users API ────────────────────────────────────────────

export const usersApi = {
  list: () => request<{ users: ApiUser[] }>("/users"),
  get: (id: string) => request<{ user: ApiUser }>(`/users/${id}`),
  create: (data: { email: string; password: string; name: string; roleId: string }) =>
    request<{ user: ApiUser }>("/users", { method: "POST", body: data }),
  update: (
    id: string,
    data: { email?: string; name?: string; roleId?: string; active?: boolean },
  ) => request<{ user: ApiUser }>(`/users/${id}`, { method: "PATCH", body: data }),
  deactivate: (id: string) => request<{ message: string }>(`/users/${id}`, { method: "DELETE" }),
};

// ── Roles API ────────────────────────────────────────────

export const rolesApi = {
  list: () => request<{ roles: ApiRole[] }>("/roles"),
  get: (id: string) => request<{ role: ApiRole }>(`/roles/${id}`),
  create: (data: { name: string; slug: string; description?: string; permissions: string[] }) =>
    request<{ role: ApiRole }>("/roles", { method: "POST", body: data }),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ role: ApiRole }>(`/roles/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request<{ message: string }>(`/roles/${id}`, { method: "DELETE" }),
};

// ── School Staff API ─────────────────────────────────────

export const schoolStaffApi = {
  list: () => request<{ staff: ApiSchoolStaff[] }>("/school-staff"),
  get: (id: string) => request<{ staff: ApiSchoolStaff }>(`/school-staff/${id}`),
  create: (data: {
    name: string;
    email: string;
    password: string;
    roleId: string;
    staffNo: string;
    phone?: string | null;
    jobTitle?: string | null;
    category: ApiSchoolStaff["category"];
    status: ApiSchoolStaff["status"];
    joinedAt?: string;
  }) => request<{ staff: ApiSchoolStaff }>("/school-staff", { method: "POST", body: data }),
  update: (
    id: string,
    data: Partial<{
      name: string;
      email: string;
      roleId: string;
      staffNo: string;
      phone: string | null;
      jobTitle: string | null;
      category: ApiSchoolStaff["category"];
      status: ApiSchoolStaff["status"];
      joinedAt: string;
    }>,
  ) => request<{ staff: ApiSchoolStaff }>(`/school-staff/${id}`, { method: "PATCH", body: data }),
  deactivate: (id: string) =>
    request<{ message: string }>(`/school-staff/${id}`, { method: "DELETE" }),
};

// ── Academic API ─────────────────────────────────────────

export interface ApiTerm {
  id: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
  status: "PENDING" | "ACTIVE" | "CLOSED";
  active: boolean;
}

export interface ApiAcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  termCount: number;
  active: boolean;
  terms: ApiTerm[];
}

export interface ApiGradeLevel {
  id: string;
  name: string;
  code: string;
  order: number;
  isFinal: boolean;
  active: boolean;
  nextGradeLevelId: string | null;
  nextGradeLevel?: { id: string; name: string } | null;
}

export interface ApiClassRoom {
  id: string;
  name: string;
  className: string;
  level: number;
  capacity: number;
  academicYearId: string;
  gradeLevelId: string;
  gradeLevelName: string;
  classTeacherId: string | null;
  teacherId: string | null;
  teacherName: string;
  studentCount: number;
}

export interface ApiSubject {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
}

export const academicApi = {
  getSettings: () =>
    request<{ settings: { id: string; defaultTermCount: number } }>("/academic/settings"),
  updateSettings: (data: { defaultTermCount: number }) =>
    request<{ settings: { id: string; defaultTermCount: number } }>("/academic/settings", {
      method: "PATCH",
      body: data,
    }),
  getSchoolProfile: () =>
    request<{ profile: Record<string, string | null> }>("/academic/school-profile"),
  updateSchoolProfile: (data: Record<string, string | null>) =>
    request<{ profile: Record<string, string | null> }>("/academic/school-profile", {
      method: "PATCH",
      body: data,
    }),
  getYears: () => request<{ years: ApiAcademicYear[] }>("/academic/years"),
  getTeachers: () =>
    request<{ teachers: { id: string; name: string; email: string; staffNo: string }[] }>(
      "/academic/teachers",
    ),
  createYear: (data: {
    name: string;
    startDate: string;
    endDate: string;
    termCount: number;
    terms: { startDate: string; endDate: string }[];
  }) => request<{ year: ApiAcademicYear }>("/academic/years", { method: "POST", body: data }),
  updateYear: (id: string, data: { name?: string; startDate?: string; endDate?: string }) =>
    request<{ year: ApiAcademicYear }>(`/academic/years/${id}`, { method: "PATCH", body: data }),
  activateYear: (id: string) =>
    request<{ year: ApiAcademicYear }>(`/academic/years/${id}/activate`, { method: "POST" }),
  closeYear: (id: string) =>
    request<{ message: string }>(`/academic/years/${id}/close`, { method: "POST" }),
  copyYearStructure: (id: string, data: { sourceYearId: string; copyTermCount?: boolean }) =>
    request<{ message: string }>(`/academic/years/${id}/copy-structure`, {
      method: "POST",
      body: data,
    }),
  deleteYear: (id: string) =>
    request<{ message: string }>(`/academic/years/${id}`, { method: "DELETE" }),

  updateTerm: (id: string, data: { name?: string; startDate?: string; endDate?: string }) =>
    request<{ term: ApiTerm }>(`/academic/terms/${id}`, { method: "PATCH", body: data }),
  transitionTerm: (id: string, status: "ACTIVE" | "CLOSED") =>
    request<{ term: ApiTerm }>(`/academic/terms/${id}/transition`, {
      method: "POST",
      body: { status },
    }),

  getGradeLevels: () => request<{ gradeLevels: ApiGradeLevel[] }>("/academic/grade-levels"),
  createGradeLevel: (data: Omit<ApiGradeLevel, "id" | "active" | "nextGradeLevel">) =>
    request<{ gradeLevel: ApiGradeLevel }>("/academic/grade-levels", {
      method: "POST",
      body: data,
    }),
  updateGradeLevel: (id: string, data: Partial<Omit<ApiGradeLevel, "id" | "nextGradeLevel">>) =>
    request<{ gradeLevel: ApiGradeLevel }>(`/academic/grade-levels/${id}`, {
      method: "PATCH",
      body: data,
    }),

  getClasses: (academicYearId?: string) =>
    request<{ classrooms: ApiClassRoom[]; sections: ApiClassRoom[] }>(
      `/academic/classes${academicYearId ? `?academicYearId=${academicYearId}` : ""}`,
    ),
  createClass: (data: {
    academicYearId: string;
    gradeLevelId: string;
    name: string;
    capacity: number;
    classTeacherId?: string | null;
  }) => request<{ classroom: ApiClassRoom }>("/academic/classes", { method: "POST", body: data }),
  updateClass: (
    id: string,
    data: {
      name?: string;
      gradeLevelId?: string;
      capacity?: number;
      classTeacherId?: string | null;
      active?: boolean;
    },
  ) =>
    request<{ classroom: ApiClassRoom }>(`/academic/classes/${id}`, {
      method: "PATCH",
      body: data,
    }),
  deleteClass: (id: string) =>
    request<{ message: string }>(`/academic/classes/${id}`, { method: "DELETE" }),

  getSubjects: () => request<{ subjects: ApiSubject[] }>("/academic/subjects"),
  createSubject: (data: { name: string; code: string; description?: string | null }) =>
    request<{ subject: ApiSubject }>("/academic/subjects", { method: "POST", body: data }),
  updateSubject: (
    id: string,
    data: { name?: string; code?: string; description?: string | null; active?: boolean },
  ) =>
    request<{ subject: ApiSubject }>(`/academic/subjects/${id}`, { method: "PATCH", body: data }),
  deleteSubject: (id: string) =>
    request<{ message: string }>(`/academic/subjects/${id}`, { method: "DELETE" }),

  getCurriculum: (academicYearId: string, gradeLevelId: string) =>
    request<{
      curriculum: {
        id: string;
        subjectId: string;
        subject: ApiSubject;
        passMark: number;
        sortOrder: number;
      }[];
    }>(`/academic/curriculum?academicYearId=${academicYearId}&gradeLevelId=${gradeLevelId}`),
  saveCurriculum: (
    academicYearId: string,
    gradeLevelId: string,
    subjects: { subjectId: string; passMark: number; sortOrder: number }[],
  ) =>
    request<{ curriculum: unknown[] }>(`/academic/curriculum/${academicYearId}/${gradeLevelId}`, {
      method: "PUT",
      body: { subjects },
    }),
  getAssessmentScheme: (academicYearId: string) =>
    request<{ scheme: ApiAssessmentScheme | null }>(
      `/academic/assessment-schemes/${academicYearId}`,
    ),
  saveAssessmentScheme: (
    academicYearId: string,
    data: Omit<ApiAssessmentScheme, "id" | "locked">,
  ) =>
    request<{ scheme: ApiAssessmentScheme }>(`/academic/assessment-schemes/${academicYearId}`, {
      method: "PUT",
      body: data,
    }),
  getGradeSettings: (academicYearId?: string) =>
    request<{
      settings: { id: string; minScore: number; maxScore: number; grade: string; remark: string }[];
      scheme: ApiAssessmentScheme | null;
    }>(`/academic/grading${academicYearId ? `?academicYearId=${academicYearId}` : ""}`),

  getAttendance: (sectionId: string, date: string, termId?: string) =>
    request<{ attendance: ApiAttendanceMark[] }>(
      `/academic/attendance?sectionId=${sectionId}&date=${date}${termId ? `&termId=${termId}` : ""}`,
    ),
  getAttendanceDates: (sectionId: string, termId?: string) =>
    request<{ dates: string[] }>(
      `/academic/attendance/dates?sectionId=${sectionId}${termId ? `&termId=${termId}` : ""}`,
    ),
  saveAttendance: (data: {
    sectionId: string;
    termId: string;
    date: string;
    marks: { enrolmentId: string; status: string }[];
  }) => request<{ message: string }>("/academic/attendance", { method: "POST", body: data }),

  getGradebookSections: (academicYearId?: string) =>
    request<{ sections: ApiClassRoom[] }>(
      `/academic/gradebook/sections${academicYearId ? `?academicYearId=${academicYearId}` : ""}`,
    ),
  getGradebook: (enrolmentId: string, termId: string) =>
    request<ApiGradebook>(`/academic/gradebook?enrolmentId=${enrolmentId}&termId=${termId}`),
  saveGradebook: (data: {
    enrolmentId: string;
    termId: string;
    entries: {
      curriculumSubjectId: string;
      scores: { componentId: string; score: number }[];
      remarks?: string;
    }[];
  }) => request<{ message: string }>("/academic/gradebook", { method: "PUT", body: data }),
  computePositions: (data: { sectionId: string; termId: string }) =>
    request<{ ranked: number; excluded: number }>("/academic/gradebook/compute-positions", {
      method: "POST",
      body: data,
    }),

  getClassReports: (sectionId: string, termId: string) =>
    request<{ reports: ApiReportListItem[] }>(
      `/academic/reports?sectionId=${sectionId}&termId=${termId}`,
    ),
  getStudentReport: (enrolmentId: string, termId: string) =>
    request<ApiReportCard>(`/academic/reports/enrolment/${enrolmentId}?termId=${termId}`),
  saveRemarks: (data: {
    enrolmentId: string;
    termId: string;
    conduct?: string;
    attitude?: string;
    teacherRemarks?: string;
    headteacherRemark?: string;
  }) => request<{ report: unknown }>("/academic/reports/remarks", { method: "PUT", body: data }),
  previewReport: (enrolmentId: string, termId: string) =>
    requestBlob(`/academic/reports/${enrolmentId}/preview?termId=${termId}`),
  publishReport: (enrolmentId: string, termId: string) =>
    request<{ version: { id: string; version: number } }>(
      `/academic/reports/${enrolmentId}/publish`,
      { method: "POST", body: { termId } },
    ),
  beginReportCorrection: (enrolmentId: string, termId: string, reason: string) =>
    request<{ report: unknown }>(`/academic/reports/${enrolmentId}/corrections`, {
      method: "POST",
      body: { termId, reason },
    }),
  downloadReportVersion: (versionId: string) =>
    requestBlob(`/academic/reports/versions/${versionId}/pdf`),

  getPromotions: (sectionId: string) =>
    request<{ promotions: ApiPromotion[] }>(`/academic/promotions?sectionId=${sectionId}`),
  saveRecommendations: (data: {
    sectionId: string;
    recommendations: { enrolmentId: string; decision: PromotionDecision; remarks?: string }[];
  }) =>
    request<{ message: string }>("/academic/promotions/recommend", { method: "POST", body: data }),
  approvePromotions: (data: {
    sectionId: string;
    nextYearId: string;
    defaultTargetSectionId: string | null;
    overrides?: { enrolmentId: string; targetSectionId: string | null }[];
  }) =>
    request<{ approved: number }>("/academic/promotions/approve", { method: "POST", body: data }),
};

export interface ApiAssessmentScheme {
  id?: string;
  name: string;
  locked?: boolean;
  components: { id?: string; name: string; code: string; maxScore: number; sequence: number }[];
  gradeBands: { id?: string; minScore: number; maxScore: number; grade: string; remark: string }[];
}

export interface ApiAttendanceMark {
  enrolmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  photoColor: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
}
export interface ApiGradebook {
  enrolment: {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
    admissionNo: string;
    photoColor: string;
    sectionName: string;
  };
  term: ApiTerm;
  components: { id: string; name: string; code: string; maxScore: number; sequence: number }[];
  subjects: {
    curriculumSubjectId: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    passMark: number;
    scores: { componentId: string; score: number | null }[];
    totalScore: number | null;
    grade: string | null;
    remarks: string;
    position: number | null;
  }[];
  report: {
    status: string;
    conduct?: string;
    attitude?: string;
    teacherRemarks?: string;
    headteacherRemark?: string;
  };
  editable: boolean;
}
export interface ApiReportListItem {
  enrolmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  photoColor: string;
  averageScore: number;
  totalScore: number;
  position: number | null;
  teacherRemarks: string | null;
  headteacherRemark: string | null;
  status: string;
  published: boolean;
  currentVersion: number;
  latestVersionId: string | null;
}
export interface ApiReportCard {
  enrolmentId: string;
  student: Record<string, string>;
  components: { id: string; name: string; maxScore: number }[];
  attendance: Record<string, number>;
  subjects: {
    curriculumSubjectId: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    passMark: number;
    scores: { componentId: string; score: number | null }[];
    totalScore: number | null;
    grade: string;
    remarks: string;
    position: number | null;
  }[];
  reportSummary: Record<string, string | number | boolean | null>;
  versions: { id: string; version: number; publishedAt: string; checksum: string }[];
  term: ApiTerm;
}
export type PromotionDecision = "PROMOTE" | "REPEAT" | "GRADUATE" | "WITHDRAW" | "TRANSFER";
export interface ApiPromotion {
  enrolmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  photoColor: string;
  studentStatus: string;
  decision: PromotionDecision | null;
  recommendation: PromotionDecision | "PENDING";
  promotionStatus: string;
  remarks: string;
  targetSectionId: string | null;
  targetSectionName: string | null;
}

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
  avatarUrl: string | null;
  
  // Primary Guardian
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
  
  // Secondary Guardian
  guardian2Name: string | null;
  guardian2Phone: string | null;
  guardian2Relation: string | null;
  guardian2Email: string | null;
  
  // Emergency Contact
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  
  // Health & Demographics
  bloodGroup: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  boardingStatus: string;
  previousSchool: string | null;

  address: string;
  photoColor: string;
  enrolmentId: string | null;
  classSectionId: string | null;
  classId: string | null;
  className: string;
  gradeLevelName: string;
  academicYearId: string | null;
}

export type StudentAttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface ApiStudentAttendanceSummary {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
  total: number;
  attendanceRate: number | null;
}

export interface ApiStudentHistory {
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    gender: string;
    dob: string | null;
    status: string;
    enrolledAt: string | null;
    guardian: {
      name: string;
      phone: string;
      relation: string;
      email: string | null;
    };
    address: string;
    photoColor: string;
    currentClass: {
      enrolmentId: string;
      academicYear: string;
      gradeLevel: string;
      section: string;
      status: string;
      classTeacher: string | null;
    } | null;
    lastClass: {
      enrolmentId: string;
      academicYear: string;
      gradeLevel: string;
      section: string;
      status: string;
      classTeacher: string | null;
    } | null;
  };
  summary: {
    enrolmentCount: number;
    reportCount: number;
    assessmentResultCount: number;
    attendance: ApiStudentAttendanceSummary;
  };
  enrolments: {
    id: string;
    status: string;
    completedAt: string | null;
    academicYear: {
      id: string;
      name: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
      termCount: number;
    };
    classSection: {
      id: string;
      name: string;
      capacity: number;
      gradeLevel: { id: string; name: string; order: number; isFinal: boolean };
      classTeacher: { id: string; name: string; email: string } | null;
    };
    assessmentComponents: {
      id: string;
      name: string;
      code: string;
      maxScore: number | null;
      sequence: number;
    }[];
    terms: {
      id: string;
      name: string;
      sequence: number;
      status: string;
      startDate: string | null;
      endDate: string | null;
      attendance: {
        summary: ApiStudentAttendanceSummary;
        records: { id: string; date: string | null; status: StudentAttendanceStatus }[];
      };
      assessment: {
        subjectCount: number;
        totalScore: number | null;
        averageScore: number | null;
        subjects: {
          id: string;
          subjectName: string;
          subjectCode: string;
          totalScore: number | null;
          grade: string | null;
          remarks: string | null;
          position: number | null;
          scores: {
            componentId: string;
            componentName: string;
            componentCode: string;
            maxScore: number | null;
            score: number | null;
          }[];
        }[];
      };
      report: {
        id: string;
        status: string;
        conduct: string | null;
        attitude: string | null;
        teacherRemarks: string | null;
        headteacherRemark: string | null;
        position: number | null;
        totalScore: number | null;
        averageScore: number | null;
        currentVersion: number;
        versions: {
          id: string;
          version: number;
          publishedAt: string;
          checksum: string;
          publishedBy: string | null;
        }[];
      } | null;
    }[];
    promotion: {
      id: string;
      decision: PromotionDecision;
      status: string;
      remarks: string | null;
      approvedAt: string | null;
      recommendedBy: string | null;
      approvedBy: string | null;
      nextEnrolment: {
        id: string;
        academicYear: string;
        section: string;
        gradeLevel: string;
        status: string;
      } | null;
    } | null;
    arrivedFrom: {
      decision: PromotionDecision;
      status: string;
      academicYear: string;
      section: string;
      gradeLevel: string;
      approvedAt: string | null;
      approvedBy: string | null;
    } | null;
  }[];
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
  getHistory: (id: string) => request<{ history: ApiStudentHistory }>(`/students/${id}/history`),
  create: (data: {
    firstName: string;
    lastName: string;
    gender: string;
    dob: string;
    avatarUrl?: string | null;
    avatarBase64?: string;
    
    // Primary Guardian
    guardianName: string;
    guardianPhone: string;
    guardianRelation: string;
    guardianEmail?: string | null;
    
    // Secondary Guardian
    guardian2Name?: string | null;
    guardian2Phone?: string | null;
    guardian2Relation?: string | null;
    guardian2Email?: string | null;
    
    // Emergency Contact
    emergencyName?: string | null;
    emergencyPhone?: string | null;
    emergencyRelation?: string | null;
    
    // Health & Demographics
    bloodGroup?: string | null;
    allergies?: string | null;
    medicalNotes?: string | null;
    boardingStatus?: string;
    previousSchool?: string | null;
    
    address: string;
    classId: string;
    feeEffectiveTermId?: string;
  }) => request<{ student: ApiStudent }>("/students", { method: "POST", body: data }),
  update: (
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      gender?: string;
      dob?: string;
      status?: string;
      avatarUrl?: string | null;
      avatarBase64?: string;
      
      // Primary Guardian
      guardianName?: string;
      guardianPhone?: string;
      guardianRelation?: string;
      guardianEmail?: string | null;
      
      // Secondary Guardian
      guardian2Name?: string | null;
      guardian2Phone?: string | null;
      guardian2Relation?: string | null;
      guardian2Email?: string | null;
      
      // Emergency Contact
      emergencyName?: string | null;
      emergencyPhone?: string | null;
      emergencyRelation?: string | null;
      
      // Health & Demographics
      bloodGroup?: string | null;
      allergies?: string | null;
      medicalNotes?: string | null;
      boardingStatus?: string;
      previousSchool?: string | null;
      address?: string;
      classId?: string;
      feeEffectiveTermId?: string;
    },
  ) => request<{ student: ApiStudent }>(`/students/${id}`, { method: "PATCH", body: data }),
  getAttendance: (id: string, yearId: string, termId: string) =>
    request<{ attendance: { id: string; date: string; status: string; className: string }[] }>(
      `/students/${id}/attendance?academicYearId=${yearId}&termId=${termId}`,
    ),
};

// ── Finance API ─────────────────────────────────────────

export interface ApiFeeItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}
export interface ApiFeeScheduleLine {
  id: string;
  feeItemId: string;
  label: string;
  amount: number;
  dueDate: string;
  applicability: "MANDATORY" | "OPTIONAL";
  feeItem: ApiFeeItem;
}
export interface ApiFeeSchedule {
  id: string;
  name: string;
  academicYearId: string;
  termId: string;
  gradeLevelId: string;
  kind: "STANDARD" | "SUPPLEMENTAL";
  sequence: number;
  status: "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED";
  academicYear: ApiAcademicYear;
  term: ApiTerm;
  gradeLevel: ApiGradeLevel;
  lines: ApiFeeScheduleLine[];
  total: number;
}
export interface ApiStudentLedger {
  student: {
    id: string;
    name: string;
    admissionNo: string;
    guardianName: string;
    guardianPhone: string;
  };
  summary: {
    billed: number;
    paid: number;
    creditApplied: number;
    outstanding: number;
    availableCredit: number;
    netExposure: number;
    previousArrears: number;
    currentTermBalance: number;
    futureCharges: number;
  };
  charges: {
    id: string;
    label: string;
    academicYearName: string;
    termName: string;
    gradeLevelName: string;
    sectionName: string;
    dueDate: string;
    net: number;
    paid: number;
    creditApplied: number;
    balance: number;
    applicability: string;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    status: string;
    transactionRef: string | null;
    postedAt: string;
    allocated: number;
    creditCreated: number;
    receipt: { id: string; number: string } | null;
    reversal: { id: string; status: string; reason: string } | null;
  }[];
  credits: { id: string; amount: number; available: number; status: string; createdAt: string }[];
}
export interface ApiFeePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  transactionRef: string | null;
  postedAt: string;
  allocated: number;
  creditCreated: number;
  student: ApiStudent;
  receipt: { id: string; number: string } | null;
  reversal: { id: string; status: string; reason: string } | null;
}
export interface ApiFeeReceipt {
  id: string;
  number: string;
  issuedAt: string;
  checksum: string;
  status: string;
  amount: number;
  method: string;
  student: { id: string; name: string; admissionNo: string };
  recordedBy: { id: string; name: string } | null;
}
export interface ApiPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface ApiFeeReceiptDetail {
  id: string;
  number: string;
  issuedAt: string;
  checksum: string;
  snapshot: {
    receiptNumber: string;
    postedAt: string;
    student: { id: string; name: string; admissionNo: string };
    payment: {
      id: string;
      amount: number;
      method: string;
      transactionRef: string | null;
    };
    allocations: { chargeId: string; label: string; amount: number }[];
    credit: number;
  };
  payment: {
    id: string;
    amount: number;
    method: string;
    status: string;
    transactionRef: string | null;
    postedAt: string;
    recordedBy: { id: string; name: string } | null;
    reversal: {
      id: string;
      reason: string;
      status: string;
      createdAt: string;
      decidedAt: string | null;
    } | null;
  };
}

export const financeApi = {
  getFeeItems: (includeArchived = false) =>
    request<{ items: ApiFeeItem[] }>(
      `/finance/fee-items${includeArchived ? "?includeArchived=true" : ""}`,
    ),
  createFeeItem: (data: { code: string; name: string; description?: string }) =>
    request<{ item: ApiFeeItem }>("/finance/fee-items", { method: "POST", body: data }),
  updateFeeItem: (
    id: string,
    data: Partial<Pick<ApiFeeItem, "code" | "name" | "description" | "active">>,
  ) => request<{ item: ApiFeeItem }>(`/finance/fee-items/${id}`, { method: "PATCH", body: data }),
  getSchedules: (filters?: {
    academicYearId?: string;
    termId?: string;
    gradeLevelId?: string;
    status?: string;
  }) => {
    const query = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<{ schedules: ApiFeeSchedule[] }>(
      `/finance/schedules${query.size ? `?${query}` : ""}`,
    );
  },
  createSchedule: (data: {
    academicYearId: string;
    termId: string;
    gradeLevelId: string;
    kind: "STANDARD" | "SUPPLEMENTAL";
    name: string;
    lines: {
      feeItemId: string;
      amount: number;
      dueDate: string;
      applicability: "MANDATORY" | "OPTIONAL";
    }[];
  }) => request<{ schedule: ApiFeeSchedule }>("/finance/schedules", { method: "POST", body: data }),
  submitSchedule: (id: string) =>
    request<{ schedule: ApiFeeSchedule }>(`/finance/schedules/${id}/submit`, { method: "POST" }),
  publishSchedule: (id: string) =>
    request<{ schedule: ApiFeeSchedule; chargesCreated: number }>(
      `/finance/schedules/${id}/publish`,
      { method: "POST" },
    ),
  assignOptionalFee: (lineId: string, enrolmentIds: string[]) =>
    request<{ assigned: number; chargesCreated: number }>(
      `/finance/schedule-lines/${lineId}/assignments`,
      { method: "POST", body: { enrolmentIds } },
    ),
  getLedger: (studentId: string) =>
    request<{ ledger: ApiStudentLedger }>(`/finance/students/${studentId}/ledger`),
  downloadStatement: (studentId: string) =>
    requestBlob(`/finance/students/${studentId}/statement/pdf`),
  getPayments: (filters?: {
    search?: string;
    method?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<{ payments: ApiFeePayment[]; pagination: ApiPagination }>(
      `/finance/payments${query.size ? `?${query}` : ""}`,
    );
  },
  recordPayment: (data: {
    studentId: string;
    amount: number;
    method: string;
    transactionRef?: string | null;
    moneyAccountId?: string | null;
    idempotencyKey: string;
    allocations: { chargeId: string; amount: number }[];
  }) => request<{ payment: ApiFeePayment }>("/finance/payments", { method: "POST", body: data }),
  allocateCredit: (creditLotId: string, allocations: { chargeId: string; amount: number }[]) =>
    request<{ allocated: number; remaining: number }>(`/finance/credits/${creditLotId}/allocate`, {
      method: "POST",
      body: { allocations },
    }),
  requestAdjustment: (data: { chargeId: string; type: string; amount: number; reason: string }) =>
    request<{ adjustment: unknown }>("/finance/adjustments", { method: "POST", body: data }),
  getAdjustments: (status = "PENDING") =>
    request<{ adjustments: Array<Record<string, unknown>> }>(
      `/finance/adjustments?status=${status}`,
    ),
  decideAdjustment: (id: string, approved: boolean) =>
    request<{ adjustment: unknown }>(`/finance/adjustments/${id}/decision`, {
      method: "POST",
      body: { approved },
    }),
  requestReversal: (paymentId: string, reason: string) =>
    request<{ reversal: unknown }>("/finance/reversals", {
      method: "POST",
      body: { paymentId, reason },
    }),
  getReversals: (status = "PENDING") =>
    request<{ reversals: Array<Record<string, unknown>> }>(`/finance/reversals?status=${status}`),
  decideReversal: (id: string, approved: boolean) =>
    request<{ reversal: unknown }>(`/finance/reversals/${id}/decision`, {
      method: "POST",
      body: { approved },
    }),
  getReceipts: (filters?: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<{ receipts: ApiFeeReceipt[]; pagination: ApiPagination }>(
      `/finance/receipts${query.size ? `?${query}` : ""}`,
    );
  },
  getReceipt: (id: string) => request<{ receipt: ApiFeeReceiptDetail }>(`/finance/receipts/${id}`),
  downloadReceipt: (id: string) => requestBlob(`/finance/receipts/${id}/pdf`),
  getDebtorFilters: () =>
    request<{
      gradeLevels: { id: string; name: string; order: number }[];
      sections: { id: string; name: string; gradeLevelId: string }[];
    }>("/finance/debtors/filters"),
  getDebtors: (filters?: {
    gradeLevelId?: string;
    classSectionId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<{
      debtors: ({ student: ApiStudentLedger["student"] } & ApiStudentLedger["summary"])[];
      pagination: ApiPagination;
      totals: { netExposure: number };
    }>(`/finance/debtors${query.size ? `?${query}` : ""}`);
  },
};

// ── School Accounting API ───────────────────────────────

export interface ApiAccount {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  systemKey: string | null;
  active: boolean;
  moneyAccount?: ApiMoneyAccount | null;
  _count?: { journalLines: number };
}
export interface ApiMoneyAccount {
  id: string;
  accountId: string;
  name: string;
  type: "CASH" | "BANK" | "MOBILE_MONEY" | "CARD_CLEARING";
  institution: string | null;
  accountNumber: string | null;
  active: boolean;
  account: ApiAccount;
  methodMappings?: { method: string }[];
}
export interface ApiAccountingSetup {
  id: string;
  name: string;
  status: "SETUP" | "ACTIVE";
  cutoverAt: string | null;
  accounts: ApiAccount[];
  fiscalYears: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    academicYear: ApiAcademicYear;
    periods: { id: string; name: string; status: string; startDate: string; endDate: string }[];
  }[];
  feeMappings: {
    feeItemId: string;
    incomeAccountId: string;
    feeItem: ApiFeeItem;
    incomeAccount: ApiAccount;
  }[];
  methodMappings: {
    method: string;
    moneyAccountId: string;
    moneyAccount: ApiMoneyAccount;
  }[];
}
export interface ApiJournal {
  id: string;
  number: string | null;
  date: string;
  description: string;
  status: string;
  source: string;
  lines: {
    id: string;
    accountId: string;
    description: string | null;
    debit: number | string;
    credit: number | string;
    account: ApiAccount;
  }[];
  reversal?: { id: string; number: string | null } | null;
}
export interface ApiExpense {
  id: string;
  number: string;
  payee: string;
  description: string;
  reference: string | null;
  date: string;
  status: string;
  total: number | string;
  missingDocumentReason: string | null;
  lines: { id: string; accountId: string; description: string; amount: number | string }[];
  payments: {
    id: string;
    amount: number | string;
    date: string;
    transactionRef: string | null;
    moneyAccount: ApiMoneyAccount;
  }[];
  attachments: { id: string; filename: string; checksum: string; createdAt: string }[];
}
export interface ApiAccountingReports {
  cutoverNotice: string | null;
  fiscalYear: { id: string; name: string; startDate: string; endDate: string };
  trialBalance: { account: ApiAccount; debit: number; credit: number; balance: number }[];
  generalLedger: {
    id: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    journalNumber: string | null;
    date: string;
    description: string;
    debit: number;
    credit: number;
  }[];
  cashBankBook: {
    id: string;
    moneyAccountName: string;
    journalNumber: string | null;
    date: string;
    description: string;
    debit: number;
    credit: number;
  }[];
  expenseRegister: {
    id: string;
    number: string;
    date: string;
    payee: string;
    description: string;
    status: string;
    total: number;
    paid: number;
  }[];
  reconciliationSummary: {
    moneyAccountId: string;
    name: string;
    statementAmount: number;
    matchedAmount: number;
    unmatchedAmount: number;
    unmatchedLines: number;
  }[];
  receivableControl: {
    ledgerBalance: number;
    financeOutstanding: number;
    difference: number;
    reconciled: boolean;
  };
  incomeStatement: { income: number; expenses: number; surplus: number };
  balanceSheet: { assets: number; liabilities: number; equity: number };
}

export const accountingApi = {
  getSetup: () => request<{ setup: ApiAccountingSetup | null }>("/accounting/setup"),
  bootstrap: (academicYearId?: string) =>
    request<{ setup: ApiAccountingSetup }>("/accounting/setup/bootstrap", {
      method: "POST",
      body: { academicYearId },
    }),
  activate: (data: {
    cutoverDate: string;
    moneyBalances: { moneyAccountId: string; amount: number }[];
    otherBalances?: { accountId: string; debit: number; credit: number }[];
  }) =>
    request<{ bookId: string; journalId: string }>("/accounting/setup/activate", {
      method: "POST",
      body: data,
    }),
  getAccounts: (includeArchived = false) =>
    request<{ accounts: ApiAccount[] }>(
      `/accounting/accounts${includeArchived ? "?includeArchived=true" : ""}`,
    ),
  createAccount: (data: { code: string; name: string; type: ApiAccount["type"] }) =>
    request<{ account: ApiAccount }>("/accounting/accounts", { method: "POST", body: data }),
  updateAccount: (
    id: string,
    data: Partial<Pick<ApiAccount, "code" | "name" | "type" | "active">>,
  ) =>
    request<{ account: ApiAccount }>(`/accounting/accounts/${id}`, { method: "PATCH", body: data }),
  getMoneyAccounts: () =>
    request<{ moneyAccounts: ApiMoneyAccount[] }>("/accounting/money-accounts"),
  setMethodMapping: (method: string, moneyAccountId: string) =>
    request<{ mapping: unknown }>("/accounting/method-mapping", {
      method: "PUT",
      body: { method, moneyAccountId },
    }),
  saveFeeMappings: (mappings: { feeItemId: string; incomeAccountId: string }[]) =>
    request<{ saved: number }>("/accounting/fee-mappings", { method: "PUT", body: { mappings } }),
  getJournals: () => request<{ journals: ApiJournal[] }>("/accounting/journals"),
  createJournal: (data: {
    date: string;
    description: string;
    lines: { accountId: string; description?: string; debit: number; credit: number }[];
  }) => request<{ journal: ApiJournal }>("/accounting/journals", { method: "POST", body: data }),
  submitJournal: (id: string) =>
    request<{ journal: ApiJournal }>(`/accounting/journals/${id}/submit`, { method: "POST" }),
  decideJournal: (id: string, approved: boolean) =>
    request<{ journal: ApiJournal }>(`/accounting/journals/${id}/decision`, {
      method: "POST",
      body: { approved },
    }),
  reverseJournal: (id: string, reason: string) =>
    request<{ journal: ApiJournal }>(`/accounting/journals/${id}/reverse`, {
      method: "POST",
      body: { reason },
    }),
  getExpenses: () => request<{ expenses: ApiExpense[] }>("/accounting/expenses"),
  createExpense: (data: {
    date: string;
    payee: string;
    reference?: string | null;
    description: string;
    missingDocumentReason?: string | null;
    lines: { accountId: string; description: string; amount: number }[];
  }) => request<{ expense: ApiExpense }>("/accounting/expenses", { method: "POST", body: data }),
  submitExpense: (id: string) =>
    request<{ expense: ApiExpense }>(`/accounting/expenses/${id}/submit`, { method: "POST" }),
  decideExpense: (id: string, approved: boolean, reason?: string) =>
    request<{ expense: ApiExpense }>(`/accounting/expenses/${id}/decision`, {
      method: "POST",
      body: { approved, reason },
    }),
  payExpense: (
    id: string,
    data: { amount: number; date: string; moneyAccountId: string; transactionRef?: string },
  ) =>
    request<{ payment: unknown }>(`/accounting/expenses/${id}/payments`, {
      method: "POST",
      body: data,
    }),
  reverseExpense: (id: string, reason: string) =>
    request<{ expense: ApiExpense }>(`/accounting/expenses/${id}/reverse`, {
      method: "POST",
      body: { reason },
    }),
  addExpenseAttachment: (id: string, filename: string, contentBase64: string) =>
    request<{ attachment: { id: string; filename: string; checksum: string } }>(
      `/accounting/expenses/${id}/attachments`,
      { method: "POST", body: { filename, contentBase64 } },
    ),
  downloadExpenseAttachment: (expenseId: string, attachmentId: string) =>
    requestBlob(`/accounting/expenses/${expenseId}/attachments/${attachmentId}`),
  getReconciliation: (moneyAccountId?: string) =>
    request<{
      accounts: ApiMoneyAccount[];
      statementLines: {
        id: string;
        date: string;
        description: string;
        amount: number;
        matched: number;
      }[];
      ledgerLines: {
        id: string;
        date: string;
        description: string;
        amount: number;
        matched: number;
        journal: ApiJournal;
      }[];
      cashCounts: {
        id: string;
        date: string;
        expected: number;
        counted: number;
        difference: number;
        status: string;
      }[];
    }>(
      `/accounting/reconciliation${moneyAccountId ? `?moneyAccountId=${encodeURIComponent(moneyAccountId)}` : ""}`,
    ),
  importStatement: (data: {
    moneyAccountId: string;
    filename: string;
    periodStart: string;
    periodEnd: string;
    csv: string;
  }) =>
    request<{ imported: number; duplicates: number }>("/accounting/reconciliation/import", {
      method: "POST",
      body: data,
    }),
  match: (statementLineId: string, matches: { journalLineId: string; amount: number }[]) =>
    request<{ matched: number }>("/accounting/reconciliation/matches", {
      method: "POST",
      body: { statementLineId, matches },
    }),
  createReconciliationDraft: (
    statementLineId: string,
    offsetAccountId: string,
    description: string,
  ) =>
    request<{ journal: ApiJournal }>("/accounting/reconciliation/draft-journal", {
      method: "POST",
      body: { statementLineId, offsetAccountId, description },
    }),
  createCashCount: (data: { moneyAccountId: string; date: string; counted: number }) =>
    request<{ cashCount: unknown }>("/accounting/cash-counts", { method: "POST", body: data }),
  approveCashCount: (id: string) =>
    request<{ cashCount: unknown }>(`/accounting/cash-counts/${id}/approve`, { method: "POST" }),
  setPeriodStatus: (id: string, status: "OPEN" | "CLOSED") =>
    request<{ period: unknown }>(`/accounting/periods/${id}`, {
      method: "PATCH",
      body: { status },
    }),
  getReports: (fiscalYearId?: string) =>
    request<{ reports: ApiAccountingReports | null }>(
      `/accounting/reports${fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : ""}`,
    ),
  downloadReport: (
    type:
      | "trial-balance"
      | "general-ledger"
      | "income-statement"
      | "balance-sheet"
      | "cash-bank-book"
      | "expense-register"
      | "reconciliation-summary"
      | "receivable-control",
  ) => requestBlob(`/accounting/reports/${type}/pdf`),
  getSummary: () =>
    request<{ summary: Record<string, number | string | boolean | null> }>("/accounting/summary"),
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
  staffNo?: string | null;
  phone?: string | null;
  schoolStaffId?: string | null;
  schoolStaffCategory?: "TEACHING" | "ADMIN" | "SUPPORT" | null;
  schoolStaffStatus?: "ACTIVE" | "INACTIVE" | null;
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

export interface ApiSchoolStaff {
  id: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  userActive: boolean;
  staffNo: string;
  phone: string | null;
  jobTitle: string | null;
  category: "TEACHING" | "ADMIN" | "SUPPORT";
  status: "ACTIVE" | "INACTIVE";
  joinedAt: string;
  assignedSections: {
    id: string;
    name: string;
    academicYearId: string;
    academicYearName: string;
    academicYearStatus: string;
    gradeLevelId: string;
    gradeLevelName: string;
  }[];
  createdAt?: string;
  updatedAt?: string;
}
