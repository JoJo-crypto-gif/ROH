import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { rolesApi, usersApi } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "Users — Lumen Suite" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, "users.manage");
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: usersApi.list, enabled: canManage });
  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: rolesApi.list, enabled: canManage });
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const roles = useMemo(() => {
    const available = rolesQuery.data?.roles ?? [];
    if (user?.roleSlug === "super-admin") return available;
    const held = new Set(user?.permissions ?? []);
    return available.filter(
      (role) =>
        role.slug !== "super-admin" && role.permissions.every((permission) => held.has(permission)),
    );
  }, [rolesQuery.data?.roles, user?.permissions, user?.roleSlug]);

  const updateMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) => usersApi.update(id, { roleId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["school-staff"] }),
      ]);
      toast.success("User role updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: usersApi.deactivate,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["school-staff"] }),
      ]);
      toast.success("User access disabled");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManage) return <Forbidden />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Users"
        description="Login identities and roles. Create school users from the Staff page."
      />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">User</th>
              <th className="px-4 py-2.5 text-left font-medium">Domain</th>
              <th className="px-4 py-2.5 text-left font-medium">Role</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((item) => {
              const protectedAccount =
                item.roleSlug === "super-admin" && user?.roleSlug !== "super-admin";
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
                        <div className="text-xs text-muted-foreground">{item.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.schoolStaffId ? (
                      <Badge variant="outline">
                        School · {item.schoolStaffCategory?.toLowerCase()}
                      </Badge>
                    ) : (
                      <Badge variant="outline">System only</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={item.roleId}
                      disabled={
                        updateMutation.isPending || item.id === user?.id || protectedAccount
                      }
                      onChange={(event) =>
                        updateMutation.mutate({ id: item.id, roleId: event.target.value })
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {item.active ? (
                      <Badge className="bg-success/20 text-[oklch(0.35_0.1_155)] hover:bg-success/20">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.active && item.id !== user?.id && !protectedAccount && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (window.confirm(`Disable ${item.name}'s login access?`)) {
                            deactivateMutation.mutate(item.id);
                          }
                        }}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
