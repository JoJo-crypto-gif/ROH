import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
export const Route = createFileRoute("/_app/accounting")({
  head: () => ({ meta: [{ title: "Accounting — Lumen Suite" }] }),
  component: () => <ComingSoon icon={Building2} title="Accounting" description="Separate ledgers for School and NGO, with consolidated reports for the parent company." />,
});
