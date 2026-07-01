import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Building2,
  CircleDollarSign,
  HeartHandshake,
  MapPin,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ngoApi } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/ngo")({
  head: () => ({ meta: [{ title: "NGO Overview — Lumen Suite" }] }),
  component: NgoOverviewPage,
});

function NgoOverviewPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "ngo.view");
  const canViewCentres = hasPermission(user, "ngo.centres.view");
  const canViewBeneficiaries = hasPermission(user, "ngo.beneficiaries.view");
  const overviewQuery = useQuery({
    queryKey: ["ngo-overview"],
    queryFn: ngoApi.getOverview,
    enabled: canView,
  });

  if (!canView) return <Forbidden />;
  const overview = overviewQuery.data?.overview;

  return (
    <div className="space-y-6">
      <PageHeader
        title="NGO Overview"
        description="A separate care domain for rescued children, centres, assets and future NGO accounting."
        actions={
          <div className="flex gap-2">
            {canViewBeneficiaries ? (
              <Button asChild size="sm">
                <Link to="/ngo/beneficiaries">
                  <UsersRound className="mr-1.5 h-4 w-4" /> View beneficiaries
                </Link>
              </Button>
            ) : null}
            {canViewCentres ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/ngo/centres">
                  <MapPin className="mr-1.5 h-4 w-4" /> Care centres
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="Active centres"
          value={overviewQuery.isLoading ? "…" : String(overview?.activeCentres ?? 0)}
        />
        <MetricCard
          icon={HeartHandshake}
          label="Child capacity"
          value={overviewQuery.isLoading ? "…" : String(overview?.totalCapacity ?? 0)}
        />
        <MetricCard
          icon={UsersRound}
          label="Current beneficiaries"
          value={overviewQuery.isLoading ? "…" : String(overview?.activeBeneficiaries ?? 0)}
        />
        <MetricCard
          icon={Building2}
          label="Inactive centres"
          value={overviewQuery.isLoading ? "…" : String(overview?.inactiveCentres ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>NGO foundation</CardTitle>
          <CardDescription>
            Care centres are the location anchor. Future records will keep their own NGO history
            while allowing a beneficiary to be linked to a student when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-brand/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <UsersRound className="h-5 w-5 text-brand" />
              <Badge>Available</Badge>
            </div>
            <div className="font-medium">Beneficiaries</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Child profiles, placements, health, guardians and school links.
            </p>
          </div>
          <FutureArea
            icon={Boxes}
            title="Assets & stock"
            description="Centre assets, custody, maintenance and inventory."
          />
          <FutureArea
            icon={CircleDollarSign}
            title="NGO accounting"
            description="A separate NGO book, independent of school finances."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div
            className={
              muted ? "text-sm font-medium text-muted-foreground" : "text-2xl font-semibold"
            }
          >
            {value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function FutureArea({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <Badge variant="outline">Upcoming</Badge>
      </div>
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
