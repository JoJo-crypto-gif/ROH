import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Lumen Suite" }] }),
  component: () => <ComingSoon icon={Boxes} title="Inventory" description="Stock, suppliers and asset tracking shared across departments." />,
});
