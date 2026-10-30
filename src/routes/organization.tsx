import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import {
  createOrganizationUnit,
  listOrganizationUnits,
  updateOrganizationUnit,
  type OrganizationUnit,
  type OrganizationUnitType,
} from "@/lib/cloud-organization";
import { toast } from "sonner";
import { Building2, Factory, MapPin, Warehouse, Plus, RefreshCw, Power, X } from "lucide-react";

export const Route = createFileRoute("/organization")({
  head: () => ({ meta: [{ title: "Estructura organizacional — ERP" }] }),
  component: OrganizationPage,
});

const TYPES: { value: OrganizationUnitType; label: string }[] = [
  { value: "company", label: "Empresa" },
  { value: "site", label: "Sede / planta" },
  { value: "area", label: "Área" },
  { value: "warehouse", label: "Bodega" },
  { value: "production_line", label: "Línea de producción" },
];

const TYPE_ICON = {
  company: Building2,
  site: Factory,
  area: MapPin,
  warehouse: Warehouse,
  production_line: Factory,
};

function OrganizationPage() {
  const { can, loading } = useAuth();
  const allowed = can("settings", "write");
  const [units, setUnits] = useState<OrganizationUnit[]>([]);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      setUnits(await listOrganizationUnits());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo consultar Firestore");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && allowed) void reload();
  }, [loading, allowed, reload]);

  const activeCount = units.filter((unit) => unit.active).length;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!allowed) return <div className="p-6 text-sm text-destructive">No tienes permiso para administrar la estructura organizacional.</div>;

  async function toggleActive(unit: OrganizationUnit) {
    try {
      await updateOrganizationUnit(unit.id, { active: !unit.active });
      toast.success(unit.active ? "Unidad desactivada" : "Unidad activada");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la unidad");
    }
  }

  return (
    <div>
      <PageHeader
        title="Estructura organizacional"
        subtitle={`${activeCount} unidades activas · ${units.length} registradas`}
        right={
          <button onClick={() => setShowForm(true)} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nueva unidad
          </button>
        }
      />
      <div className="px-4 md:px-6 pb-8 space-y-3">
        <div className="flex justify-end">
          <button onClick={() => void reload()} disabled={busy} className="text-xs text-muted-foreground inline-flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar desde servidor
          </button>
        </div>
        {busy && units.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Consultando Firestore…</p>}
        {!busy && units.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center"><Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" /><p className="font-medium">Aún no hay estructura configurada</p><p className="text-sm text-muted-foreground mt-1">Crea primero la empresa y luego sus sedes, áreas y bodegas.</p></div>}
        {units.map((unit) => {
          const Icon = TYPE_ICON[unit.type];
          const parent = units.find((item) => item.id === unit.parentId);
          return (
            <div key={unit.id} className="rounded-xl bg-card border border-border p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><Icon className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2"><span className="font-medium truncate">{unit.name}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${unit.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{unit.active ? "Activa" : "Inactiva"}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{TYPES.find((type) => type.value === unit.type)?.label} · {unit.code}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Superior: {parent?.name ?? (unit.type === "company" ? "Nivel principal" : "No encontrada")}</div>
                {unit.address && <div className="text-xs text-muted-foreground mt-0.5">{unit.address}</div>}
              </div>
              <button onClick={() => void toggleActive(unit)} title={unit.active ? "Desactivar" : "Activar"} className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><Power className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
      {showForm && <OrganizationForm units={units} onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await reload(); }} />}
    </div>
  );
}

function OrganizationForm({ units, onClose, onSaved }: { units: OrganizationUnit[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<OrganizationUnitType>("company");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const parentTypes = useMemo(() => ({
    company: [],
    site: ["company"],
    area: ["site"],
    warehouse: ["site", "area"],
    production_line: ["area"],
  } as Record<OrganizationUnitType, OrganizationUnitType[]>)[type], [type]);
  const parents = units.filter((unit) => unit.active && parentTypes.includes(unit.type));
  const companyExists = units.some((unit) => unit.type === "company" && unit.active);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createOrganizationUnit({ code, name, type, parentId: parentId || null, description, address });
      toast.success("Unidad creada y confirmada en Firestore");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la unidad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
      <form onSubmit={save} className="w-full md:max-w-lg max-h-[92vh] overflow-y-auto bg-card rounded-t-2xl md:rounded-2xl border border-border">
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between"><span className="font-semibold">Nueva unidad organizacional</span><button type="button" onClick={onClose}><X className="h-5 w-5" /></button></div>
        <div className="p-4 space-y-3">
          <label className="block"><span className="text-xs text-muted-foreground">Tipo de unidad</span><select value={type} onChange={(event) => { setType(event.target.value as OrganizationUnitType); setParentId(""); }} className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm">{TYPES.filter((item) => item.value !== "company" || !companyExists).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          {type !== "company" && <label className="block"><span className="text-xs text-muted-foreground">Unidad superior</span><select required value={parentId} onChange={(event) => setParentId(event.target.value)} className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm"><option value="">Selecciona…</option>{parents.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.code}</option>)}</select>{parents.length === 0 && <span className="text-xs text-destructive">Primero debes crear la unidad superior requerida.</span>}</label>}
          <label className="block"><span className="text-xs text-muted-foreground">Código único</span><input required maxLength={32} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. PLANTA-01" className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm" /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Nombre</span><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre de la unidad" className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm" /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Dirección (opcional)</span><input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm" /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Descripción (opcional)</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm" /></label>
          <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-border">Cancelar</button><button type="submit" disabled={saving || (type !== "company" && parents.length === 0)} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{saving ? "Guardando…" : "Crear unidad"}</button></div>
          <p className="text-[11px] text-muted-foreground">El registro se confirma en el servidor. Si no hay conexión o Firestore rechaza la operación, no se mostrará como guardado.</p>
        </div>
      </form>
    </div>
  );
}
