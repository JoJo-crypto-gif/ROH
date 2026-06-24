import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, Search, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { staff, classes, subjects } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/staff")({
  head: () => ({ meta: [{ title: "Staff — Lumen Suite" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  if (!hasPermission(user, "staff.view")) return <Forbidden />;

  const filtered = useMemo(() => staff.filter(s => (s.name + " " + s.email + " " + s.staffNo).toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Teachers, administrators and support staff." actions={
        hasPermission(user, "staff.create") ? <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Add staff</Button> : null
      } />

      <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email, staff no" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring" />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} staff</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Role</th>
                <th className="px-4 py-2.5 text-left font-medium">Assigned class</th>
                <th className="px-4 py-2.5 text-left font-medium">Subjects</th>
                <th className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th className="px-4 py-2.5 text-left font-medium">Active</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s => {
                const cls = classes.find(c => c.id === s.classId);
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-brand-foreground text-xs font-semibold">
                          {s.name.split(" ").map(n=>n[0]).slice(0,2).join("")}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.staffNo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize"><Badge variant="outline">{s.roleId.replace("-"," ")}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{cls?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.subjects?.map(id => subjects.find(x => x.id === id)?.code).join(", ") ?? "—"}</td>
                    <td className="px-4 py-3"><div>{s.email}</div><div className="text-xs text-muted-foreground">{s.phone}</div></td>
                    <td className="px-4 py-3"><Switch checked={s.active} disabled={!hasPermission(user, "staff.update")} /></td>
                    <td className="px-4 py-3"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
