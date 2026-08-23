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
  const [f, setF] = useState<Partial<Supplier>>(initial);

  async function save() {
    if (!f.name?.trim()) { toast.error("El nombre es obligatorio"); return; }
    const data = {
      name: f.name.trim(),
      nit: f.nit?.trim() ?? "",
      phone: f.phone?.trim() ?? "",
      email: f.email?.trim() ?? "",
      address: f.address?.trim() ?? "",
      notes: f.notes?.trim() ?? "",
    };
    if (f.id) await db.suppliers.update(f.id, data);
    else await db.suppliers.add({ ...data, createdAt: Date.now() });
    toast.success("Proveedor guardado");
    onClose();
  }

  return (
    <Sheet title={f.id ? "Editar proveedor" : "Nuevo proveedor"} onClose={onClose}>
      <Field label="Nombre / Razón social" value={f.name ?? ""} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="NIT" value={f.nit ?? ""} onChange={(v) => setF({ ...f, nit: v })} />
      <Field label="Teléfono" value={f.phone ?? ""} onChange={(v) => setF({ ...f, phone: v })} />
      <Field label="Email" value={f.email ?? ""} onChange={(v) => setF({ ...f, email: v })} />
      <Field label="Dirección" value={f.address ?? ""} onChange={(v) => setF({ ...f, address: v })} />
      <Field label="Notas" value={f.notes ?? ""} onChange={(v) => setF({ ...f, notes: v })} />
      <button onClick={save} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
    </Sheet>
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
