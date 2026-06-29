import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { BookOpenCheck, Lock, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LoginSearch {
  expired?: boolean;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const expired = search.expired === true || search.expired === "true";
    return expired ? { expired: true } : {};
  },
  head: () => ({ meta: [{ title: "Sign in — Lumen Suite" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { expired } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  useEffect(() => {
    if (expired) {
      // Clear the expired query parameter so reloading the page doesn't show the toast again
      navigate({ to: "/login", replace: true, search: {} });
      toast.error("Your session has expired. Please sign in again.");
    }
  }, [expired, navigate]);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    try {
      await authApi.forgotPassword(forgotEmail);
      setForgotSuccess(true);
    } catch (err: unknown) {
      setForgotError(
        err instanceof Error
          ? err.message
          : "Failed to send reset link. Please check your email and try again.",
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Brand panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden bg-brand p-10 text-brand-foreground md:flex"
        style={{ backgroundImage: "var(--gradient-brand)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent text-[oklch(0.18_0.04_180)]">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Lumen Suite</span>
        </div>

        <div>
          <h2 className="text-3xl font-semibold leading-tight">
            One platform for your school, NGO and operations.
          </h2>
          <p className="mt-3 max-w-md text-sm text-brand-foreground/75">
            Manage students, staff, fees and reports today. Add NGO programs, accounting and
            inventory tomorrow — without changing tools.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {["Students", "Staff", "Classes", "Fees", "Reports", "Roles"].map((t) => (
              <div
                key={t}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs backdrop-blur"
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-brand-foreground/60">© {new Date().getFullYear()} Lumen Suite</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to continue to your dashboard.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Email</label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="admin@erp.com"
                  required
                  className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(true);
                    setForgotSuccess(false);
                    setForgotError(null);
                    setForgotEmail("");
                  }}
                  className="text-xs text-brand hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 gap-2">
              {loading ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forgot password?</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a recovery link to reset your password.
            </DialogDescription>
          </DialogHeader>

          {forgotSuccess ? (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <BookOpenCheck className="h-6 w-6 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Check your email</h3>
                <p className="text-xs text-muted-foreground">
                  We've sent a password reset link to{" "}
                  <span className="font-semibold text-foreground">{forgotEmail}</span>. Please check
                  your inbox.
                </p>
              </div>
              <Button onClick={() => setForgotOpen(false)} className="w-full mt-2">
                Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4 py-4">
              {forgotError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  {forgotError}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Email Address</label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    type="email"
                    placeholder="name@example.com"
                    required
                    className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotOpen(false)}
                  disabled={forgotLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotLoading}>
                  {forgotLoading ? "Sending Link…" : "Send Reset Link"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
