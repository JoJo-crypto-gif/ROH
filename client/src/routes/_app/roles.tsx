import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { rolesApi } from "@/lib/api";
import { ALL_PERMISSIONS, hasPermission, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — Lumen Suite" }] }),
  component: RolesPage,
});

function RolesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeRoleId, setActiveRoleId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<Permission[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", slug: "", description: "" });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.list,
    enabled: hasPermission(user, "roles.manage"),
  });
  const roles = useMemo(() => rolesQuery.data?.roles ?? [], [rolesQuery.data?.roles]);
  const role = roles.find((item) => item.id === activeRoleId) ?? roles[0];
  const heldPermissions = useMemo(() => new Set(user?.permissions ?? []), [user?.permissions]);
  const roleManageable =
    !!role &&
    (user?.roleSlug === "super-admin" ||
      (role.slug !== "super-admin" &&
        role.permissions.every((permission) => heldPermissions.has(permission))));

  useEffect(() => {
    if (roles.length > 0 && !roles.some((item) => item.id === activeRoleId)) {
      setActiveRoleId(roles[0].id);
    }
  }, [activeRoleId, roles]);

  useEffect(() => {
    if (!role) return;
    setDraftName(role.name);
    setDraftDescription(role.description ?? "");
    setDraftPermissions(role.permissions as Permission[]);
  }, [role]);

  const saveMutation = useMutation({
    mutationFn: () =>
      rolesApi.update(role!.id, {
        ...(role!.builtIn ? {} : { name: draftName }),
        description: draftDescription,
        permissions: draftPermissions,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role permissions saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      rolesApi.create({
        name: newRole.name,
        slug: newRole.slug,
        description: newRole.description,
        permissions: [heldPermissions.has("dashboard.view") ? "dashboard.view" : "roles.manage"],
      }),
    onSuccess: async ({ role: created }) => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      setActiveRoleId(created.id);
      setCreateOpen(false);
      setNewRole({ name: "", slug: "", description: "" });
      toast.success("Role created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => rolesApi.delete(role!.id),
    onSuccess: async () => {
      setActiveRoleId("");
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!hasPermission(user, "roles.manage")) return <Forbidden />;

  const togglePermission = (permission: Permission) => {
    setDraftPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  };

  if (rolesQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading roles…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Permissions are stored on the server and enforced again on every protected request."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New role
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-1.5">
          {roles.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveRoleId(item.id)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                item.id === role?.id
                  ? "border-brand bg-brand/5"
                  : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand text-brand-foreground">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  {item.builtIn && (
                    <Badge variant="outline" className="text-[10px]">
                      Built-in
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {item.description || "No description"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {item.permissions.length} permissions
                </p>
              </div>
            </button>
          ))}
        </aside>

        {role ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium">
                  Role name
                  <input
                    value={draftName}
                    disabled={role.builtIn || !roleManageable}
                    onChange={(event) => setDraftName(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Description
                  <input
                    value={draftDescription}
                    disabled={!roleManageable}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                {!role.builtIn && roleManageable && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the ${role.name} role?`)) deleteMutation.mutate();
                    }}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={!roleManageable || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Save className="mr-1.5 h-4 w-4" /> Save permissions
                </Button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Changes take effect on the next authenticated request.
              </p>
              <Badge variant="outline">
                {draftPermissions.length} of{" "}
                {ALL_PERMISSIONS.flatMap((group) => group.items).length}
              </Badge>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {ALL_PERMISSIONS.map((group) => (
                <div key={group.module} className="rounded-lg border border-border p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.module}
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {group.items.map((item) => (
                      <label key={item.key} className="flex cursor-pointer items-start gap-3">
                        <Checkbox
                          checked={draftPermissions.includes(item.key)}
                          disabled={
                            !roleManageable ||
                            (user?.roleSlug !== "super-admin" && !heldPermissions.has(item.key))
                          }
                          onCheckedChange={() => togglePermission(item.key)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <div className="text-sm">{item.label}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {item.key}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No roles have been configured.
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create custom role</DialogTitle>
            <DialogDescription>
              The new role starts with dashboard access. Add its other permissions after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block space-y-1 text-xs font-medium">
              Name
              <input
                value={newRole.name}
                onChange={(event) => setNewRole({ ...newRole, name: event.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block space-y-1 text-xs font-medium">
              Slug
              <input
                value={newRole.slug}
                onChange={(event) =>
                  setNewRole({
                    ...newRole,
                    slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                  })
                }
                placeholder="assistant-teacher"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="block space-y-1 text-xs font-medium">
              Description
              <input
                value={newRole.description}
                onChange={(event) => setNewRole({ ...newRole, description: event.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newRole.name || !newRole.slug || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
