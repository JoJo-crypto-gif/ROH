import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { rolesApi, schoolStaffApi, type ApiSchoolStaff } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/staff")({
  head: () => ({ meta: [{ title: "Staff — Lumen Suite" }] }),
  component: StaffPage,
});

type StaffForm = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  staffNo: string;
  phone: string;
  jobTitle: string;
  category: ApiSchoolStaff["category"];
  status: ApiSchoolStaff["status"];
  joinedAt: string;
};

const emptyForm: StaffForm = {
  name: "",
  email: "",
  password: "",
  roleId: "",
  staffNo: "",
  phone: "",
  jobTitle: "",
  category: "TEACHING",
  status: "ACTIVE",
  joinedAt: new Date().toISOString().slice(0, 10),
};

function StaffPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "staff.view");
  const canCreate = hasPermission(user, "staff.create");
  const canUpdate = hasPermission(user, "staff.update");
  const canDelete = hasPermission(user, "staff.delete");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSchoolStaff | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);

  const staffQuery = useQuery({
    queryKey: ["school-staff"],
    queryFn: schoolStaffApi.list,
    enabled: canView,
  });
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.list,
    enabled: canCreate || canUpdate,
  });

  const staff = useMemo(() => staffQuery.data?.staff ?? [], [staffQuery.data?.staff]);
  const roles = useMemo(() => {
    const available = rolesQuery.data?.roles ?? [];
    if (user?.roleSlug === "super-admin") return available;
    const held = new Set(user?.permissions ?? []);
    return available.filter(
      (role) =>
        role.slug !== "super-admin" && role.permissions.every((permission) => held.has(permission)),
    );
  }, [rolesQuery.data?.roles, user?.permissions, user?.roleSlug]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((item) =>
      [item.name, item.email, item.staffNo, item.roleName, item.jobTitle, item.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [q, staff]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["school-staff"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["academic-teachers"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      schoolStaffApi.create({
        ...form,
        phone: form.phone || null,
        jobTitle: form.jobTitle || null,
        joinedAt: `${form.joinedAt}T00:00:00.000Z`,
      }),
    onSuccess: async () => {
      await invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success("School staff account created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      schoolStaffApi.update(editing!.id, {
        name: form.name,
        email: form.email,
        roleId: form.roleId,
        staffNo: form.staffNo,
        phone: form.phone || null,
        jobTitle: form.jobTitle || null,
        category: form.category,
        status: form.status,
        joinedAt: `${form.joinedAt}T00:00:00.000Z`,
      }),
    onSuccess: async () => {
      await invalidate();
      setDialogOpen(false);
      setEditing(null);
      toast.success("Staff details updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApiSchoolStaff["status"] }) =>
      schoolStaffApi.update(id, { status }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: schoolStaffApi.deactivate,
    onSuccess: async () => {
      await invalidate();
      toast.success("Staff login deactivated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canView) return <Forbidden />;

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      roleId: roles.find((role) => role.slug === "teacher")?.id ?? roles[0]?.id ?? "",
    });
    setDialogOpen(true);
  };

  const openEdit = (item: ApiSchoolStaff) => {
    setEditing(item);
    setForm({
      name: item.name,
      email: item.email,
      password: "",
      roleId: item.roleId,
      staffNo: item.staffNo,
      phone: item.phone ?? "",
      jobTitle: item.jobTitle ?? "",
      category: item.category,
      status: item.status,
      joinedAt: item.joinedAt.slice(0, 10),
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Staff"
        description="School-domain staff profiles linked to secure user accounts and roles."
        actions={
          canCreate ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> Add staff
            </Button>
          ) : null
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search name, email, role or staff number"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
            />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} school staff
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Staff member</th>
                <th className="px-4 py-2.5 text-left font-medium">Role</th>
                <th className="px-4 py-2.5 text-left font-medium">Category</th>
                <th className="px-4 py-2.5 text-left font-medium">Assigned sections</th>
                <th className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th className="px-4 py-2.5 text-left font-medium">Active</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => {
                const currentSections = item.assignedSections.filter(
                  (section) => section.academicYearStatus === "ACTIVE",
                );
                const protectedAccount =
                  item.roleSlug === "super-admin" && user?.roleSlug !== "super-admin";
                const ownAccount = item.userId === user?.id;
                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-xs font-semibold text-brand-foreground">
                          {item.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.staffNo} · {item.jobTitle || "No job title"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{item.roleName}</Badge>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {item.category.toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {currentSections.length > 0
                        ? currentSections.map((section) => section.name).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.email}</div>
                      <div className="text-xs text-muted-foreground">{item.phone || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={item.status === "ACTIVE" && item.userActive}
                        disabled={
                          !canUpdate || protectedAccount || ownAccount || statusMutation.isPending
                        }
                        onCheckedChange={(checked) =>
                          statusMutation.mutate({
                            id: item.id,
                            status: checked ? "ACTIVE" : "INACTIVE",
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && !protectedAccount && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete &&
                          !protectedAccount &&
                          !ownAccount &&
                          item.status === "ACTIVE" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (window.confirm(`Deactivate ${item.name}'s login?`)) {
                                  deactivateMutation.mutate(item.id);
                                }
                              }}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit school staff" : "Create school staff"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the employment profile and login role."
                : "This creates both a school staff profile and a login account."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <Field
              label="Full name"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
            />
            <Field
              label="Staff number"
              value={form.staffNo}
              onChange={(value) => setForm({ ...form, staffNo: value })}
            />
            {!editing && (
              <Field
                label="Temporary password"
                type="password"
                value={form.password}
                onChange={(value) => setForm({ ...form, password: value })}
              />
            )}
            <Field
              label="Phone"
              value={form.phone}
              onChange={(value) => setForm({ ...form, phone: value })}
            />
            <Field
              label="Job title"
              value={form.jobTitle}
              onChange={(value) => setForm({ ...form, jobTitle: value })}
            />
            <label className="space-y-1 text-xs font-medium">
              Role
              <select
                value={form.roleId}
                onChange={(event) => setForm({ ...form, roleId: event.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Category
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value as StaffForm["category"] })
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="TEACHING">Teaching</option>
                <option value="ADMIN">Administration</option>
                <option value="SUPPORT">Support</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as StaffForm["status"] })
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <Field
              label="Joined date"
              type="date"
              value={form.joinedAt}
              onChange={(value) => setForm({ ...form, joinedAt: value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.name ||
                !form.email ||
                !form.roleId ||
                !form.staffNo ||
                !form.joinedAt ||
                (!editing && form.password.length < 6) ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              onClick={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
            >
              {editing ? "Save changes" : "Create staff account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1 text-xs font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}
