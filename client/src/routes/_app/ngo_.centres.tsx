import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Pencil, Plus, Search, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Forbidden } from "@/components/layout/Forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { ngoApi, type ApiCareCentre, type CareCentreInput } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_app/ngo_/centres")({
  head: () => ({ meta: [{ title: "Care Centres — Lumen Suite" }] }),
  component: CareCentresPage,
});

type CentreForm = Omit<CareCentreInput, "capacity" | "latitude" | "longitude"> & {
  capacity: string;
  latitude: string;
  longitude: string;
};

const emptyForm: CentreForm = {
  code: "",
  name: "",
  managerId: "",
  description: "",
  openedAt: "",
  phone: "",
  email: "",
  address: "",
  town: "",
  district: "",
  region: "",
  latitude: "",
  longitude: "",
  capacity: "",
  status: "ACTIVE",
};

function CareCentresPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "ngo.centres.view");
  const canManage = hasPermission(user, "ngo.centres.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | ApiCareCentre["status"]>("ACTIVE");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCareCentre | null>(null);
  const [form, setForm] = useState<CentreForm>(emptyForm);

  const centresQuery = useQuery({
    queryKey: ["ngo-centres", search, status, page],
    queryFn: () =>
      ngoApi.getCentres({
        search: search || undefined,
        status: status === "ALL" ? undefined : status,
        page,
        pageSize: 25,
      }),
    enabled: canView,
  });
  const managersQuery = useQuery({
    queryKey: ["ngo-centre-managers"],
    queryFn: ngoApi.getCentreManagers,
    enabled: canManage,
  });

  useEffect(() => {
    const effectivePage = centresQuery.data?.pagination.page;
    if (effectivePage && effectivePage !== page) setPage(effectivePage);
  }, [centresQuery.data?.pagination.page, page]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ngo-centres"] }),
      queryClient.invalidateQueries({ queryKey: ["ngo-overview"] }),
    ]);
  };

  const payload = (): CareCentreInput => ({
    code: form.code,
    name: form.name,
    managerId: form.managerId,
    description: form.description || null,
    openedAt: form.openedAt || null,
    phone: form.phone || null,
    email: form.email || null,
    address: form.address,
    town: form.town,
    district: form.district,
    region: form.region,
    latitude: form.latitude === "" ? null : Number(form.latitude),
    longitude: form.longitude === "" ? null : Number(form.longitude),
    capacity: Number(form.capacity),
    status: form.status,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing ? ngoApi.updateCentre(editing.id, payload()) : ngoApi.createCentre(payload()),
    onSuccess: async () => {
      await invalidate();
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Care centre updated" : "Care centre created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: ngoApi.deactivateCentre,
    onSuccess: async () => {
      await invalidate();
      toast.success("Care centre deactivated; its history remains preserved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canView) return <Forbidden />;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (centre: ApiCareCentre) => {
    setEditing(centre);
    setForm({
      code: centre.code,
      name: centre.name,
      managerId: centre.manager?.id ?? "",
      description: centre.description ?? "",
      openedAt: centre.openedAt?.slice(0, 10) ?? "",
      phone: centre.phone ?? "",
      email: centre.email ?? "",
      address: centre.address,
      town: centre.town,
      district: centre.district,
      region: centre.region,
      latitude: centre.latitude?.toString() ?? "",
      longitude: centre.longitude?.toString() ?? "",
      capacity: centre.capacity.toString(),
      status: centre.status,
    });
    setDialogOpen(true);
  };

  const centres = centresQuery.data?.centres ?? [];
  const pagination = centresQuery.data?.pagination;
  const managers = managersQuery.data?.managers ?? [];
  const managerOptions =
    editing?.manager && !managers.some((manager) => manager.id === editing.manager?.id)
      ? [...managers, editing.manager]
      : managers;
  const formValid =
    form.code.trim().length >= 2 &&
    form.name.trim().length >= 2 &&
    form.managerId.length > 0 &&
    form.address.trim().length >= 3 &&
    form.town.trim().length >= 2 &&
    form.district.trim().length >= 2 &&
    form.region.trim().length >= 2 &&
    Number(form.capacity) > 0 &&
    (form.latitude === "") === (form.longitude === "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Care Centres"
        description="Manage the physical locations that will anchor beneficiaries, NGO staff and assets."
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> Add centre
            </Button>
          ) : null
        }
      />

      <div className="rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search code, name or location"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All statuses</option>
          </select>
        </div>

        {centresQuery.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Loading care centres…
          </div>
        ) : centres.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="font-semibold">No care centres found</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {search || status !== "ACTIVE"
                ? "Change the filters to look for another centre."
                : "Create the first centre once its official name, address and capacity are confirmed."}
            </p>
            {canManage && !search && status === "ACTIVE" ? (
              <Button className="mt-4" size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" /> Create first centre
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Centre</th>
                  <th className="px-4 py-2.5 text-left font-medium">Manager</th>
                  <th className="px-4 py-2.5 text-left font-medium">Location</th>
                  <th className="px-4 py-2.5 text-left font-medium">Occupancy</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contact</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {centres.map((centre) => (
                  <tr key={centre.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{centre.name}</div>
                      <div className="text-xs text-muted-foreground">{centre.code}</div>
                    </td>
                    <td className="px-4 py-3">
                      {centre.manager ? (
                        <>
                          <div className="font-medium">{centre.manager.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {centre.manager.roleName}
                            {!centre.manager.active ? " · Inactive" : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-destructive">Manager required</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {centre.town}, {centre.region}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{centre.district}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{centre.currentOccupancy}</span>
                      <span className="text-muted-foreground"> / {centre.capacity}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{centre.phone || "—"}</div>
                      <div className="text-xs">{centre.email || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={centre.status === "ACTIVE" ? "default" : "secondary"}>
                        {centre.status === "ACTIVE" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(centre)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {centre.status === "ACTIVE" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              disabled={deactivateMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Deactivate ${centre.name}? Its records and future history will be preserved.`,
                                  )
                                ) {
                                  deactivateMutation.mutate(centre.id);
                                }
                              }}
                            >
                              <UserRoundX className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
            <span>{pagination.total} centres</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit care centre" : "Create care centre"}</DialogTitle>
            <DialogDescription>
              Use the centre's official details. Records are archived through deactivation, never
              deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <Field
              label="Centre code"
              required
              value={form.code}
              onChange={(code) => setForm({ ...form, code })}
            />
            <Field
              label="Centre name"
              required
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
            />
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              Centre manager *
              <select
                value={form.managerId}
                onChange={(event) => setForm({ ...form, managerId: event.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {managersQuery.isLoading
                    ? "Loading eligible users…"
                    : managerOptions.length
                      ? "Select an active NGO user"
                      : "No eligible NGO users found"}
                </option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} — {manager.roleName} ({manager.email})
                  </option>
                ))}
              </select>
              {!managersQuery.isLoading && managerOptions.length === 0 ? (
                <span className="block font-normal text-amber-700 dark:text-amber-300">
                  Create or assign an active user a role with NGO centre access first.
                </span>
              ) : null}
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              Description
              <Textarea
                value={form.description ?? ""}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <Field
              label="Opening date"
              type="date"
              value={form.openedAt ?? ""}
              onChange={(openedAt) => setForm({ ...form, openedAt })}
            />
            <Field
              label="Child capacity"
              type="number"
              required
              min="1"
              value={form.capacity}
              onChange={(capacity) => setForm({ ...form, capacity })}
            />
            <Field
              label="Phone"
              value={form.phone ?? ""}
              onChange={(phone) => setForm({ ...form, phone })}
            />
            <Field
              label="Email"
              type="email"
              value={form.email ?? ""}
              onChange={(email) => setForm({ ...form, email })}
            />
            <Field
              label="Street / digital address"
              required
              className="sm:col-span-2"
              value={form.address}
              onChange={(address) => setForm({ ...form, address })}
            />
            <Field
              label="Town"
              required
              value={form.town}
              onChange={(town) => setForm({ ...form, town })}
            />
            <Field
              label="District"
              required
              value={form.district}
              onChange={(district) => setForm({ ...form, district })}
            />
            <Field
              label="Region"
              required
              value={form.region}
              onChange={(region) => setForm({ ...form, region })}
            />
            <label className="space-y-1 text-xs font-medium">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as ApiCareCentre["status"] })
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <Field
              label="Latitude (optional)"
              type="number"
              step="any"
              value={form.latitude}
              onChange={(latitude) => setForm({ ...form, latitude })}
            />
            <Field
              label="Longitude (optional)"
              type="number"
              step="any"
              value={form.longitude}
              onChange={(longitude) => setForm({ ...form, longitude })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!formValid || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? "Save changes" : "Create centre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  className = "",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className={`space-y-1 text-xs font-medium ${className}`}>
      {label}
      {required ? " *" : ""}
      <input
        type={type}
        min={min}
        step={step}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}
