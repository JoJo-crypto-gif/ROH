import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, type Permission } from "@/lib/rbac";

export function Can({ perm, children, fallback = null }: { perm: Permission | Permission[]; children: ReactNode; fallback?: ReactNode }) {
  const { user } = useAuth();
  return hasPermission(user, perm) ? <>{children}</> : <>{fallback}</>;
}
