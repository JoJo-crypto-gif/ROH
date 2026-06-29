// Centralised mock data. Replace with API calls later.

export interface Guardian {
  name: string;
  phone: string;
  relation: string;
  email?: string;
}
export interface Student {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  dob: string;
  classId: string;
  status: "active" | "withdrawn" | "graduated" | "repeating";
  enrolledAt: string;
  guardian: Guardian;
  address: string;
  photoColor: string;
}
export interface Staff {
  id: string;
  staffNo: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  subjects?: string[];
  classId?: string;
  active: boolean;
  joinedAt: string;
}
export interface ClassRoom {
  id: string;
  name: string;
  level: number;
  teacherId?: string;
  capacity: number;
}
export interface Subject {
  id: string;
  name: string;
  code: string;
}
export interface AcademicYear {
  id: string;
  name: string;
  active: boolean;
  terms: { id: string; name: string; start: string; end: string }[];
}

export interface AttendanceRecord {
  studentId: string;
  date: string;
  status: "Present" | "Absent" | "Late" | "Excused";
  classId: string;
}

const colors = [
  "#0f766e",
  "#15803d",
  "#0369a1",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#0d9488",
  "#4d7c0f",
];

export const academicYears: AcademicYear[] = [
  {
    id: "ay-2025",
    name: "2025 / 2026",
    active: true,
    terms: [
      { id: "t1-25", name: "Term 1", start: "2025-09-01", end: "2025-12-15" },
      { id: "t2-25", name: "Term 2", start: "2026-01-10", end: "2026-04-05" },
      { id: "t3-25", name: "Term 3", start: "2026-04-25", end: "2026-07-20" },
    ],
  },
  {
    id: "ay-2024",
    name: "2024 / 2025",
    active: false,
    terms: [
      { id: "t1-24", name: "Term 1", start: "2024-09-01", end: "2024-12-15" },
      { id: "t2-24", name: "Term 2", start: "2025-01-10", end: "2025-04-05" },
      { id: "t3-24", name: "Term 3", start: "2025-04-25", end: "2025-07-20" },
    ],
  },
];

export const classes: ClassRoom[] = [
  { id: "c-p1", name: "Primary 1", level: 1, capacity: 35, teacherId: "s-002" },
  { id: "c-p2", name: "Primary 2", level: 2, capacity: 35, teacherId: "s-003" },
  { id: "c-p3", name: "Primary 3", level: 3, capacity: 35, teacherId: "s-004" },
  { id: "c-p4", name: "Primary 4", level: 4, capacity: 35, teacherId: "s-005" },
  { id: "c-p5", name: "Primary 5", level: 5, capacity: 35, teacherId: "s-006" },
  { id: "c-p6", name: "Primary 6", level: 6, capacity: 35, teacherId: "s-007" },
];

export const subjects: Subject[] = [
  { id: "sub-eng", name: "English", code: "ENG" },
  { id: "sub-mth", name: "Mathematics", code: "MTH" },
  { id: "sub-sci", name: "Science", code: "SCI" },
  { id: "sub-sst", name: "Social Studies", code: "SST" },
  { id: "sub-rel", name: "Religious Ed", code: "REL" },
  { id: "sub-art", name: "Creative Arts", code: "ART" },
];

export const staff: Staff[] = [
  {
    id: "s-001",
    staffNo: "ST-001",
    name: "Grace Okonkwo",
    email: "grace@school.org",
    phone: "+234 803 111 2200",
    roleId: "headteacher",
    active: true,
    joinedAt: "2019-08-12",
  },
  {
    id: "s-002",
    staffNo: "ST-002",
    name: "Daniel Mensah",
    email: "daniel@school.org",
    phone: "+234 803 111 2201",
    roleId: "teacher",
    classId: "c-p1",
    subjects: ["sub-eng", "sub-mth"],
    active: true,
    joinedAt: "2021-09-01",
  },
  {
    id: "s-003",
    staffNo: "ST-003",
    name: "Amina Yusuf",
    email: "amina@school.org",
    phone: "+234 803 111 2202",
    roleId: "teacher",
    classId: "c-p2",
    subjects: ["sub-mth"],
    active: true,
    joinedAt: "2020-09-01",
  },
  {
    id: "s-004",
    staffNo: "ST-004",
    name: "Peter Achieng",
    email: "peter@school.org",
    phone: "+234 803 111 2203",
    roleId: "teacher",
    classId: "c-p3",
    subjects: ["sub-sci"],
    active: true,
    joinedAt: "2022-01-10",
  },
  {
    id: "s-005",
    staffNo: "ST-005",
    name: "Linda Boateng",
    email: "linda@school.org",
    phone: "+234 803 111 2204",
    roleId: "teacher",
    classId: "c-p4",
    subjects: ["sub-sst", "sub-eng"],
    active: true,
    joinedAt: "2018-09-01",
  },
  {
    id: "s-006",
    staffNo: "ST-006",
    name: "Joseph Wanjiku",
    email: "joseph@school.org",
    phone: "+234 803 111 2205",
    roleId: "teacher",
    classId: "c-p5",
    subjects: ["sub-rel"],
    active: true,
    joinedAt: "2023-09-01",
  },
  {
    id: "s-007",
    staffNo: "ST-007",
    name: "Sarah Adeyemi",
    email: "sarah@school.org",
    phone: "+234 803 111 2206",
    roleId: "teacher",
    classId: "c-p6",
    subjects: ["sub-mth", "sub-sci"],
    active: true,
    joinedAt: "2017-09-01",
  },
  {
    id: "s-008",
    staffNo: "ST-008",
    name: "Michael Otieno",
    email: "michael@school.org",
    phone: "+234 803 111 2207",
    roleId: "bursar",
    active: true,
    joinedAt: "2020-02-01",
  },
  {
    id: "s-009",
    staffNo: "ST-009",
    name: "Esther Nakato",
    email: "esther@school.org",
    phone: "+234 803 111 2208",
    roleId: "receptionist",
    active: true,
    joinedAt: "2024-01-10",
  },
  {
    id: "s-010",
    staffNo: "ST-010",
    name: "Tunde Bello",
    email: "tunde@school.org",
    phone: "+234 803 111 2209",
    roleId: "teacher",
    subjects: ["sub-art"],
    active: false,
    joinedAt: "2016-09-01",
  },
];

const firstNames = [
  "Ada",
  "Ben",
  "Chika",
  "Doris",
  "Emeka",
  "Fatima",
  "Grace",
  "Habiba",
  "Isaac",
  "Joy",
  "Kemi",
  "Lola",
  "Musa",
  "Ngozi",
  "Olu",
  "Priscilla",
  "Quincy",
  "Ridwan",
  "Sade",
  "Tobi",
  "Uche",
  "Victor",
  "Wale",
  "Yetunde",
  "Zainab",
  "Tariq",
  "Hassan",
  "Aminata",
  "Kwame",
  "Akosua",
];
const lastNames = [
  "Okafor",
  "Adeyemi",
  "Mensah",
  "Yusuf",
  "Achieng",
  "Boateng",
  "Wanjiku",
  "Otieno",
  "Nakato",
  "Bello",
  "Eze",
  "Owusu",
  "Diallo",
  "Sesay",
  "Konate",
  "Mwangi",
  "Asante",
  "Mhango",
];

export const students: Student[] = Array.from({ length: 48 }).map((_, i) => {
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[i % lastNames.length];
  const cls = classes[i % classes.length];
  return {
    id: `st-${String(i + 1).padStart(3, "0")}`,
    admissionNo: `ADM/2025/${String(1000 + i)}`,
    firstName: fn,
    lastName: ln,
    gender: i % 2 === 0 ? "F" : "M",
    dob: `${2014 + (i % 6)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
    classId: cls.id,
    status: i === 5 ? "repeating" : i === 11 ? "withdrawn" : i === 17 ? "graduated" : "active",
    enrolledAt: `2024-09-0${(i % 9) + 1}`,
    guardian: {
      name: `${lastNames[(i + 3) % lastNames.length]} Family`,
      phone: `+234 80${i % 10} 555 ${1000 + i}`,
      relation: i % 3 === 0 ? "Mother" : i % 3 === 1 ? "Father" : "Guardian",
      email: `guardian${i}@mail.com`,
    },
    address: `${10 + i} Unity Street, City`,
    photoColor: colors[i % colors.length],
  };
});

// Attendance: today's pseudo data
export function todayAttendance(): AttendanceRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return students
    .filter((s) => s.status === "active")
    .map((s, i) => ({
      studentId: s.id,
      date: today,
      classId: s.classId,
      status: (["Present", "Present", "Present", "Present", "Late", "Absent", "Excused"] as const)[
        i % 7
      ],
    }));
}
