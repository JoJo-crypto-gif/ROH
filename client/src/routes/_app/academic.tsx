import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, BookOpen, Users, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicApi, type ApiAcademicYear, type ApiClassRoom, type ApiSubject } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/academic")({
  head: () => ({ meta: [{ title: "Academic Setup — Lumen Suite" }] }),
  component: AcademicPage,
});

function AcademicPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("years");

  // Auth Gate
  if (!hasPermission(user, "academic.view")) return <Forbidden />;
  const canManage = hasPermission(user, "academic.manage");

  // React Queries
  const { data: yearsData, isLoading: loadingYears } = useQuery({
    queryKey: ["academic-years"],
    queryFn: academicApi.getYears,
  });

  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["classes"],
    queryFn: academicApi.getClasses,
  });

  const { data: subjectsData, isLoading: loadingSubjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: academicApi.getSubjects,
  });

  const { data: teachersData } = useQuery({
    queryKey: ["teachers"],
    queryFn: academicApi.getTeachers,
    enabled: canManage,
  });

  // Query Data Selectors
  const years = yearsData?.years ?? [];
  const classrooms = classesData?.classrooms ?? [];
  const subjects = subjectsData?.subjects ?? [];
  const teachers = teachersData?.teachers ?? [];

  // Mutations
  const createYearMutation = useMutation({
    mutationFn: academicApi.createYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Academic year created successfully");
      setYearModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create academic year"),
  });

  const updateYearMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; startDate?: string; endDate?: string; active?: boolean } }) =>
      academicApi.updateYear(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Academic year updated successfully");
      setYearModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update academic year"),
  });

  const updateTermMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; startDate?: string; endDate?: string; active?: boolean } }) =>
      academicApi.updateTerm(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Term updated successfully");
      setTermModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update term"),
  });

  const deleteYearMutation = useMutation({
    mutationFn: academicApi.deleteYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Academic year deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete academic year"),
  });

  const createClassMutation = useMutation({
    mutationFn: academicApi.createClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Classroom created successfully");
      setClassModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create classroom"),
  });

  const updateClassMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; level?: number; capacity?: number; teacherId?: string | null } }) =>
      academicApi.updateClass(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Classroom updated successfully");
      setClassModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update classroom"),
  });

  const deleteClassMutation = useMutation({
    mutationFn: academicApi.deleteClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Classroom deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete classroom"),
  });

  const createSubjectMutation = useMutation({
    mutationFn: academicApi.createSubject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject created successfully");
      setSubjectModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create subject"),
  });

  const updateSubjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; code?: string; teacherIds?: string[] } }) =>
      academicApi.updateSubject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject updated successfully");
      setSubjectModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update subject"),
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: academicApi.deleteSubject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete subject"),
  });

  const saveClassSubjectsMutation = useMutation({
    mutationFn: ({ classId, data }: { classId: string; data: any }) =>
      academicApi.saveClassroomSubjects(classId, data),
    onSuccess: () => {
      toast.success("Class subjects updated successfully");
      setClassSubjectsModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update class subjects"),
  });

  // Modal States
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [termModalOpen, setTermModalOpen] = useState(false);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [classSubjectsModalOpen, setClassSubjectsModalOpen] = useState(false);

  // Form Fields State
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [yearName, setYearName] = useState("");
  const [yearStartDate, setYearStartDate] = useState("");
  const [yearEndDate, setYearEndDate] = useState("");
  const [yearActive, setYearActive] = useState(false);

  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termName, setTermName] = useState("");
  const [termStartDate, setTermStartDate] = useState("");
  const [termEndDate, setTermEndDate] = useState("");
  const [termActive, setTermActive] = useState(false);

  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [className, setClassName] = useState("");
  const [classLevel, setClassLevel] = useState(1);
  const [classCapacity, setClassCapacity] = useState(35);
  const [classTeacherId, setClassTeacherId] = useState<string>("");

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);

  // Class Subjects State
  const [manageSubjectsClassId, setManageSubjectsClassId] = useState<string | null>(null);
  const [draftClassSubjects, setDraftClassSubjects] = useState<{ subjectId: string; teacherId: string; passMark: number; weight: number }[]>([]);

  const { data: classSubjectsData, isLoading: loadingClassSubjects } = useQuery({
    queryKey: ["class-subjects", manageSubjectsClassId],
    queryFn: () => academicApi.getClassroomSubjects(manageSubjectsClassId!),
    enabled: !!manageSubjectsClassId,
  });

  useEffect(() => {
    if (classSubjectsData?.classSubjects) {
      setDraftClassSubjects(classSubjectsData.classSubjects.map(cs => ({
        subjectId: cs.subjectId,
        teacherId: cs.teacherId || "",
        passMark: cs.passMark,
        weight: cs.weight,
      })));
    } else {
      setDraftClassSubjects([]);
    }
  }, [classSubjectsData, manageSubjectsClassId]);

  // Form Submit Handlers
  const handleYearSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(yearEndDate) <= new Date(yearStartDate)) {
      return toast.error("End date must be after start date");
    }

    if (yearActive) {
      if (!confirm("Are you sure? This will deactivate the current active year and its terms. Proceed?")) return;
    }

    if (editingYearId) {
      updateYearMutation.mutate({ id: editingYearId, data: { name: yearName, startDate: yearStartDate, endDate: yearEndDate, active: yearActive } });
    } else {
      // Auto-generate 3 terms for convenience
      const currentYear = new Date(yearStartDate).getFullYear() || new Date().getFullYear();
      createYearMutation.mutate({
        name: yearName,
        startDate: yearStartDate,
        endDate: yearEndDate,
        active: yearActive,
        terms: [
          { name: "Term 1", startDate: `${currentYear}-09-01`, endDate: `${currentYear}-12-15` },
          { name: "Term 2", startDate: `${currentYear + 1}-01-10`, endDate: `${currentYear + 1}-04-05` },
          { name: "Term 3", startDate: `${currentYear + 1}-04-25`, endDate: `${currentYear + 1}-07-20` },
        ],
      });
    }
  };

  const handleTermSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(termEndDate) <= new Date(termStartDate)) {
      return toast.error("End date must be after start date");
    }

    if (termActive) {
      if (!confirm("Are you sure? This will deactivate the current active term, and make this term's academic year active. Proceed?")) return;
    }

    if (editingTermId) {
      updateTermMutation.mutate({ id: editingTermId, data: { name: termName, startDate: termStartDate, endDate: termEndDate, active: termActive } });
    }
  };

  const handleClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: className,
      level: classLevel,
      capacity: classCapacity,
      teacherId: classTeacherId || null,
    };
    if (editingClassId) {
      updateClassMutation.mutate({ id: editingClassId, data });
    } else {
      createClassMutation.mutate(data);
    }
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: subjectName,
      code: subjectCode.toUpperCase(),
      teacherIds: selectedTeacherIds,
    };
    if (editingSubjectId) {
      updateSubjectMutation.mutate({ id: editingSubjectId, data });
    } else {
      createSubjectMutation.mutate(data);
    }
  };

  const handleTeacherCheckboxChange = (teacherId: string, checked: boolean) => {
    if (checked) {
      setSelectedTeacherIds([...selectedTeacherIds, teacherId]);
    } else {
      setSelectedTeacherIds(selectedTeacherIds.filter((id) => id !== teacherId));
    }
  };

  const isLoading =
    (activeTab === "years" && loadingYears) ||
    (activeTab === "classes" && loadingClasses) ||
    (activeTab === "subjects" && loadingSubjects);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic setup"
        description="Years, terms, classes, subjects and teacher assignments."
        actions={
          canManage ? (
            <div className="flex gap-2">
              {activeTab === "years" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingYearId(null);
                    setYearName("");
                    setYearStartDate("");
                    setYearEndDate("");
                    setYearActive(false);
                    setYearModalOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> New Year
                </Button>
              )}
              {activeTab === "classes" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingClassId(null);
                    setClassName("");
                    setClassLevel(1);
                    setClassCapacity(35);
                    setClassTeacherId("");
                    setClassModalOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> New Class
                </Button>
              )}
              {activeTab === "subjects" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingSubjectId(null);
                    setSubjectName("");
                    setSubjectCode("");
                    setSelectedTeacherIds([]);
                    setSubjectModalOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> New Subject
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="years">Years & Terms</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-brand" />
              <p className="text-sm text-muted-foreground">Loading academic data…</p>
            </div>
          </div>
        ) : (
          <>
            {/* YEARS & TERMS */}
            <TabsContent value="years" className="mt-4 space-y-4">
              {years.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No academic years configured.</div>
              ) : (
                years.map((y) => (
                  <div key={y.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarRange className="h-4 w-4 text-brand" />
                        <h3 className="text-base font-semibold">Academic year {y.name}</h3>
                        {y.active ? (
                          <Badge className="bg-success/20 text-[oklch(0.35_0.1_155)] hover:bg-success/20">Active</Badge>
                        ) : (
                          canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Are you sure? This will deactivate the current active year and its terms. Proceed?")) {
                                  updateYearMutation.mutate({ id: y.id, data: { active: true } });
                                }
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              Make Active
                            </Button>
                          )
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingYearId(y.id);
                              setYearName(y.name);
                              setYearStartDate(y.startDate?.split("T")[0] || "");
                              setYearEndDate(y.endDate?.split("T")[0] || "");
                              setYearActive(y.active);
                              setYearModalOpen(true);
                            }}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                          </Button>
                          {!y.active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete academic year ${y.name}?`)) {
                                  deleteYearMutation.mutate(y.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {y.terms.map((t) => (
                        <div
                          key={t.id}
                          className={`rounded-lg border p-3 relative group ${t.active ? "border-brand/40 bg-brand/5" : "border-border bg-muted/30"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{t.name}</span>
                            {t.active && <Badge className="bg-brand/20 text-brand text-[10px] py-0">Active Term</Badge>}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(t.startDate).toLocaleDateString()} → {new Date(t.endDate).toLocaleDateString()}
                          </div>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 hover:bg-background cursor-pointer"
                              onClick={() => {
                                setEditingTermId(t.id);
                                setTermName(t.name);
                                setTermStartDate(t.startDate.split("T")[0]);
                                setTermEndDate(t.endDate.split("T")[0]);
                                setTermActive(t.active);
                                setTermModalOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* CLASSES */}
            <TabsContent value="classes" className="mt-4">
              {classrooms.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No classrooms configured.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {classrooms.map((c) => {
                    const count = c.studentCount;
                    const percent = Math.min((count / c.capacity) * 100, 100);
                    return (
                      <div key={c.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-base font-semibold">{c.name}</h3>
                            <p className="text-xs text-muted-foreground">Level {c.level} · Capacity {c.capacity}</p>
                          </div>
                          {canManage && (
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs font-medium cursor-pointer"
                                onClick={() => {
                                  setManageSubjectsClassId(c.id);
                                  // The query will fetch data, but we initialize draft locally with an empty array.
                                  // We'll sync draftClassSubjects in a useEffect when query completes.
                                  setClassSubjectsModalOpen(true);
                                }}
                              >
                                Subjects
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 cursor-pointer"
                                onClick={() => {
                                  setEditingClassId(c.id);
                                  setClassName(c.name);
                                  setClassLevel(c.level);
                                  setClassCapacity(c.capacity);
                                  setClassTeacherId(c.teacherId ?? "");
                                  setClassModalOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete classroom ${c.name}?`)) {
                                    deleteClassMutation.mutate(c.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Enrolled</span>
                            <span className="font-medium">{count} / {c.capacity}</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Class teacher</span>
                          <span className="font-medium text-foreground">{c.teacherName}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* SUBJECTS */}
            <TabsContent value="subjects" className="mt-4">
              {subjects.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No subjects configured.</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                        <th className="px-4 py-2.5 text-left font-medium">Code</th>
                        <th className="px-4 py-2.5 text-left font-medium">Teachers</th>
                        {canManage && <th className="px-4 py-2.5"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {subjects.map((sub) => (
                        <tr key={sub.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3 font-medium">
                            <span className="inline-flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-muted-foreground" /> {sub.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{sub.code}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {sub.teachers.map((t) => t.name).join(", ") || "—"}
                          </td>
                          {canManage && (
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 cursor-pointer"
                                  onClick={() => {
                                    setEditingSubjectId(sub.id);
                                    setSubjectName(sub.name);
                                    setSubjectCode(sub.code);
                                    setSelectedTeacherIds(sub.teachers.map((t) => t.id));
                                    setSubjectModalOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete subject ${sub.name}?`)) {
                                      deleteSubjectMutation.mutate(sub.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* ── MODAL DIALOGS ────────────────────────────────────── */}

      {/* Academic Year Dialog */}
      <Dialog open={yearModalOpen} onOpenChange={setYearModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleYearSubmit}>
            <DialogHeader>
              <DialogTitle>{editingYearId ? "Edit Academic Year" : "New Academic Year"}</DialogTitle>
              <DialogDescription>
                Configure the academic year name and active rollover status.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Year Name</label>
                <input
                  value={yearName}
                  onChange={(e) => setYearName(e.target.value)}
                  placeholder="e.g. 2026 / 2027"
                  required
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Start Date</label>
                  <input
                    type="date"
                    value={yearStartDate}
                    onChange={(e) => setYearStartDate(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">End Date</label>
                  <input
                    type="date"
                    value={yearEndDate}
                    onChange={(e) => setYearEndDate(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="yearActive"
                  checked={yearActive}
                  onChange={(e) => setYearActive(e.target.checked)}
                  className="rounded border-input text-brand focus:ring-brand"
                />
                <label htmlFor="yearActive" className="text-xs font-medium text-foreground select-none">
                  Mark as Active Year
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setYearModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingYearId ? "Save Changes" : "Create Academic Year"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Term Dialog */}
      <Dialog open={termModalOpen} onOpenChange={setTermModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleTermSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Term</DialogTitle>
              <DialogDescription>
                Configure the term's date ranges and rollover status.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Term Name</label>
                <input
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  required
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Start Date</label>
                  <input
                    type="date"
                    value={termStartDate}
                    onChange={(e) => setTermStartDate(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">End Date</label>
                  <input
                    type="date"
                    value={termEndDate}
                    onChange={(e) => setTermEndDate(e.target.value)}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="termActive"
                  checked={termActive}
                  onChange={(e) => setTermActive(e.target.checked)}
                  className="rounded border-input text-brand focus:ring-brand"
                />
                <label htmlFor="termActive" className="text-xs font-medium text-foreground select-none">
                  Mark as Active Term
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTermModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Classroom Dialog */}
      <Dialog open={classModalOpen} onOpenChange={setClassModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleClassSubmit}>
            <DialogHeader>
              <DialogTitle>{editingClassId ? "Edit Classroom" : "New Classroom"}</DialogTitle>
              <DialogDescription>
                Define the name, grading level order, student capacity, and class teacher.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Class Name</label>
                <input
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Primary 1"
                  required
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Progression Level</label>
                  <input
                    type="number"
                    value={classLevel}
                    onChange={(e) => setClassLevel(Number(e.target.value))}
                    min={1}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Capacity</label>
                  <input
                    type="number"
                    value={classCapacity}
                    onChange={(e) => setClassCapacity(Number(e.target.value))}
                    min={1}
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Class Teacher</label>
                <select
                  value={classTeacherId}
                  onChange={(e) => setClassTeacherId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring"
                >
                  <option value="">Unassigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.staffNo})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setClassModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingClassId ? "Save Changes" : "Create Classroom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Subject Dialog */}
      <Dialog open={subjectModalOpen} onOpenChange={setSubjectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubjectSubmit}>
            <DialogHeader>
              <DialogTitle>{editingSubjectId ? "Edit Subject" : "New Subject"}</DialogTitle>
              <DialogDescription>
                Provide the subject name, course code, and assign teacher rosters.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-medium text-foreground">Subject Name</label>
                  <input
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    placeholder="e.g. Mathematics"
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Code</label>
                  <input
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value)}
                    placeholder="e.g. MTH"
                    required
                    className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Assign Teachers</label>
                <div className="rounded-lg border border-border bg-card p-3 space-y-2 max-h-40 overflow-y-auto">
                  {teachers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No teachers registered.</p>
                  ) : (
                    teachers.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`tcheck-${t.id}`}
                          checked={selectedTeacherIds.includes(t.id)}
                          onChange={(e) => handleTeacherCheckboxChange(t.id, e.target.checked)}
                          className="rounded border-input text-brand focus:ring-brand"
                        />
                        <label htmlFor={`tcheck-${t.id}`} className="text-xs text-foreground select-none cursor-pointer">
                          {t.name} ({t.staffNo})
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubjectModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingSubjectId ? "Save Changes" : "Create Subject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Class Subjects Dialog */}
      <Dialog open={classSubjectsModalOpen} onOpenChange={setClassSubjectsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Manage Subjects</DialogTitle>
            <DialogDescription>
              Assign subjects and teachers to {classrooms.find(c => c.id === manageSubjectsClassId)?.name}.
            </DialogDescription>
          </DialogHeader>

          {loadingClassSubjects ? (
            <div className="py-10 text-center">Loading subjects...</div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              <div className="space-y-4">
                {draftClassSubjects.map((ds, index) => {
                  const subjectOpts = subjects.filter(s => !draftClassSubjects.some(d => d.subjectId === s.id && d !== ds));
                  const currentSub = subjects.find(s => s.id === ds.subjectId);
                  const teacherOpts = currentSub ? currentSub.teachers : teachers;

                  return (
                    <div key={index} className="flex gap-2 items-start border border-border bg-muted/20 p-3 rounded-lg">
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Subject</label>
                            <select
                              value={ds.subjectId}
                              onChange={e => {
                                const newDrafts = [...draftClassSubjects];
                                newDrafts[index].subjectId = e.target.value;
                                newDrafts[index].teacherId = "";
                                setDraftClassSubjects(newDrafts);
                              }}
                              className="w-full text-sm border border-input bg-card rounded-md h-9 px-2 outline-none"
                            >
                              <option value="">Select subject...</option>
                              {subjectOpts.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Teacher</label>
                            <select
                              value={ds.teacherId}
                              onChange={e => {
                                const newDrafts = [...draftClassSubjects];
                                newDrafts[index].teacherId = e.target.value;
                                setDraftClassSubjects(newDrafts);
                              }}
                              className="w-full text-sm border border-input bg-card rounded-md h-9 px-2 outline-none"
                              disabled={!ds.subjectId}
                            >
                              <option value="">Unassigned</option>
                              {teacherOpts.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Pass Mark</label>
                            <input
                              type="number"
                              min="0" max="100"
                              value={ds.passMark}
                              onChange={e => {
                                const newDrafts = [...draftClassSubjects];
                                newDrafts[index].passMark = Number(e.target.value);
                                setDraftClassSubjects(newDrafts);
                              }}
                              className="w-full text-sm border border-input bg-card rounded-md h-9 px-2 outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Credit Weight</label>
                            <input
                              type="number"
                              min="0" step="0.5"
                              value={ds.weight}
                              onChange={e => {
                                const newDrafts = [...draftClassSubjects];
                                newDrafts[index].weight = Number(e.target.value);
                                setDraftClassSubjects(newDrafts);
                              }}
                              className="w-full text-sm border border-input bg-card rounded-md h-9 px-2 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 w-9 mt-5"
                        onClick={() => {
                          const newDrafts = [...draftClassSubjects];
                          newDrafts.splice(index, 1);
                          setDraftClassSubjects(newDrafts);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() => {
                  setDraftClassSubjects([
                    ...draftClassSubjects,
                    { subjectId: "", teacherId: "", passMark: 50, weight: 1 }
                  ]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Subject to Class
              </Button>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setClassSubjectsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Validate
                if (draftClassSubjects.some(d => !d.subjectId)) {
                  toast.error("Please select a subject for all rows");
                  return;
                }
                saveClassSubjectsMutation.mutate({
                  classId: manageSubjectsClassId!,
                  data: {
                    subjects: draftClassSubjects.map(d => ({
                      subjectId: d.subjectId,
                      teacherId: d.teacherId || null,
                      passMark: d.passMark,
                      weight: d.weight,
                    }))
                  }
                });
              }}
              disabled={loadingClassSubjects || saveClassSubjectsMutation.isPending}
            >
              {saveClassSubjectsMutation.isPending ? "Saving..." : "Save Subjects"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
