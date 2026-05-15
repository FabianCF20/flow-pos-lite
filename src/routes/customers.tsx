import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Customer } from "@/lib/db";
import { PageHeader } from "@/components/AppShell";
import { Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/customers")({ component: CustomersPage });

function CustomersPage() {
  const items = useLiveQuery(() => db.customers.toArray(), []);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [show, setShow] = useState(false);

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${items?.length ?? 0} registrados`} right={
        <button onClick={() => { setEditing(null); setShow(true); }} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      } />
      <div className="px-4 md:px-6 space-y-2">
        {items?.map((c) => (
          <button key={c.id} onClick={() => { setEditing(c); setShow(true); }} className="w-full text-left rounded-xl bg-card border border-border p-3">
            <div className="font-medium">{c.name}</div>
            <div className="text-xs text-muted-foreground">{[c.doc, c.phone].filter(Boolean).join(" · ") || "Sin datos"}</div>
          </button>
        ))}
        {items?.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">Sin clientes</div>}
      </div>
      {show && <CustomerForm customer={editing} onClose={() => setShow(false)} />}
    </div>
  );
}

function CustomerForm({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [doc, setDoc] = useState(customer?.doc ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  async function save() {
    if (!name.trim()) { toast.error("Nombre requerido"); return; }
    const data = { name: name.trim(), doc, phone, email, notes, createdAt: customer?.createdAt ?? Date.now() };
    if (customer?.id) await db.customers.update(customer.id, data);
    else await db.customers.add(data);
    toast.success("Guardado"); onClose();
  }
  async function remove() {
    if (!customer?.id) return;
    if (!confirm("¿Eliminar?")) return;
    await db.customers.delete(customer.id); toast.success("Eliminado"); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-md md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">{customer ? "Editar" : "Nuevo"} cliente</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          {[
            { l: "Nombre", v: name, set: setName, auto: true },
            { l: "Documento", v: doc, set: setDoc },
            { l: "Teléfono", v: phone, set: setPhone },
            { l: "Email", v: email, set: setEmail },
            { l: "Notas", v: notes, set: setNotes },
          ].map((f, i) => (
            <label key={i} className="block">
              <span className="text-xs text-muted-foreground">{f.l}</span>
              <input value={f.v} onChange={(e) => f.set(e.target.value)} autoFocus={f.auto} className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border outline-none focus:border-primary text-sm" />
            </label>
          ))}
          <div className="flex gap-2 pt-2">
            {customer && <button onClick={remove} className="h-12 px-4 rounded-xl border border-destructive/40 text-destructive"><Trash2 className="h-4 w-4" /></button>}
            <button onClick={save} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}