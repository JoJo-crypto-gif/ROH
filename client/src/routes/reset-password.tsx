import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpenCheck, Lock, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { z } from "zod";

const resetPasswordSearchSchema = z.object({
  token: z.string().optional().catch(""),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => resetPasswordSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Reset Password — Lumen Suite" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Reset token is missing.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to reset password. The link may have expired or is invalid.",
      );
    } finally {
      setLoading(false);
    }
  };

  const isInvalidToken = !token || token.trim() === "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand header */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-foreground"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-foreground">
              Lumen Suite
            </span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
            {success ? "Password Updated" : "Reset Password"}
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {success
              ? "Your password has been successfully reset"
              : "Set a secure new password for your account"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          {isInvalidToken ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold">Invalid Reset Link</h3>
                <p className="text-sm text-muted-foreground">
                  The password reset link you used is invalid, incomplete, or has expired. Please
                  request a new recovery link.
                </p>
              </div>
              <Button asChild className="w-full h-11">
                <Link to="/login">Back to Sign In</Link>
              </Button>
            </div>
          ) : success ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <CheckCircle className="h-6 w-6 animate-bounce" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Your new password is now active. You can sign in using your new credentials.
                </p>
              </div>
              <Button asChild className="w-full h-11">
                <Link to="/login">Sign In</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-foreground">New Password</label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Must be at least 8 characters long.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Confirm New Password</label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-11 gap-2">
                {loading ? "Resetting Password…" : "Reset Password"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
