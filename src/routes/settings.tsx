import { pageHead } from "@/lib/page-head";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, useEffect } from "react";
import { db, getSettings, type AppSettings } from "@/lib/db";
import { createDirectoryUser, listDirectory, listRoles, updateDirectoryUser, type DirectoryUser } from "@/lib/users";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { listOrganizationUnits, type OrganizationUnit } from "@/lib/cloud-organization";
import { exportBackup, importBackup, downloadBlob } from "@/lib/backup";
import { isBluetoothSupported, pickPrinter, printText } from "@/lib/printer";
import { Download, Upload, Printer, Plus, Trash2, LogOut, FileCheck2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { testFactusAuth, isFactusConfigured } from "@/lib/factus";
import { FactusExtra } from "@/components/FactusExtra";

export const Route = createFileRoute("/settings")({ head: () => pageHead("Ajustes", "Configura empresa, usuarios, facturación y respaldos."), component: SettingsPage });

function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  
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
      <div className="px-4 md:px-6 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
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

        <Section title="Facturación electrónica (Factus)">
          <p className="text-xs text-muted-foreground">
            Emite facturas electrónicas validadas por la DIAN a través de Factus.
            Necesitas una suscripción activa en{" "}
            <a href="https://factus.com.co" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
              factus.com.co <ExternalLink className="h-3 w-3" />
            </a>
            {" "}y las credenciales de API.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!s.factusEnabled}
              onChange={(e) => setS({ ...s, factusEnabled: e.target.checked })}
              className="h-4 w-4"
            />
            Activar facturación electrónica con Factus
          </label>

          {s.factusEnabled && (
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">Entorno</span>
                <select
                  value={s.factusEnv ?? "sandbox"}
                  onChange={(e) => setS({ ...s, factusEnv: e.target.value as any })}
                  className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm"
                >
                  <option value="sandbox">Sandbox (pruebas)</option>
                  <option value="production">Producción</option>
                </select>
              </label>
              <Inp label="Email de Factus" value={s.factusEmail ?? ""} onChange={(v) => setS({ ...s, factusEmail: v })} />
              <label className="block">
                <span className="text-xs text-muted-foreground">Contraseña</span>
                <input
                  type="password"
                  value={s.factusPassword ?? ""}
                  onChange={(e) => setS({ ...s, factusPassword: e.target.value })}
                  className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm"
                />
              </label>
              <Inp label="Client ID" value={s.factusClientId ?? ""} onChange={(v) => setS({ ...s, factusClientId: v })} />
              <Inp label="Client Secret" value={s.factusClientSecret ?? ""} onChange={(v) => setS({ ...s, factusClientSecret: v })} />
              <label className="block">
                <span className="text-xs text-muted-foreground">ID rango de numeración</span>
                <input
                  type="number"
                  value={s.factusNumberingRange ?? ""}
                  onChange={(e) => setS({ ...s, factusNumberingRange: Number(e.target.value) || undefined })}
                  placeholder="Ej: 8"
                  className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Tipo de documento por defecto del cliente</span>
                <select
                  value={s.factusDefaultDocType ?? "CC"}
                  onChange={(e) => setS({ ...s, factusDefaultDocType: e.target.value })}
                  className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm"
                >
                  <option value="CC">Cédula de ciudadanía</option>
                  <option value="CE">Cédula de extranjería</option>
                  <option value="NIT">NIT</option>
                  <option value="TI">Tarjeta de identidad</option>
                  <option value="PAS">Pasaporte</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">ID municipio (DIAN)</span>
                <input
                  type="number"
                  value={s.factusMunicipalityId ?? ""}
                  onChange={(e) => setS({ ...s, factusMunicipalityId: Number(e.target.value) || undefined })}
                  placeholder="Ej: 980 (Bogotá)"
                  className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm"
                />
              </label>

              <FactusExtra s={s} setS={setS} />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={save}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-medium"
                >
                  Guardar
                </button>
                <button
                  onClick={async () => {
                    if (!isFactusConfigured(s)) { toast.error("Completa las credenciales"); return; }
                    const r = await testFactusAuth(s);
                    r.ok ? toast.success(r.message) : toast.error(r.message);
                  }}
                  className="h-11 rounded-xl bg-card border border-border font-medium inline-flex items-center justify-center gap-2"
                >
                  <FileCheck2 className="h-4 w-4" /> Probar conexión
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Consulta tu <b>rango de numeración</b>, <b>client_id</b>, <b>client_secret</b> y municipios en el panel de Factus.
                Docs: <a href="https://developers.factus.com.co/" target="_blank" rel="noreferrer" className="text-primary underline">developers.factus.com.co</a>
              </p>
            </div>
          )}
        </Section>

        <Section title="Usuarios">
          <UsersList currentEmail={user?.email?.toLowerCase()} isAdmin={user?.role === "admin"} />
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

function UsersList({ currentEmail, isAdmin }: { currentEmail?: string; isAdmin: boolean }) {
  const [list, setList] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [warehouseUnits, setWarehouseUnits] = useState<OrganizationUnit[]>([]);
  const [scopeTarget, setScopeTarget] = useState<DirectoryUser | null>(null);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [allWarehouses, setAllWarehouses] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("production_operator");
  const [password, setPassword] = useState("");

  async function reload() {
    try {
      const [users, availableRoles, organizationUnits] = await Promise.all([
        listDirectory(),
        listRoles(),
        listOrganizationUnits(),
      ]);
      setList(users);
      setRoles(availableRoles);
      setWarehouseUnits(organizationUnits.filter((unit) => unit.type === "warehouse" && unit.active));
      if (availableRoles.length && !availableRoles.some((item) => item.id === role)) {
        setRole(availableRoles[0].id);
      }
      setError(null);
    }
    catch { setError("No se pudo cargar la lista (revisa la conexión o los permisos)"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function invite() {
    try {
      await createDirectoryUser({ email, name, password, roleId: role, overrides: {} });
      toast.success("Usuario creado");
      setEmail(""); setName(""); setPassword(""); setShow(false); reload();
    } catch (e: any) { toast.error(e?.message ?? "No se pudo invitar"); }
  }
  async function toggle(u: DirectoryUser) {
    try { await updateDirectoryUser(u, { active: !u.active }); reload(); toast.success(u.active ? "Desactivado" : "Activado"); }
    catch { toast.error("No se pudo actualizar"); }
  }
  async function changeRole(u: DirectoryUser, r: string) {
    try { await updateDirectoryUser(u, { roleId: r }); reload(); toast.success("Rol actualizado"); }
    catch { toast.error("No se pudo actualizar"); }
  }

  function openWarehouseScope(u: DirectoryUser) {
    setScopeTarget(u);
    setSelectedWarehouseIds(u.warehouseIds ?? []);
    setAllWarehouses(u.allWarehouses === true);
  }

  async function saveWarehouseScope() {
    if (!scopeTarget) return;
    try {
      await updateDirectoryUser(scopeTarget, {
        warehouseIds: allWarehouses ? [] : selectedWarehouseIds,
        allWarehouses,
      });
      toast.success("Alcance de bodegas actualizado");
      setScopeTarget(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar el alcance");
    }
  }
  async function remove(u: DirectoryUser) {
    if (u.email === currentEmail) { toast.error("No puedes quitar tu propia cuenta"); return; }
    if (!confirm(`¿Quitar el acceso de ${u.name}?`)) return;
    try { await updateDirectoryUser(u, { active: false }); reload(); toast.success("Acceso retirado"); }
    catch (e: any) { toast.error(e?.message ?? "No se pudo quitar"); }
  }

  if (!isAdmin) return <p className="text-xs text-muted-foreground">Solo un administrador puede gestionar usuarios.</p>;
  if (loading) return <p className="text-xs text-muted-foreground">Cargando usuarios…</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {list.map((u) => (
        <div key={u.key} className="rounded-lg bg-background border border-border p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/15 grid place-items-center text-primary font-bold">{u.name[0]?.toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {u.name} {u.email === currentEmail && <span className="text-xs text-muted-foreground">(tú)</span>}
            </div>
            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
            <div className="text-[11px] mt-0.5 flex gap-2">
              {u.pending && <span className="text-gold">Pendiente de primer ingreso</span>}
              {!u.active && <span className="text-destructive">Desactivado</span>}
            </div>
          </div>
          <select
            value={u.roleId}
            onChange={(e) => changeRole(u, e.target.value)}
            className="h-9 px-2 rounded-lg bg-card border border-border text-xs"
          >
            {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button onClick={() => openWarehouseScope(u)} className="h-9 px-2 rounded-lg bg-muted text-xs inline-flex items-center gap-1">
            <Boxes className="h-3.5 w-3.5" /> Bodegas
          </button>
          <button onClick={() => toggle(u)} className="text-xs text-muted-foreground hover:text-foreground underline">
            {u.active ? "Desactivar" : "Activar"}
          </button>
          <button onClick={() => remove(u)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      {scopeTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="w-full md:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-card border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Alcance de inventario</div>
                <div className="text-xs text-muted-foreground">{scopeTarget.name} · {scopeTarget.email}</div>
              </div>
              <button onClick={() => setScopeTarget(null)} className="text-sm text-muted-foreground">Cerrar</button>
            </div>
            <label className="flex items-center gap-2 rounded-lg bg-background border border-border p-3 text-sm">
              <input type="checkbox" checked={allWarehouses} onChange={(event) => setAllWarehouses(event.target.checked)} />
              Acceso a todas las bodegas
            </label>
            {!allWarehouses && (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {warehouseUnits.map((warehouse) => {
                  const site = warehouseUnits.find((unit) => unit.id === warehouse.siteId);
                  const area = warehouseUnits.find((unit) => unit.id === warehouse.areaId);
                  const selected = selectedWarehouseIds.includes(warehouse.id);
                  return (
                    <label key={warehouse.id} className="flex items-start gap-3 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => setSelectedWarehouseIds((current) =>
                          event.target.checked
                            ? [...current, warehouse.id]
                            : current.filter((id) => id !== warehouse.id)
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{warehouse.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {site?.name ?? "Sede no definida"}{area ? ` · ${area.name}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {warehouseUnits.length === 0 && <p className="p-4 text-xs text-muted-foreground">Primero crea bodegas en Estructura organizacional.</p>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Sin bodegas asignadas, el usuario no podrá consultar ni modificar inventario ni operar órdenes en una bodega.</p>
            <div className="flex gap-2">
              <button onClick={() => setScopeTarget(null)} className="flex-1 h-10 rounded-lg border border-border text-sm">Cancelar</button>
              <button onClick={saveWarehouseScope} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Guardar alcance</button>
            </div>
          </div>
        </div>
      )}
      {!show ? (
        <button onClick={() => setShow(true)} className="w-full h-11 rounded-xl bg-card border border-border font-medium inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" /> Invitar usuario</button>
      ) : (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" type="email" inputMode="email" className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña inicial (mínimo 6 caracteres)" type="password" autoComplete="new-password" className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm">
            {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Se creará la cuenta con este correo y la contraseña inicial. El usuario podrá cambiarla después.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShow(false)} className="flex-1 h-10 rounded-lg border border-border text-sm">Cancelar</button>
            <button onClick={invite} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Invitar</button>
          </div>
        </div>
      )}
    </div>
  );
}


function Section({ title, children }: any) {
  return <div className="min-w-0 border-t border-border pt-4 space-y-3"><div className="font-semibold">{title}</div>{children}</div>;
}
function Inp({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="block"><span className="text-xs text-muted-foreground">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border outline-none focus:border-primary text-sm" /></label>;
}