import { createFileRoute } from "@tanstack/react-router";
import { HeartHandshake } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/_app/ngo")({
  head: () => ({ meta: [{ title: "NGO — Lumen Suite" }] }),
  component: () => (
    <ComingSoon
      icon={HeartHandshake}
      title="NGO module"
      description="Donor management, beneficiary tracking, project management and impact reports. The platform is already structured to plug this in without redesign."
    />
  ),
});
