import { createFileRoute } from "@tanstack/react-router";
import { Plus, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { staff } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "Users — Lumen Suite" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { user, roles } = useAuth();
  if (!hasPermission(user, "users.manage")) return <Forbidden />;
  // Treat staff as system users for the MVP
  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="System users, their roles and access scopes." actions={
        <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Invite user</Button>
      } />
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">User</th>
              <th className="px-4 py-2.5 text-left font-medium">Role</th>
              <th className="px-4 py-2.5 text-left font-medium">Scope</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.map(s => {
              const role = roles.find(r => r.id === s.roleId);
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground text-xs font-semibold">
                        {s.name.split(" ").map(n => n[0]).slice(0,2).join("")}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline">{role?.name ?? s.roleId}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{s.roleId === "super-admin" ? "All modules" : s.classId ? "School · Assigned class" : "School"}</td>
                  <td className="px-4 py-3">{s.active ? <Badge className="bg-success/20 text-[oklch(0.35_0.1_155)] hover:bg-success/20">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</td>
                  <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
