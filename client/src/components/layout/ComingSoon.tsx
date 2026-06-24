import type { ComponentType } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ComingSoon({ icon: Icon, title, description }: { icon: ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-brand text-brand-foreground">
          <Icon className="h-7 w-7" />
        </div>
        <Badge className="mt-4 bg-brand-accent text-[oklch(0.18_0.04_180)] hover:bg-brand-accent inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Coming soon
        </Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
