import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { ALL_PERMISSIONS, DEFAULT_ROLES, hasPermission, type Permission, type RoleDefinition } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — Lumen Suite" }] }),
  component: RolesPage,
});

function RolesPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [activeRoleId, setActiveRoleId] = useState(roles[0].id);
  if (!hasPermission(user, "roles.manage")) return <Forbidden />;
  const role = roles.find(r => r.id === activeRoleId)!;

  const toggle = (perm: Permission) => {
    setRoles(roles.map(r => r.id !== activeRoleId ? r : {
      ...r,
      permissions: r.permissions.includes(perm) ? r.permissions.filter(p => p !== perm) : [...r.permissions, perm],
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & Permissions" description="Create custom roles and assign module-level permissions. Roles are not hardcoded — assign anything." actions={
        <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> New role</Button>
      } />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-1.5">
          {roles.map(r => (
            <button
              key={r.id}
              onClick={() => setActiveRoleId(r.id)}
              className={cn("group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                r.id === activeRoleId ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted/40"
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand text-brand-foreground"><ShieldCheck className="h-4 w-4" /></span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  {r.builtIn && <Badge variant="outline" className="text-[10px]">Built-in</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{r.permissions.length} permissions</p>
              </div>
            </button>
          ))}
        </aside>

        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold">{role.name}</h2>
              <p className="text-sm text-muted-foreground">{role.description}</p>
            </div>
            <Badge variant="outline">{role.permissions.length} of {ALL_PERMISSIONS.flatMap(g => g.items).length} permissions</Badge>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {ALL_PERMISSIONS.map(group => (
              <div key={group.module} className="rounded-lg border border-border p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.module}</div>
                <div className="mt-3 space-y-2.5">
                  {group.items.map(it => {
                    const checked = role.permissions.includes(it.key);
                    return (
                      <label key={it.key} className="flex items-start gap-3 cursor-pointer">
                        <Checkbox checked={checked} onCheckedChange={() => toggle(it.key)} className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm">{it.label}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{it.key}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">Scope</h3>
            <p className="mt-1 text-xs text-muted-foreground">Limit this role to specific organizational areas or assigned classes.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["School","NGO","Accounting","Inventory","Assigned class only","Assigned department only","All modules"].map(s => (
                <Badge key={s} variant="outline" className="cursor-pointer hover:bg-accent">{s}</Badge>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
