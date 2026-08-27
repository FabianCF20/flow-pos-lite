import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Customer } from "@/lib/db";
import { PageHeader } from "@/components/AppShell";
import { Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Sheet, Field, Select, Group } from "./suppliers";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Clientes — ERP Importaciones" },
      { name: "description", content: "Administra la ficha completa de tus clientes: identificación tributaria, contacto, ubicación y condiciones comerciales." },
      { property: "og:title", content: "Clientes — ERP Importaciones" },
      { property: "og:description", content: "Administra la ficha completa de tus clientes: identificación tributaria, contacto, ubicación y condiciones comerciales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const items = useLiveQuery(async () => (await db.customers.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${items?.length ?? 0} registrados`} right={
        <button onClick={() => setEditing({})} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      } />
      <div className="px-4 md:px-6 space-y-2">
        {items?.map((c) => (
          <button key={c.id} onClick={() => setEditing(c)} className="w-full text-left rounded-xl bg-card border border-border p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {c.name}{c.tradeName ? ` · ${c.tradeName}` : ""}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {[c.doc && `${c.docType ?? "CC"} ${c.doc}`, c.phone, c.city].filter(Boolean).join(" · ") || "Sin datos"}
              </div>
            </div>
            {(c.paymentTerms ?? 0) > 0 && (
              <span className="text-[11px] px-2 py-1 rounded-lg bg-muted text-muted-foreground shrink-0">{c.paymentTerms}d</span>
            )}
          </button>
        ))}
        {items?.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">Sin clientes</div>}
      </div>
      {editing && <CustomerSheet initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CustomerSheet({ initial, onClose }: { initial: Partial<Customer>; onClose: () => void }) {
  const [f, setF] = useState<Partial<Customer>>({
    docType: "CC", personType: "natural", country: "Colombia", active: true, ...initial,
  });
  const set = (k: keyof Customer) => (v: any) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.name?.trim()) { toast.error("El nombre es obligatorio"); return; }
    const t = (v?: string) => v?.trim() ?? "";
    const data: Omit<Customer, "id" | "createdAt"> = {
      name: f.name.trim(),
      tradeName: t(f.tradeName),
      docType: f.docType ?? "CC",
      doc: t(f.doc),
      dv: t(f.dv),
      personType: f.personType ?? "natural",
      taxRegime: f.taxRegime,
      phone: t(f.phone),
      phone2: t(f.phone2),
      email: t(f.email),
      contactName: t(f.contactName),
      contactPhone: t(f.contactPhone),
      address: t(f.address),
      city: t(f.city),
      state: t(f.state),
      country: t(f.country),
      postalCode: t(f.postalCode),
      website: t(f.website),
      priceList: t(f.priceList),
      paymentTerms: Number(f.paymentTerms) || 0,
      creditLimit: Number(f.creditLimit) || 0,
      taxExempt: f.taxExempt ?? false,
      seller: t(f.seller),
      notes: t(f.notes),
      active: f.active ?? true,
    };
    if (f.id) await db.customers.update(f.id, data);
    else await db.customers.add({ ...data, createdAt: Date.now() });
    toast.success("Cliente guardado");
    onClose();
  }

  async function remove() {
    if (!f.id) return;
    if (!confirm("¿Eliminar cliente?")) return;
    await db.customers.delete(f.id);
    toast.success("Eliminado");
    onClose();
  }

  return (
    <Sheet title={f.id ? "Editar cliente" : "Nuevo cliente"} onClose={onClose}>
      <Group title="Identificación" />
      <Field label="Nombre / Razón social" value={f.name ?? ""} onChange={set("name")} />
      <Field label="Nombre comercial" value={f.tradeName ?? ""} onChange={set("tradeName")} />
      <div className="grid grid-cols-3 gap-2">
        <Select label="Tipo doc." value={f.docType ?? "CC"} onChange={set("docType")} options={["CC", "NIT", "CE", "PP", "TI", "PEP", "NITE"]} />
        <Field label="Documento" value={f.doc ?? ""} onChange={set("doc")} />
        <Field label="DV" value={f.dv ?? ""} onChange={set("dv")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Tipo de persona" value={f.personType ?? "natural"} onChange={set("personType")} options={["natural", "juridica"]} />
        <Select label="Régimen tributario" value={f.taxRegime ?? ""} onChange={set("taxRegime")} options={["", "comun", "simplificado", "gran_contribuyente", "no_responsable_iva", "regimen_simple"]} />
      </div>

      <Group title="Contacto" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Teléfono" value={f.phone ?? ""} onChange={set("phone")} />
        <Field label="Teléfono alterno" value={f.phone2 ?? ""} onChange={set("phone2")} />
      </div>
      <Field label="Email" value={f.email ?? ""} onChange={set("email")} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Persona de contacto" value={f.contactName ?? ""} onChange={set("contactName")} />
        <Field label="Tel. contacto" value={f.contactPhone ?? ""} onChange={set("contactPhone")} />
      </div>
      <Field label="Sitio web" value={f.website ?? ""} onChange={set("website")} />

      <Group title="Ubicación" />
      <Field label="Dirección" value={f.address ?? ""} onChange={set("address")} />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Ciudad" value={f.city ?? ""} onChange={set("city")} />
        <Field label="Departamento" value={f.state ?? ""} onChange={set("state")} />
        <Field label="País" value={f.country ?? ""} onChange={set("country")} />
      </div>
      <Field label="Código postal" value={f.postalCode ?? ""} onChange={set("postalCode")} />

      <Group title="Condiciones comerciales" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Plazo de pago (días)" type="number" value={String(f.paymentTerms ?? "")} onChange={set("paymentTerms")} />
        <Field label="Cupo de crédito" type="number" value={String(f.creditLimit ?? "")} onChange={set("creditLimit")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Lista de precios / segmento" value={f.priceList ?? ""} onChange={set("priceList")} />
        <Field label="Vendedor asignado" value={f.seller ?? ""} onChange={set("seller")} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.taxExempt ?? false} onChange={(e) => set("taxExempt")(e.target.checked)} className="h-4 w-4" />
        Exento de IVA
      </label>

      <Field label="Notas" value={f.notes ?? ""} onChange={set("notes")} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active")(e.target.checked)} className="h-4 w-4" />
        Cliente activo
      </label>

      <div className="flex gap-2 pt-1">
        {f.id && <button onClick={remove} className="h-12 px-4 rounded-xl border border-destructive/40 text-destructive"><Trash2 className="h-4 w-4" /></button>}
        <button onClick={save} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
      </div>
    </Sheet>
  );
}
