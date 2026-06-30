import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Flag,
  GraduationCap,
  Hash,
  HelpCircle,
  Info,
  Lock,
  Percent,
  Plus,
  Save,
  School,
  Settings2,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { academicApi, type ApiAssessmentScheme } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/academic")({
  head: () => ({ meta: [{ title: "Academic setup — Lumen Suite" }] }),
  component: AcademicPage,
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "bg-success/15 text-[oklch(0.35_0.1_155)]";
  if (status === "CLOSED") return "bg-muted text-muted-foreground";
  return "bg-brand/10 text-brand";
}

function AcademicPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, "academic.manage");
  const canView = hasPermission(user, "academic.view");

  const settingsQuery = useQuery({
    queryKey: ["academic-settings"],
    queryFn: academicApi.getSettings,
  });
  const yearsQuery = useQuery({ queryKey: ["academic-years"], queryFn: academicApi.getYears });
  const levelsQuery = useQuery({ queryKey: ["grade-levels"], queryFn: academicApi.getGradeLevels });
  const subjectsQuery = useQuery({ queryKey: ["subjects"], queryFn: academicApi.getSubjects });
  const teachersQuery = useQuery({ queryKey: ["teachers"], queryFn: academicApi.getTeachers });
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data?.years]);
  const levels = useMemo(
    () => levelsQuery.data?.gradeLevels ?? [],
    [levelsQuery.data?.gradeLevels],
  );
  const subjects = useMemo(
    () => subjectsQuery.data?.subjects ?? [],
    [subjectsQuery.data?.subjects],
  );
  const teachers = useMemo(
    () => teachersQuery.data?.teachers ?? [],
    [teachersQuery.data?.teachers],
  );

  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  useEffect(() => {
    if (!selectedYearId && years.length)
      setSelectedYearId(
        (
          years.find((year) => year.status === "DRAFT") ??
          years.find((year) => year.status === "ACTIVE") ??
          years[0]
        ).id,
      );
  }, [years, selectedYearId]);
  useEffect(() => {
    if (!selectedLevelId && levels.length) setSelectedLevelId(levels[0].id);
  }, [levels, selectedLevelId]);

  const sectionsQuery = useQuery({
    queryKey: ["sections", selectedYearId],
    queryFn: () => academicApi.getClasses(selectedYearId),
    enabled: !!selectedYearId,
  });
  const curriculumQuery = useQuery({
    queryKey: ["curriculum", selectedYearId, selectedLevelId],
    queryFn: () => academicApi.getCurriculum(selectedYearId, selectedLevelId),
    enabled: !!selectedYearId && !!selectedLevelId,
  });
  const schemeQuery = useQuery({
    queryKey: ["assessment-scheme", selectedYearId],
    queryFn: () => academicApi.getAssessmentScheme(selectedYearId),
    enabled: !!selectedYearId,
  });
  const selectedYear = years.find((year) => year.id === selectedYearId);
  const isDraft = selectedYear?.status === "DRAFT";

  const invalidateSetup = () => {
    queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    queryClient.invalidateQueries({ queryKey: ["sections"] });
    queryClient.invalidateQueries({ queryKey: ["curriculum"] });
    queryClient.invalidateQueries({ queryKey: ["assessment-scheme"] });
  };

  if (!canView) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic foundation"
        description="Configure progression, yearly class streams, curriculum, terms and assessment rules."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-56">
          <label className="text-xs font-medium text-muted-foreground">Working academic year</label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedYearId}
            onChange={(event) => setSelectedYearId(event.target.value)}
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name} — {year.status}
              </option>
            ))}
          </select>
        </div>
        {selectedYear && (
          <Badge className={statusTone(selectedYear.status)}>
            {selectedYear.termCount} terms · {selectedYear.status}
          </Badge>
        )}
        {selectedYear?.status === "ACTIVE" && (
          <p className="text-xs text-muted-foreground">
            Year structure is locked. Class-teacher assignments remain editable.
          </p>
        )}
        {selectedYear?.status === "CLOSED" && (
          <p className="text-xs text-muted-foreground">
            Historical structure is read-only. Select a draft or active year.
          </p>
        )}
      </div>

      <Tabs defaultValue="years">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="years">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Years & terms
          </TabsTrigger>
          <TabsTrigger value="levels">
            <GraduationCap className="mr-1.5 h-4 w-4" />
            Grade levels
          </TabsTrigger>
          <TabsTrigger value="sections">
            <School className="mr-1.5 h-4 w-4" />
            Class streams
          </TabsTrigger>
          <TabsTrigger value="subjects">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Subjects
          </TabsTrigger>
          <TabsTrigger value="curriculum">
            <Check className="mr-1.5 h-4 w-4" />
            Curriculum
          </TabsTrigger>
          <TabsTrigger value="assessment">
            <Settings2 className="mr-1.5 h-4 w-4" />
            Assessment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="mt-4">
          <YearsPanel
            canManage={canManage}
            years={years}
            defaultTermCount={settingsQuery.data?.settings.defaultTermCount ?? 3}
            invalidate={invalidateSetup}
          />
        </TabsContent>
        <TabsContent value="levels" className="mt-4">
          <LevelsPanel
            canManage={canManage}
            levels={levels}
            refresh={() => queryClient.invalidateQueries({ queryKey: ["grade-levels"] })}
          />
        </TabsContent>
        <TabsContent value="sections" className="mt-4">
          <SectionsPanel
            canManage={canManage && isDraft}
            canAssign={canManage && selectedYear?.status !== "CLOSED"}
            yearId={selectedYearId}
            sections={sectionsQuery.data?.sections ?? []}
            levels={levels}
            teachers={teachers}
            refresh={() =>
              queryClient.invalidateQueries({ queryKey: ["sections", selectedYearId] })
            }
          />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <SubjectsPanel
            canManage={canManage}
            subjects={subjects}
            refresh={() => queryClient.invalidateQueries({ queryKey: ["subjects"] })}
          />
        </TabsContent>
        <TabsContent value="curriculum" className="mt-4">
          <CurriculumPanel
            canManage={canManage && isDraft}
            yearId={selectedYearId}
            levelId={selectedLevelId}
            setLevelId={setSelectedLevelId}
            levels={levels}
            subjects={subjects}
            current={curriculumQuery.data?.curriculum ?? []}
            refresh={() =>
              queryClient.invalidateQueries({
                queryKey: ["curriculum", selectedYearId, selectedLevelId],
              })
            }
          />
        </TabsContent>
        <TabsContent value="assessment" className="mt-4">
          <AssessmentPanel
            canManage={canManage && isDraft}
            yearId={selectedYearId}
            scheme={schemeQuery.data?.scheme ?? null}
            refresh={() =>
              queryClient.invalidateQueries({ queryKey: ["assessment-scheme", selectedYearId] })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function YearsPanel({
  canManage,
  years,
  defaultTermCount,
  invalidate,
}: {
  canManage: boolean;
  years: Awaited<ReturnType<typeof academicApi.getYears>>["years"];
  defaultTermCount: number;
  invalidate: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [termCount, setTermCount] = useState(defaultTermCount);
  const [termDates, setTermDates] = useState<{ startDate: string; endDate: string }[]>(
    Array.from({ length: defaultTermCount }, () => ({ startDate: "", endDate: "" })),
  );
  useEffect(() => {
    setTermCount(defaultTermCount);
    setTermDates(Array.from({ length: defaultTermCount }, () => ({ startDate: "", endDate: "" })));
  }, [defaultTermCount]);
  const setCount = (count: number) => {
    setTermCount(count);
    setTermDates((current) =>
      Array.from({ length: count }, (_, index) => current[index] ?? { startDate: "", endDate: "" }),
    );
  };
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.createYear({ name, startDate, endDate, termCount, terms: termDates }),
    onSuccess: () => {
      toast.success("Draft academic year created");
      setName("");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const settingsMutation = useMutation({
    mutationFn: (count: number) => academicApi.updateSettings({ defaultTermCount: count }),
    onSuccess: () => {
      toast.success("Default term count updated");
      queryClient.invalidateQueries({ queryKey: ["academic-settings"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: async ({
      type,
      id,
      termStatus,
    }: {
      type: string;
      id: string;
      termStatus?: "ACTIVE" | "CLOSED";
    }) => {
      if (type === "activate") await academicApi.activateYear(id);
      else if (type === "close") await academicApi.closeYear(id);
      else await academicApi.transitionTerm(id, termStatus!);
    },
    onSuccess: () => {
      toast.success("Academic lifecycle updated");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const copyMutation = useMutation({
    mutationFn: ({ targetYearId, sourceYearId }: { targetYearId: string; sourceYearId: string }) =>
      academicApi.copyYearStructure(targetYearId, { sourceYearId }),
    onSuccess: () => {
      toast.success("Sections, curriculum and assessment scheme copied");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <TooltipProvider>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="flex items-center gap-2 pb-3 border-b border-border/60">
            <Sparkles className="h-5 w-5 text-brand" />
            <h3 className="font-semibold text-foreground">Create draft year</h3>
          </div>
          
          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Academic Year Name</label>
              <Input
                placeholder="e.g., 2027 / 2028"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canManage}
                className="h-9 transition-all duration-300 focus-visible:ring-brand"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                Year Duration
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={!canManage}
                  className="h-9 text-xs transition-all duration-300 focus-visible:ring-brand"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={!canManage}
                  className="h-9 text-xs transition-all duration-300 focus-visible:ring-brand"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Terms in this year</label>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 border border-border/50">
                {[1, 2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={cn(
                      "rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                      termCount === count
                        ? "bg-card text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                    )}
                    onClick={() => setCount(count)}
                    disabled={!canManage}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-3 mt-4 pt-4 border-t border-border/50">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider">Configure Term Intervals</div>
              {termDates.map((term, index) => (
                <div
                  key={index}
                  className="relative rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:border-brand/30 hover:shadow-sm animate-in fade-in-50 slide-in-from-bottom-2 duration-200"
                >
                  <div className="absolute top-0 bottom-0 left-0 w-1 rounded-l-xl bg-brand/40" />
                  
                  <div className="pl-1">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Term {index + 1}</span>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Dates</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider block">Start</span>
                        <Input
                          type="date"
                          value={term.startDate}
                          onChange={(event) =>
                            setTermDates((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, startDate: event.target.value } : item,
                              ),
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider block">End</span>
                        <Input
                          type="date"
                          value={term.endDate}
                          onChange={(event) =>
                            setTermDates((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, endDate: event.target.value } : item,
                              ),
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <Button
              className="w-full mt-4 h-10 transition-all duration-300 font-semibold flex items-center justify-center gap-1.5"
              onClick={() => mutation.mutate()}
              disabled={
                !canManage ||
                mutation.isPending ||
                !name ||
                !startDate ||
                !endDate ||
                termDates.some((term) => !term.startDate || !term.endDate)
              }
            >
              <Plus className="h-4 w-4" />
              Create draft
            </Button>
          </div>
          
          <div className="mt-6 border-t border-border/60 pt-4 space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              Default terms for future years
            </label>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 border border-border/50">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                    defaultTermCount === count
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                  )}
                  onClick={() => settingsMutation.mutate(count)}
                  disabled={!canManage || settingsMutation.isPending}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </section>
        
        <section className="space-y-4">
          {years.map((year) => {
            const copySource =
              years.find((candidate) => candidate.id !== year.id && candidate.status !== "DRAFT") ??
              years.find((candidate) => candidate.id !== year.id);
            return (
              <div key={year.id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg tracking-tight text-foreground">{year.name}</h3>
                      <Badge className={cn("px-2.5 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1.5 border-0", statusTone(year.status))}>
                        <span className={cn("h-1.5 w-1.5 rounded-full",
                          year.status === "ACTIVE" ? "bg-emerald-500 animate-pulse" :
                          year.status === "DRAFT" ? "bg-amber-500" :
                          "bg-muted-foreground"
                        )} />
                        {year.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/75" />
                      <span>{year.startDate.slice(0, 10)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      <span>{year.endDate.slice(0, 10)}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{year.termCount} {year.termCount === 1 ? "term" : "terms"}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {year.status === "DRAFT" && copySource && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copyMutation.mutate({ targetYearId: year.id, sourceYearId: copySource.id })
                            }
                            disabled={!canManage}
                            className="h-8 text-xs gap-1.5"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy {copySource.name}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Copy class streams, curriculum & assessment settings from {copySource.name}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {year.status === "DRAFT" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            onClick={() => actionMutation.mutate({ type: "activate", id: year.id })}
                            disabled={!canManage}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white border-0 shadow-sm gap-1.5 px-3"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Activate
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Activate this draft year to make it the active calendar
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {year.status === "ACTIVE" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actionMutation.mutate({ type: "close", id: year.id })}
                            disabled={!canManage}
                            className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 gap-1.5"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Close Year
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Permanently close this academic year and all of its terms
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                
                <div className="relative mt-5">
                  {/* Connecting horizontal line for timeline on medium/large screens */}
                  <div className="absolute top-[28px] left-[5%] right-[5%] h-0.5 bg-border/80 z-0 hidden md:block" />
                  
                  <div className="relative z-10 grid gap-4 md:grid-cols-3">
                    {year.terms.map((term, tIdx) => {
                      const isClosed = term.status === "CLOSED";
                      const isActive = term.status === "ACTIVE";
                      
                      return (
                        <div
                          key={term.id}
                          className={cn(
                            "relative rounded-xl border bg-card p-4 transition-all duration-300 hover:shadow-md",
                            isActive ? "border-emerald-500/30 shadow-sm shadow-emerald-500/5 ring-1 ring-emerald-500/10" :
                            isClosed ? "border-border/60 opacity-85 hover:opacity-100" :
                            "border-border"
                          )}
                        >
                          {/* Timeline circle and name */}
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-4 ring-background z-10",
                                isClosed ? "bg-muted text-muted-foreground" :
                                isActive ? "bg-emerald-500 text-white animate-pulse" :
                                "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                              )}>
                                {tIdx + 1}
                              </span>
                              <span className="text-sm font-semibold text-foreground">{term.name}</span>
                            </div>
                            
                            <Badge className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase border-0",
                              isClosed ? "bg-muted text-muted-foreground" :
                              isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" :
                              "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            )}>
                              {term.status}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <span>{term.startDate.slice(0, 10)}</span>
                            <span className="text-muted-foreground/30">→</span>
                            <span>{term.endDate.slice(0, 10)}</span>
                          </div>
                          
                          {year.status === "ACTIVE" && (
                            <div className="mt-4 pt-3 border-t border-border/50">
                              {term.status === "ACTIVE" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        actionMutation.mutate({
                                          type: "term",
                                          id: term.id,
                                          termStatus: "CLOSED",
                                        })
                                      }
                                      disabled={!canManage}
                                      className="w-full h-8 text-xs gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all"
                                    >
                                      <Lock className="h-3.5 w-3.5" />
                                      Close term
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Close this term to freeze all student grade modifications
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {term.status === "PENDING" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        actionMutation.mutate({
                                          type: "term",
                                          id: term.id,
                                          termStatus: "ACTIVE",
                                        })
                                      }
                                      disabled={!canManage}
                                      className="w-full h-8 text-xs gap-1.5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Activate term
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Make this term active to begin grade entry and attendance
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </TooltipProvider>
  );
}

function LevelsPanel({
  canManage,
  levels,
  refresh,
}: {
  canManage: boolean;
  levels: Awaited<ReturnType<typeof academicApi.getGradeLevels>>["gradeLevels"];
  refresh: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", order: levels.length + 1 });
  const createMutation = useMutation({
    mutationFn: () =>
      academicApi.createGradeLevel({ ...form, nextGradeLevelId: null, isFinal: false }),
    onSuccess: () => {
      toast.success("Grade level created");
      setForm({ name: "", code: "", order: levels.length + 2 });
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { nextGradeLevelId?: string | null; isFinal?: boolean };
    }) => academicApi.updateGradeLevel(id, data),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const sortedLevels = [...levels].sort((a, b) => a.order - b.order);

  return (
    <TooltipProvider>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Sidebar form ── */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <GraduationCap className="h-5 w-5 text-brand" />
            <h3 className="font-semibold text-foreground">Add grade level</h3>
          </div>

          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Level Name</label>
              <Input
                placeholder="e.g. Grade 1, JSS 1, Form 1"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                disabled={!canManage}
                className="h-9 transition-all duration-200 focus-visible:ring-brand"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Short Code</label>
              <Input
                placeholder="e.g. G1, JSS1"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                disabled={!canManage}
                className="h-9 transition-all duration-200 focus-visible:ring-brand"
              />
              <p className="text-[10px] text-muted-foreground">Used in reports and class labels</p>
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Hash className="h-3 w-3" />
                Sort Order
              </label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    type="number"
                    min={1}
                    value={form.order}
                    onChange={(event) => setForm({ ...form, order: Number(event.target.value) })}
                    disabled={!canManage}
                    className="h-9 w-24 transition-all duration-200 focus-visible:ring-brand"
                  />
                </TooltipTrigger>
                <TooltipContent>Lower numbers appear higher in the progression chain</TooltipContent>
              </Tooltip>
            </div>

            <Button
              className="mt-2 h-10 w-full gap-1.5 font-semibold transition-all duration-300"
              disabled={!canManage || !form.name || !form.code || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Plus className="h-4 w-4" />
              Add level
            </Button>
          </div>

          <p className="mt-5 border-t border-border/50 pt-4 text-[11px] leading-relaxed text-muted-foreground">
            Grade levels define the academic progression path for students. Set the next level and
            mark the final level to complete the chain.
          </p>
        </section>

        {/* ── Levels progression list ── */}
        <section className="space-y-0">
          {sortedLevels.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
              <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No grade levels yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Add your first level using the form on the left.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical progression spine */}
              {sortedLevels.length > 1 && (
                <div className="absolute left-[27px] top-10 bottom-10 w-0.5 bg-border/60 z-0" />
              )}

              <div className="relative z-10 space-y-3">
                {sortedLevels.map((level, idx) => {
                  const nextLevel = levels.find((l) => l.id === level.nextGradeLevelId);
                  const isFirst = idx === 0;

                  return (
                    <div
                      key={level.id}
                      className={cn(
                        "group relative flex gap-4 rounded-xl border bg-card p-4 transition-all duration-300 hover:shadow-md",
                        level.isFinal
                          ? "border-amber-500/25 bg-amber-500/5 hover:border-amber-500/40"
                          : isFirst
                            ? "border-brand/20 hover:border-brand/35"
                            : "border-border hover:border-border/80",
                      )}
                    >
                      {/* Order badge (sits on the spine) */}
                      <div className="flex-shrink-0">
                        <span
                          className={cn(
                            "flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full text-lg font-bold ring-4 ring-background transition-all duration-300 group-hover:scale-105",
                            level.isFinal
                              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              : isFirst
                                ? "bg-brand/15 text-brand"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {level.order}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-3">
                        {/* Name row */}
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-foreground">{level.name}</span>
                          <Badge
                            variant="outline"
                            className="rounded-full px-2 py-0 text-[10px] font-medium text-muted-foreground"
                          >
                            {level.code}
                          </Badge>
                          {level.isFinal && (
                            <Badge className="ml-auto gap-1 rounded-full border-0 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              <Flag className="h-2.5 w-2.5" />
                              Final level
                            </Badge>
                          )}
                        </div>

                        {/* Controls row */}
                        <div className="flex flex-wrap items-center gap-4">
                          {/* Next level select */}
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                            <span className="text-xs text-muted-foreground">Promotes to</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Select
                                    value={level.nextGradeLevelId ?? ""}
                                    disabled={!canManage || level.isFinal}
                                    onValueChange={(value) =>
                                      updateMutation.mutate({
                                        id: level.id,
                                        data: { nextGradeLevelId: value === "none" ? null : value },
                                      })
                                    }
                                  >
                                    <SelectTrigger
                                      className={cn(
                                        "h-7 w-36 text-xs",
                                        level.isFinal && "opacity-40",
                                      )}
                                    >
                                      <SelectValue placeholder="None" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none" className="text-xs">
                                        None
                                      </SelectItem>
                                      {levels
                                        .filter((item) => item.id !== level.id)
                                        .sort((a, b) => a.order - b.order)
                                        .map((item) => (
                                          <SelectItem key={item.id} value={item.id} className="text-xs">
                                            {item.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                The grade a student automatically promotes to after completing this level
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {/* Separator */}
                          <div className="h-4 w-px bg-border/60" />

                          {/* Final level switch */}
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`final-${level.id}`}
                                    checked={level.isFinal}
                                    disabled={!canManage}
                                    onCheckedChange={(checked) =>
                                      updateMutation.mutate({
                                        id: level.id,
                                        data: {
                                          isFinal: checked,
                                          nextGradeLevelId: checked ? null : level.nextGradeLevelId,
                                        },
                                      })
                                    }
                                    className="data-[state=checked]:bg-amber-500"
                                  />
                                  <label
                                    htmlFor={`final-${level.id}`}
                                    className="cursor-pointer select-none text-xs text-muted-foreground"
                                  >
                                    Final level
                                  </label>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Mark as the terminal grade — no automatic promotion applies
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        {/* Next level preview pill */}
                        {nextLevel && !level.isFinal && (
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Next: {nextLevel.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </TooltipProvider>
  );
}

function SectionsPanel({
  canManage,
  canAssign,
  yearId,
  sections,
  levels,
  teachers,
  refresh,
}: {
  canManage: boolean;
  canAssign: boolean;
  yearId: string;
  sections: Awaited<ReturnType<typeof academicApi.getClasses>>["sections"];
  levels: Awaited<ReturnType<typeof academicApi.getGradeLevels>>["gradeLevels"];
  teachers: { id: string; name: string }[];
  refresh: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    gradeLevelId: "",
    capacity: 35,
    classTeacherId: "",
  });
  useEffect(() => {
    if (!form.gradeLevelId && levels.length)
      setForm((value) => ({ ...value, gradeLevelId: levels[0].id }));
  }, [levels, form.gradeLevelId]);
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.createClass({
        academicYearId: yearId,
        ...form,
        classTeacherId: form.classTeacherId || null,
      }),
    onSuccess: () => {
      toast.success("Class stream created");
      setForm((value) => ({ ...value, name: "" }));
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const assignmentMutation = useMutation({
    mutationFn: ({ id, classTeacherId }: { id: string; classTeacherId: string | null }) =>
      academicApi.updateClass(id, { classTeacherId }),
    onSuccess: () => {
      toast.success("Class teacher updated");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Group sections by grade level name
  const grouped = sections.reduce(
    (acc, section) => {
      const key = section.gradeLevelName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(section);
      return acc;
    },
    {} as Record<string, typeof sections>,
  );
  const groupEntries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  const activelevels = levels.filter((l) => l.active);

  const [formOpen, setFormOpen] = useState(true);

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* ── Collapsible add stream form ── */}
        <Collapsible open={formOpen} onOpenChange={setFormOpen}>
          <section className="rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between p-5"
              >
                <div className="flex items-center gap-2">
                  <School className="h-5 w-5 text-brand" />
                  <h3 className="font-semibold text-foreground">Add class stream</h3>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    formOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="border-t border-border/60 px-5 pb-5 pt-4">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_130px_1fr_auto]">
                  {/* Stream name */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Stream Name</label>
                    <Input
                      placeholder="e.g. Basic 1 A"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      disabled={!canManage}
                      className="h-9 transition-all duration-200 focus-visible:ring-brand"
                    />
                  </div>

                  {/* Grade level */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Grade Level</label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Select
                            value={form.gradeLevelId}
                            disabled={!canManage}
                            onValueChange={(value) => setForm({ ...form, gradeLevelId: value })}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent>
                              {activelevels.map((level) => (
                                <SelectItem key={level.id} value={level.id}>
                                  {level.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>The grade level this stream belongs to</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Capacity */}
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Users className="h-3 w-3" /> Capacity
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          type="number"
                          min={1}
                          value={form.capacity}
                          onChange={(event) =>
                            setForm({ ...form, capacity: Number(event.target.value) })
                          }
                          disabled={!canManage}
                          className="h-9 transition-all duration-200 focus-visible:ring-brand"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Maximum number of students that can enrol in this stream</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Class teacher */}
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <User className="h-3 w-3" /> Class Teacher
                      <span className="ml-1 text-[10px] text-muted-foreground/60">(optional)</span>
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Select
                            value={form.classTeacherId}
                            disabled={!canManage}
                            onValueChange={(value) => setForm({ ...form, classTeacherId: value })}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {teachers.map((teacher) => (
                                <SelectItem key={teacher.id} value={teacher.id}>
                                  {teacher.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>You can assign or change a teacher later from each class card</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Add button */}
                  <div className="flex items-end">
                    <Button
                      className="h-9 w-full gap-1.5 font-semibold"
                      disabled={!canManage || !yearId || !form.name || mutation.isPending}
                      onClick={() => mutation.mutate()}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>

        {/* ── Grouped stream cards ── */}
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
            <School className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No class streams yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Use the form above to add the first stream for this academic year.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupEntries.map(([gradeLevelName, groupSections]) => (
              <div key={gradeLevelName}>
                {/* Group header */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-brand" />
                    <h4 className="text-sm font-semibold text-foreground">{gradeLevelName}</h4>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {groupSections.length} {groupSections.length === 1 ? "stream" : "streams"}
                  </Badge>
                  <div className="flex-1 border-t border-border/50" />
                </div>

                {/* Stream cards grid */}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupSections.map((section) => {
                    const fillPct = Math.min(
                      100,
                      Math.round((section.studentCount / section.capacity) * 100),
                    );
                    const isFull = fillPct >= 100;
                    const isNearFull = fillPct >= 80 && !isFull;
                    const barColor = isFull
                      ? "bg-destructive"
                      : isNearFull
                        ? "bg-amber-500"
                        : "bg-emerald-500";
                    const hasTeacher = !!section.teacherId;

                    return (
                      <div
                        key={section.id}
                        className="group rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:border-brand/25 hover:shadow-md"
                      >
                        {/* Card header */}
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-foreground leading-tight">
                              {section.name}
                            </h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {section.gradeLevelName}
                            </p>
                          </div>
                          {isFull && (
                            <Badge className="shrink-0 rounded-full border-0 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              Full
                            </Badge>
                          )}
                        </div>

                        {/* Capacity bar */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                              <Users className="h-3 w-3" />
                              Capacity
                            </span>
                            <span
                              className={cn(
                                "text-xs font-semibold tabular-nums",
                                isFull
                                  ? "text-destructive"
                                  : isNearFull
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground",
                              )}
                            >
                              {section.studentCount} / {section.capacity}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                barColor,
                              )}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Teacher assignment */}
                        <div className="mt-4 border-t border-border/50 pt-3">
                          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <User className="h-3 w-3" />
                            Class Teacher
                            {!hasTeacher && (
                              <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-amber-600 dark:text-amber-400 normal-case tracking-normal">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Unassigned
                              </span>
                            )}
                          </label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Select
                                  value={section.teacherId ?? ""}
                                  disabled={!canAssign || assignmentMutation.isPending}
                                  onValueChange={(value) =>
                                    assignmentMutation.mutate({
                                      id: section.id,
                                      classTeacherId: value === "none" ? null : value,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-full text-xs">
                                    <SelectValue placeholder="Assign teacher" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none" className="text-xs text-muted-foreground">
                                      Unassigned
                                    </SelectItem>
                                    {teachers.map((teacher) => (
                                      <SelectItem
                                        key={teacher.id}
                                        value={teacher.id}
                                        className="text-xs"
                                      >
                                        {teacher.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              Assign a class teacher responsible for this stream
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function SubjectsPanel({
  canManage,
  subjects,
  refresh,
}: {
  canManage: boolean;
  subjects: Awaited<ReturnType<typeof academicApi.getSubjects>>["subjects"];
  refresh: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [formOpen, setFormOpen] = useState(true);

  const createMutation = useMutation({
    mutationFn: () => academicApi.createSubject(form),
    onSuccess: () => {
      toast.success("Subject created");
      setForm({ name: "", code: "", description: "" });
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: academicApi.deleteSubject,
    onSuccess: () => {
      toast.success("Subject archived");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => academicApi.updateSubject(id, { active: true }),
    onSuccess: () => {
      toast.success("Subject reactivated");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Group active vs archived
  const activeSubjects = subjects.filter((s) => s.active);
  const archivedSubjects = subjects.filter((s) => !s.active);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ── Collapsible add subject form ── */}
        <Collapsible open={formOpen} onOpenChange={setFormOpen}>
          <section className="rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between p-5"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-brand" />
                  <h3 className="font-semibold text-foreground">Add new subject</h3>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    formOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="border-t border-border/60 px-5 pb-5 pt-4">
                <div className="grid gap-4 md:grid-cols-[2fr_1fr_2fr_auto]">
                  {/* Subject name */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Subject Name</label>
                    <Input
                      placeholder="e.g. Mathematics, English Literature"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      disabled={!canManage}
                      className="h-9 transition-all duration-200 focus-visible:ring-brand"
                    />
                  </div>

                  {/* Code */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Code</label>
                    <Input
                      placeholder="e.g. MATH, ENG"
                      value={form.code}
                      onChange={(event) => setForm({ ...form, code: event.target.value })}
                      disabled={!canManage}
                      className="h-9 transition-all duration-200 focus-visible:ring-brand"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Description <span className="text-[10px] text-muted-foreground/60">(optional)</span>
                    </label>
                    <Input
                      placeholder="Brief details about the subject curriculum"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      disabled={!canManage}
                      className="h-9 transition-all duration-200 focus-visible:ring-brand"
                    />
                  </div>

                  {/* Add button */}
                  <div className="flex items-end">
                    <Button
                      className="h-9 w-full gap-1.5 font-semibold"
                      disabled={!canManage || !form.name || !form.code || createMutation.isPending}
                      onClick={() => createMutation.mutate()}
                    >
                      <Plus className="h-4 w-4" />
                      Add Subject
                    </Button>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>

        {/* ── Subjects Sections ── */}
        {subjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No subjects yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Create your first subject using the form above.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Subjects */}
            {activeSubjects.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">Active Subjects</h4>
                  <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                    {activeSubjects.length}
                  </Badge>
                  <div className="flex-1 border-t border-border/50" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {activeSubjects.map((subject) => (
                    <div
                      key={subject.id}
                      className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:border-brand/25 hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground group-hover:text-brand transition-colors duration-200">
                            {subject.name}
                          </h3>
                          <Badge className="shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full font-semibold text-[10px] uppercase py-0.5">
                            {subject.code}
                          </Badge>
                        </div>
                        {subject.description ? (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                            {subject.description}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground/50 italic">
                            No description provided.
                          </p>
                        )}
                      </div>

                      {canManage && (
                        <div className="mt-4 flex items-center justify-end border-t border-border/40 pt-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                                onClick={() => archiveMutation.mutate(subject.id)}
                                disabled={archiveMutation.isPending}
                              >
                                <Archive className="h-3.5 w-3.5" />
                                Archive
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Archive this subject to hide it from curriculum setup
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archived Subjects */}
            {archivedSubjects.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Archived Subjects</h4>
                  <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                    {archivedSubjects.length}
                  </Badge>
                  <div className="flex-1 border-t border-border/50" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {archivedSubjects.map((subject) => (
                    <div
                      key={subject.id}
                      className="group relative flex flex-col justify-between rounded-xl border border-dashed border-border bg-card/65 p-4 opacity-80"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-muted-foreground">
                            {subject.name}
                          </h3>
                          <Badge variant="outline" className="shrink-0 rounded-full font-semibold text-[10px] uppercase py-0.5">
                            {subject.code}
                          </Badge>
                        </div>
                        {subject.description && (
                          <p className="mt-2 text-xs text-muted-foreground/70">
                            {subject.description}
                          </p>
                        )}
                      </div>

                      {canManage && (
                        <div className="mt-4 flex items-center justify-end border-t border-border/40 pt-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-brand hover:bg-brand/15 hover:text-brand gap-1.5"
                                onClick={() => activateMutation.mutate(subject.id)}
                                disabled={activateMutation.isPending}
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Reactivate
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Reactivate this subject to make it available for grade setup
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function CurriculumPanel({
  canManage,
  yearId,
  levelId,
  setLevelId,
  levels,
  subjects,
  current,
  refresh,
}: {
  canManage: boolean;
  yearId: string;
  levelId: string;
  setLevelId: (id: string) => void;
  levels: Awaited<ReturnType<typeof academicApi.getGradeLevels>>["gradeLevels"];
  subjects: Awaited<ReturnType<typeof academicApi.getSubjects>>["subjects"];
  current: { subjectId: string; passMark: number; sortOrder: number }[];
  refresh: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, { passMark: number; sortOrder: number }>>(
    {},
  );
  useEffect(() => {
    setSelected(
      Object.fromEntries(
        current.map((item) => [
          item.subjectId,
          { passMark: item.passMark, sortOrder: item.sortOrder },
        ]),
      ),
    );
  }, [current]);

  const mutation = useMutation({
    mutationFn: () =>
      academicApi.saveCurriculum(
        yearId,
        levelId,
        Object.entries(selected).map(([subjectId, value]) => ({ subjectId, ...value })),
      ),
    onSuccess: () => {
      toast.success("Curriculum saved");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const activeSubjects = subjects.filter((subject) => subject.active);

  return (
    <TooltipProvider>
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md">
        {/* Header toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Grade Level
              </label>
              <Select value={levelId} onValueChange={setLevelId}>
                <SelectTrigger className="h-9 w-56 text-sm">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="hidden text-xs text-muted-foreground md:block pt-4">
              Configure which subjects are taught at this grade level and define their pass criteria.
            </p>
          </div>

          <div className="pt-4 md:pt-0">
            <Button
              disabled={!canManage || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="gap-1.5 font-semibold"
            >
              <Save className="h-4 w-4" />
              Save Curriculum
            </Button>
          </div>
        </div>

        {/* Subjects list grid */}
        {activeSubjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No active subjects available</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Please activate or add subjects under the "Subjects" tab first.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {activeSubjects.map((subject, index) => {
              const value = selected[subject.id];
              const isChecked = !!value;

              return (
                <div
                  key={subject.id}
                  onClick={() => {
                    if (!canManage) return;
                    setSelected((state) => {
                      const next = { ...state };
                      if (!isChecked) {
                        next[subject.id] = { passMark: 50, sortOrder: index + 1 };
                      } else {
                        delete next[subject.id];
                      }
                      return next;
                    });
                  }}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all duration-300 select-none",
                    isChecked
                      ? "border-brand bg-brand/5 shadow-sm"
                      : "border-border bg-card hover:border-border/80 hover:shadow-sm",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!canManage}
                      onChange={() => {}} // click handler on div handles it
                      className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand cursor-pointer mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <span className="text-sm font-semibold text-foreground">{subject.name}</span>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {subject.code}
                      </p>
                    </div>
                  </div>

                  {isChecked && (
                    <div
                      className="mt-4 flex items-center justify-between border-t border-brand/20 pt-3"
                      onClick={(e) => e.stopPropagation()} // prevent toggle off
                    >
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Percent className="h-3.5 w-3.5 text-muted-foreground/60" /> Pass mark
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-16 text-center font-semibold text-xs transition-all duration-200 focus-visible:ring-brand"
                          type="number"
                          min={0}
                          max={100}
                          value={value.passMark}
                          onChange={(event) =>
                            setSelected((state) => ({
                              ...state,
                              [subject.id]: { ...value, passMark: Number(event.target.value) },
                            }))
                          }
                          disabled={!canManage}
                        />
                        <span className="text-xs font-semibold text-muted-foreground/75">%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}

const defaultScheme: Omit<ApiAssessmentScheme, "id" | "locked"> = {
  name: "40/60 Standard Assessment",
  components: [
    { name: "Class Score", code: "CLASS_SCORE", maxScore: 40, sequence: 1 },
    { name: "Exam", code: "EXAM", maxScore: 60, sequence: 2 },
  ],
  gradeBands: [
    { minScore: 80, maxScore: 100, grade: "A", remark: "Excellent" },
    { minScore: 70, maxScore: 79.99, grade: "B", remark: "Very Good" },
    { minScore: 60, maxScore: 69.99, grade: "C", remark: "Good" },
    { minScore: 50, maxScore: 59.99, grade: "D", remark: "Pass" },
    { minScore: 0, maxScore: 49.99, grade: "F", remark: "Needs Improvement" },
  ],
};

function AssessmentPanel({
  canManage,
  yearId,
  scheme,
  refresh,
}: {
  canManage: boolean;
  yearId: string;
  scheme: ApiAssessmentScheme | null;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState(defaultScheme);
  useEffect(() => {
    if (scheme)
      setDraft({
        name: scheme.name,
        components: scheme.components.map(({ name, code, maxScore, sequence }) => ({
          name,
          code,
          maxScore,
          sequence,
        })),
        gradeBands: scheme.gradeBands.map(({ minScore, maxScore, grade, remark }) => ({
          minScore,
          maxScore,
          grade,
          remark,
        })),
      });
  }, [scheme]);

  const mutation = useMutation({
    mutationFn: () => academicApi.saveAssessmentScheme(yearId, draft),
    onSuccess: () => {
      toast.success("Assessment scheme saved");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const total = draft.components.reduce((sum, component) => sum + component.maxScore, 0);

  const addComponent = () =>
    setDraft((current) => ({
      ...current,
      components: [
        ...current.components,
        {
          name: "New component",
          code: `COMP_${current.components.length + 1}`,
          maxScore: 0,
          sequence: current.components.length + 1,
        },
      ],
    }));

  const removeComponent = (index: number) =>
    setDraft((current) => ({
      ...current,
      components: current.components
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sequence: itemIndex + 1 })),
    }));

  const addBand = () =>
    setDraft((current) => ({
      ...current,
      gradeBands: [...current.gradeBands, { minScore: 0, maxScore: 0, grade: "", remark: "" }],
    }));

  const isValidTotal = total === 100;

  return (
    <TooltipProvider>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Components Section ── */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="font-semibold text-foreground">Assessment Components</h3>
                <p className="text-xs text-muted-foreground">Maximum scores must total exactly 100.</p>
              </div>
              <Badge
                className={cn(
                  "rounded-full px-3 py-1 font-bold text-xs border-0",
                  isValidTotal
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                {total} / 100
              </Badge>
            </div>

            {/* Total score visual progress bar */}
            <div className="mt-4 space-y-1">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isValidTotal ? "bg-emerald-500" : "bg-amber-500",
                  )}
                  style={{ width: `${Math.min(100, (total / 100) * 100)}%` }}
                />
              </div>
            </div>

            {/* Table headers */}
            <div className="mt-5 grid grid-cols-[1fr_100px_40px] gap-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Component Name</span>
              <span className="text-center">Max Score</span>
              <span></span>
            </div>

            {/* Form inputs list */}
            <div className="mt-2 space-y-2">
              {draft.components.map((component, index) => (
                <div
                  key={`${component.code}-${index}`}
                  className="grid grid-cols-[1fr_100px_40px] gap-2 items-center"
                >
                  <Input
                    value={component.name}
                    placeholder="e.g. Class Test, Assignment"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        components: draft.components.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                name: event.target.value,
                                code: event.target.value
                                  .toUpperCase()
                                  .replace(/[^A-Z0-9]+/g, "_"),
                              }
                            : item,
                        ),
                      })
                    }
                    disabled={!canManage}
                    className="h-9 transition-all duration-200 focus-visible:ring-brand"
                  />
                  <Input
                    type="number"
                    value={component.maxScore}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        components: draft.components.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, maxScore: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                    disabled={!canManage}
                    className="h-9 text-center font-semibold transition-all duration-200 focus-visible:ring-brand"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={!canManage || draft.components.length === 1}
                        onClick={() => removeComponent(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete component</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-border/50 pt-4">
            <Button
              size="sm"
              variant="outline"
              disabled={!canManage || draft.components.length >= 6}
              onClick={addComponent}
              className="gap-1.5 font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add Component
            </Button>
          </div>
        </section>

        {/* ── Grade Bands Section ── */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="font-semibold text-foreground">Grade Bands</h3>
                <p className="text-xs text-muted-foreground">Define scale ranges and remarks.</p>
              </div>
            </div>

            {/* Table headers */}
            <div className="mt-5 grid grid-cols-[70px_70px_65px_1fr_40px] gap-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span className="text-center">Min %</span>
              <span className="text-center">Max %</span>
              <span className="text-center">Grade</span>
              <span>Remark</span>
              <span></span>
            </div>

            {/* Grade bands list */}
            <div className="mt-2 space-y-2">
              {draft.gradeBands.map((band, index) => (
                <div
                  key={`${band.grade}-${index}`}
                  className="grid grid-cols-[70px_70px_65px_1fr_40px] gap-2 items-center"
                >
                  <Input
                    type="number"
                    value={band.minScore}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        gradeBands: draft.gradeBands.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, minScore: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                    disabled={!canManage}
                    className="h-9 text-center transition-all duration-200 focus-visible:ring-brand"
                  />
                  <Input
                    type="number"
                    value={band.maxScore}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        gradeBands: draft.gradeBands.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, maxScore: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                    disabled={!canManage}
                    className="h-9 text-center transition-all duration-200 focus-visible:ring-brand"
                  />
                  <Input
                    value={band.grade}
                    placeholder="A"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        gradeBands: draft.gradeBands.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, grade: event.target.value } : item,
                        ),
                      })
                    }
                    disabled={!canManage}
                    className="h-9 text-center font-bold transition-all duration-200 focus-visible:ring-brand"
                  />
                  <Input
                    value={band.remark}
                    placeholder="Excellent"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        gradeBands: draft.gradeBands.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, remark: event.target.value } : item,
                        ),
                      })
                    }
                    disabled={!canManage}
                    className="h-9 transition-all duration-200 focus-visible:ring-brand"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={!canManage || draft.gradeBands.length === 1}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            gradeBands: current.gradeBands.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete grade band</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-border/50 pt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage}
              onClick={addBand}
              className="gap-1.5 font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add Band
            </Button>
            <Button
              disabled={!canManage || !isValidTotal || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="gap-1.5 font-semibold"
            >
              <Save className="h-4 w-4" />
              Save Scheme
            </Button>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
