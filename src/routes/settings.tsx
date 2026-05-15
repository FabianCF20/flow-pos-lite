import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, useEffect } from "react";
import { db, getSettings, type AppSettings, type User } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { exportBackup, importBackup, downloadBlob } from "@/lib/backup";
import { isBluetoothSupported, pickPrinter, printText } from "@/lib/printer";
import { Download, Upload, Printer, Plus, Trash2, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const users = useLiveQuery(() => db.users.toArray(), []);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState<AppSettings | null>(null);

  useEffect(() => { if (settings) setS(settings); }, [settings]);

  async function save() {
    if (!s) return;
    if (s.id) await db.settings.update(s.id, s);
    else await db.settings.add(s);
    toast.success("Guardado");
  }

  async function doExport() {
    const blob = await exportBackup();
    downloadBlob(blob, `pos-backup-${new Date().toISOString().slice(0,10)}.json`);
    toast.success("Backup descargado");
  }
  async function doImport(f: File) {
    if (!confirm("Esto reemplazará TODOS los datos. ¿Continuar?")) return;
    try { await importBackup(f); toast.success("Datos importados"); location.reload(); }
    catch { toast.error("Archivo inválido"); }
  }
  async function pairPrinter() {
    if (!isBluetoothSupported()) { toast.error("Bluetooth no soportado"); return; }
    try {
      const dev = await pickPrinter();
      await printText("\n  Prueba de impresion\n  POS Offline\n");
      if (s) setS({ ...s, printerName: dev.name ?? "Impresora BT" });
      toast.success("Impresora pareada");
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  if (!s) return null;

  return (
    <div>
      <PageHeader title="Ajustes" subtitle="Negocio, usuarios, backup, impresora" />
      <div className="px-4 md:px-6 space-y-4 max-w-2xl">
        <Section title="Negocio">
          <Inp label="Nombre" value={s.businessName} onChange={(v) => setS({ ...s, businessName: v })} />
          <Inp label="Dirección" value={s.address ?? ""} onChange={(v) => setS({ ...s, address: v })} />
          <Inp label="Teléfono" value={s.phone ?? ""} onChange={(v) => setS({ ...s, phone: v })} />
          <Inp label="NIT / RUC" value={s.taxId ?? ""} onChange={(v) => setS({ ...s, taxId: v })} />
          <Inp label="Pie de ticket" value={s.receiptFooter ?? ""} onChange={(v) => setS({ ...s, receiptFooter: v })} />
          <button onClick={save} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium">Guardar</button>
        </Section>

        <Section title="Impresora Bluetooth">
          <div className="text-sm text-muted-foreground">{s.printerName ? `Pareada: ${s.printerName}` : "Sin impresora pareada"}</div>
          <button onClick={pairPrinter} className="w-full h-11 rounded-xl bg-card border border-border font-medium inline-flex items-center justify-center gap-2">
            <Printer className="h-4 w-4" /> Parear / Probar impresión
          </button>
          <p className="text-xs text-muted-foreground">Requiere Chrome para Android e impresora térmica ESC/POS Bluetooth.</p>
        </Section>

        <Section title="Usuarios">
          <UsersList users={users ?? []} currentId={user?.id} />
        </Section>

        <Section title="Backup">
          <button onClick={doExport} className="w-full h-11 rounded-xl bg-card border border-border font-medium inline-flex items-center justify-center gap-2">
            <Download className="h-4 w-4" /> Exportar JSON
          </button>
          <label className="w-full h-11 rounded-xl bg-card border border-border font-medium inline-flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" /> Importar JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          </label>
        </Section>

        <button onClick={() => { logout(); navigate({ to: "/login" }); }} className="w-full h-12 rounded-xl border border-border text-destructive font-medium inline-flex items-center justify-center gap-2 mb-4">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function UsersList({ users, currentId }: { users: User[]; currentId?: number }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState(""); const [pin, setPin] = useState(""); const [role, setRole] = useState<"admin"|"cashier">("cashier");

  async function add() {
    if (!name.trim() || pin.length < 4) { toast.error("Nombre y PIN (4+) requeridos"); return; }
    await db.users.add({ name, pin, role, active: true, createdAt: Date.now() });
    setName(""); setPin(""); setShow(false); toast.success("Usuario creado");
  }
  async function remove(u: User) {
    if (u.id === currentId) { toast.error("No puedes eliminar tu sesión"); return; }
    if (!confirm(`¿Eliminar ${u.name}?`)) return;
    await db.users.delete(u.id!); toast.success("Eliminado");
  }

  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u.id} className="rounded-lg bg-background border border-border p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/15 grid place-items-center text-primary font-bold">{u.name[0]?.toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{u.name} {u.id === currentId && <span className="text-xs text-muted-foreground">(tú)</span>}</div>
            <div className="text-xs text-muted-foreground capitalize">{u.role}</div>
          </div>
          <button onClick={() => remove(u)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      {!show ? (
        <button onClick={() => setShow(true)} className="w-full h-11 rounded-xl bg-card border border-border font-medium inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" /> Nuevo usuario</button>
      ) : (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm" />
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN" inputMode="numeric" maxLength={6} className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm">
            <option value="cashier">Cajero</option>
            <option value="admin">Administrador</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => setShow(false)} className="flex-1 h-10 rounded-lg border border-border text-sm">Cancelar</button>
            <button onClick={add} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: any) {
  return <div className="rounded-xl bg-card border border-border p-4 space-y-3"><div className="font-semibold">{title}</div>{children}</div>;
}
function Inp({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="block"><span className="text-xs text-muted-foreground">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border outline-none focus:border-primary text-sm" /></label>;
}