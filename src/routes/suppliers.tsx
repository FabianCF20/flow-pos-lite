import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Supplier } from "@/lib/db";
import { PageHeader } from "@/components/AppShell";
import { Plus, X, Truck, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Proveedores — ERP" },
      { name: "description", content: "Gestiona proveedores, contactos y datos tributarios de tu empresa." },
      { property: "og:title", content: "Proveedores — ERP" },
      { property: "og:description", content: "Gestiona proveedores, contactos y datos tributarios de tu empresa." },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const suppliers = useLiveQuery(async () => (await db.suppliers.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle={`${suppliers?.length ?? 0} registrados`}
        right={
          <button onClick={() => setEditing({})} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        }
      />
      <div className="px-4 md:px-6 space-y-2">
        {suppliers?.map((s) => (
          <div key={s.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center">
              <Truck className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{s.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[s.nit && `NIT ${s.nit}`, s.phone, s.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
              </div>
            </div>
            <button onClick={() => setEditing(s)} className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><Pencil className="h-4 w-4" /></button>
            <button
              onClick={async () => {
                if (!confirm(`¿Eliminar ${s.name}?`)) return;
                await db.suppliers.delete(s.id!);
                toast.success("Proveedor eliminado");
              }}
              className="h-9 w-9 rounded-lg bg-muted grid place-items-center text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {suppliers?.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">Aún no tienes proveedores</div>
        )}
      </div>

      {editing && <SupplierSheet initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SupplierSheet({ initial, onClose }: { initial: Partial<Supplier>; onClose: () => void }) {
  const [f, setF] = useState<Partial<Supplier>>({
    docType: "NIT", supplierType: "nacional", country: "Colombia", currency: "COP", active: true, ...initial,
  });
  const set = (k: keyof Supplier) => (v: any) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.name?.trim()) { toast.error("La razón social es obligatoria"); return; }
    const t = (v?: string) => v?.trim() ?? "";
    const data: Omit<Supplier, "id" | "createdAt"> = {
      name: f.name.trim(),
      tradeName: t(f.tradeName),
      docType: f.docType ?? "NIT",
      nit: t(f.nit),
      dv: t(f.dv),
      taxRegime: f.taxRegime,
      supplierType: f.supplierType ?? "nacional",
      phone: t(f.phone),
      phone2: t(f.phone2),
      email: t(f.email),
      contactName: t(f.contactName),
      contactPhone: t(f.contactPhone),
      contactEmail: t(f.contactEmail),
      address: t(f.address),
      city: t(f.city),
      state: t(f.state),
      country: t(f.country),
      website: t(f.website),
      currency: t(f.currency) || "COP",
      incoterm: f.incoterm,
      leadTimeDays: Number(f.leadTimeDays) || 0,
      paymentTerms: Number(f.paymentTerms) || 0,
      creditLimit: Number(f.creditLimit) || 0,
      bankName: t(f.bankName),
      bankAccount: t(f.bankAccount),
      swift: t(f.swift),
      notes: t(f.notes),
      active: f.active ?? true,
    };
    if (f.id) await db.suppliers.update(f.id, data);
    else await db.suppliers.add({ ...data, createdAt: Date.now() });
    toast.success("Proveedor guardado");
    onClose();
  }

  return (
    <Sheet title={f.id ? "Editar proveedor" : "Nuevo proveedor"} onClose={onClose}>
      <Group title="Identificación" />
      <Field label="Razón social" value={f.name ?? ""} onChange={set("name")} />
      <Field label="Nombre comercial" value={f.tradeName ?? ""} onChange={set("tradeName")} />
      <div className="grid grid-cols-3 gap-2">
        <Select label="Tipo doc." value={f.docType ?? "NIT"} onChange={set("docType")} options={["NIT", "CC", "CE", "PP", "NITE"]} />
        <Field label="Documento / NIT" value={f.nit ?? ""} onChange={set("nit")} />
        <Field label="DV" value={f.dv ?? ""} onChange={set("dv")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Tipo de proveedor" value={f.supplierType ?? "nacional"} onChange={set("supplierType")} options={["nacional", "importacion", "servicios"]} />
        <Select label="Régimen tributario" value={f.taxRegime ?? ""} onChange={set("taxRegime")} options={["", "comun", "simplificado", "gran_contribuyente", "no_responsable_iva", "regimen_simple"]} />
      </div>

      <Group title="Contacto" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Teléfono" value={f.phone ?? ""} onChange={set("phone")} />
        <Field label="Teléfono alterno" value={f.phone2 ?? ""} onChange={set("phone2")} />
      </div>
      <Field label="Email" value={f.email ?? ""} onChange={set("email")} />
      <Field label="Persona de contacto" value={f.contactName ?? ""} onChange={set("contactName")} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tel. contacto" value={f.contactPhone ?? ""} onChange={set("contactPhone")} />
        <Field label="Email contacto" value={f.contactEmail ?? ""} onChange={set("contactEmail")} />
      </div>
      <Field label="Sitio web" value={f.website ?? ""} onChange={set("website")} />

      <Group title="Ubicación" />
      <Field label="Dirección" value={f.address ?? ""} onChange={set("address")} />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Ciudad" value={f.city ?? ""} onChange={set("city")} />
        <Field label="Departamento" value={f.state ?? ""} onChange={set("state")} />
        <Field label="País" value={f.country ?? ""} onChange={set("country")} />
      </div>

      <Group title="Condiciones comerciales" />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Moneda" value={f.currency ?? "COP"} onChange={set("currency")} />
        <Select label="Incoterm" value={f.incoterm ?? ""} onChange={set("incoterm")} options={["", "EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP"]} />
        <Field label="Lead time (días)" type="number" value={String(f.leadTimeDays ?? "")} onChange={set("leadTimeDays")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Plazo de pago (días)" type="number" value={String(f.paymentTerms ?? "")} onChange={set("paymentTerms")} />
        <Field label="Cupo de crédito" type="number" value={String(f.creditLimit ?? "")} onChange={set("creditLimit")} />
      </div>

      <Group title="Datos bancarios" />
      <Field label="Banco" value={f.bankName ?? ""} onChange={set("bankName")} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cuenta" value={f.bankAccount ?? ""} onChange={set("bankAccount")} />
        <Field label="SWIFT / IBAN" value={f.swift ?? ""} onChange={set("swift")} />
      </div>

      <Field label="Notas" value={f.notes ?? ""} onChange={set("notes")} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active")(e.target.checked)} className="h-4 w-4" />
        Proveedor activo
      </label>
      <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
    </Sheet>
  );
}

export function Group({ title }: { title: string }) {
  return <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>;
}

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-11 px-2 rounded-xl bg-background border border-border text-sm"
      >
        {options.map((o) => <option key={o} value={o}>{o === "" ? "—" : o}</option>)}
      </select>
    </label>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-md md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-11 px-3 rounded-xl bg-background border border-border text-sm"
      />
    </label>
  );
}

