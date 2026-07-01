import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Permission, type Scope, type RoleDefinition } from "@/lib/rbac";
import { authApi, setAccessToken, refreshSession, type ApiUser } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  permissions: Permission[];
  scopes: Scope[];
  assignedClassId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  rehydrate: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function apiUserToAuthUser(apiUser: ApiUser): AuthUser {
  // Derive scopes from role slug (mirrors the old mock logic)
  const scopes: Scope[] =
    apiUser.roleSlug === "super-admin"
      ? ["all"]
      : apiUser.roleSlug === "ngo-admin"
        ? ["ngo"]
        : apiUser.roleSlug === "teacher"
          ? ["school", "class"]
          : ["school"];

  return {
    id: apiUser.id,
    name: apiUser.name,
    email: apiUser.email,
    avatarInitials: apiUser.avatarInitials,
    roleId: apiUser.roleId,
    roleSlug: apiUser.roleSlug,
    roleName: apiUser.roleName,
    permissions: apiUser.permissions as Permission[],
    scopes,
    assignedClassId: apiUser.assignedClassId || undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rehydrate session on mount — try to refresh the access token from httpOnly cookie
  const rehydrate = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await refreshSession();
      queryClient.removeQueries({ queryKey: ["dashboard"] });
      if (data) {
        setUser(apiUserToAuthUser(data.user));
      } else {
        setAccessToken(null);
        setUser(null);
      }
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    rehydrate();
  }, [rehydrate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,

      signIn: async (email: string, password: string) => {
        setLoading(true);
        setError(null);
        try {
          const data = await authApi.login(email, password);
          queryClient.removeQueries({ queryKey: ["dashboard"] });
          setAccessToken(data.accessToken);
          setUser(apiUserToAuthUser(data.user));
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Sign in failed");
          throw err;
        } finally {
          setLoading(false);
        }
      },

      signOut: async () => {
        try {
          await authApi.logout();
        } catch {
          // Best-effort logout
        }
        setAccessToken(null);
        queryClient.removeQueries({ queryKey: ["dashboard"] });
        setUser(null);
      },

      rehydrate,
    }),
    [user, loading, error, rehydrate, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
