import { ShieldOff } from "lucide-react";

export function Forbidden({ message }: { message?: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <ShieldOff className="h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">You don't have access</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {message ??
          "Your current role doesn't include permission to view this module. Contact your administrator if this is unexpected."}
      </p>
    </div>
  );
}
