import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { listCloudProducts, type CloudProduct } from "@/lib/cloud-catalog";
import {
  approveProductionFormulaVersion,
  createCloudProductionOrder,
  createProductionFormula,
  createProductionFormulaVersion,
  listCloudProductionOrders,
  listProductionFormulaVersions,
  listProductionFormulas,
  type CloudProductionOrder,
  type FormulaMaterial,
  type ProductionFormula,
  type ProductionFormulaVersion,
  type ProductionArea,
} from "@/lib/cloud-production";
import { listAccessibleWarehouses, type InventoryWarehouse } from "@/lib/cloud-inventory";
import { toast } from "sonner";
import { Plus, RefreshCw, CheckCircle2, X, Save, ClipboardList, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/production")({
  head: () => ({ meta: [{ title: "Producción láctea — ERP" }] }),
  component: ProductionPage,
});

type Tab = "formulas" | "orders";
type MaterialDraft = { productId: string; quantity: string; materialType: "ingredient" | "packaging" };

function ProductionPage() {
  const { can, loading } = useAuth();
  const canRead = can("production", "read");
  const canWriteProduction = can("production", "write");
  const canWriteFormulas = can("production_formulas", "write");
  const canApprove = can("production_approval", "write");
  const [tab, setTab] = useState<Tab>("formulas");
  const [formulas, setFormulas] = useState<ProductionFormula[]>([]);
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [orders, setOrders] = useState<CloudProductionOrder[]>([]);
  const [versions, setVersions] = useState<ProductionFormulaVersion[]>([]);
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formulaEditor, setFormulaEditor] = useState<ProductionFormula | "new" | null>(null);
  const [orderEditor, setOrderEditor] = useState(false);

  const reloadBase = useCallback(async () => {
    setBusy(true);
    try {
      const [nextFormulas, nextProducts, nextWarehouses] = await Promise.all([
        listProductionFormulas(),
        listCloudProducts(),
        listAccessibleWarehouses(),
      ]);
      setFormulas(nextFormulas);
      setProducts(nextProducts);
      setWarehouses(nextWarehouses);
      setSelectedFormulaId((current) => current || nextFormulas[0]?.id || "");
      setSelectedWarehouseId((current) => current || nextWarehouses[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar producción desde Firestore.");
    } finally {
      setBusy(false);
    }
  }, []);

  const reloadVersions = useCallback(async () => {
    if (!selectedFormulaId) {
      setVersions([]);
      return;
    }
    try {
      setVersions(await listProductionFormulaVersions(selectedFormulaId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron consultar las versiones.");
    }
  }, [selectedFormulaId]);

  const reloadOrders = useCallback(async () => {
    if (!selectedWarehouseId) {
      setOrders([]);
      return;
    }
    try {
      setOrders(await listCloudProductionOrders(selectedWarehouseId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron consultar las órdenes.");
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!loading && canRead) void reloadBase();
  }, [loading, canRead, reloadBase]);

  useEffect(() => { void reloadVersions(); }, [reloadVersions]);
  useEffect(() => { void reloadOrders(); }, [reloadOrders]);

  const selectedFormula = formulas.find((formula) => formula.id === selectedFormulaId) ?? null;
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!canRead) return <div className="p-6 text-sm text-destructive">No tienes permiso para consultar producción.</div>;

  async function saveFormula(input: {
    code: string; name: string; area: ProductionArea; outputProductId: string;
    outputQuantity: number; outputUnit: string; materials: FormulaMaterial[];
  }) {
    try {
      if (formulaEditor && formulaEditor !== "new") {
        const currentVersion = versions[0];
        if (!currentVersion) throw new Error("No se encontró la versión actual de la fórmula.");
        const versionId = await createProductionFormulaVersion({
          formulaId: formulaEditor.id,
          expectedFormulaRevision: formulaEditor.revision,
          outputQuantity: input.outputQuantity,
          outputUnit: input.outputUnit,
          materials: input.materials,
          changeReason: "Nueva versión de fórmula",
        });
        toast.success(`Nueva versión creada: ${versionId.slice(0, 8)}`);
      } else {
        const formulaId = await createProductionFormula(input);
        setSelectedFormulaId(formulaId);
        toast.success("Fórmula creada en borrador");
      }
      setFormulaEditor(null);
      await reloadBase();
      await reloadVersions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la fórmula");
    }
  }

  async function approveVersion(version: ProductionFormulaVersion) {
    if (!selectedFormula) return;
    try {
      await approveProductionFormulaVersion({
        formulaId: selectedFormula.id,
        versionId: version.id,
        expectedRevision: version.revision,
      });
      toast.success("Versión aprobada");
      await reloadVersions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo aprobar la versión");
    }
  }

  async function saveOrder(input: {
    formulaId: string; formulaVersionId: string; warehouseId: string; targetQuantity: number; notes: string; idempotencyKey: string;
  }) {
    try {
      await createCloudProductionOrder(input);
      toast.success("Orden creada y confirmada en Firestore");
      setOrderEditor(false);
      setSelectedWarehouseId(input.warehouseId);
      await reloadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la orden");
    }
  }

  return (
    <div>
      <PageHeader
        title="Producción láctea"
        subtitle="Fórmulas versionadas y órdenes vinculadas a la bodega autorizada"
        right={<button onClick={() => void reloadBase()} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-2"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar</button>}
      />
      <div className="px-4 md:px-6 pb-8 space-y-4">
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          Las fórmulas y órdenes se guardan en Firestore. La ejecución/cierre de órdenes con consumo real de lotes y registro del lote terminado aún está en desarrollo; por ahora las órdenes quedan en borrador.
        </p>
        <div className="flex gap-2 border-b border-border">
          <button onClick={() => setTab("formulas")} className={`px-3 py-2.5 text-sm border-b-2 ${tab === "formulas" ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground"}`}><FlaskConical className="inline h-4 w-4 mr-1.5" /> Fórmulas</button>
          <button onClick={() => setTab("orders")} className={`px-3 py-2.5 text-sm border-b-2 ${tab === "orders" ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground"}`}><ClipboardList className="inline h-4 w-4 mr-1.5" /> Órdenes ({orders.length})</button>
        </div>

        {tab === "formulas" && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4">
            <section className="space-y-3">
              {canWriteFormulas && <button onClick={() => setFormulaEditor("new")} className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" /> Nueva fórmula</button>}
              {formulas.map((formula) => (
                <button key={formula.id} onClick={() => setSelectedFormulaId(formula.id)} className={`w-full text-left rounded-xl border p-4 ${selectedFormulaId === formula.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <div className="font-medium">{formula.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{formula.code} · {formula.area === "liquid_milk" ? "Leche líquida" : "Leche en polvo"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Versión actual: {formula.currentVersion} · {formula.active ? "Activa" : "Inactiva"}</div>
                </button>
              ))}
              {formulas.length === 0 && <Empty text="Todavía no hay fórmulas. Crea la primera cuando el catálogo de materias primas y productos terminados esté configurado." />}
            </section>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              {!selectedFormula ? <Empty text="Selecciona una fórmula para consultar sus versiones." /> : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-semibold">{selectedFormula.name}</h2><p className="text-xs text-muted-foreground">{selectedFormula.code} · {selectedFormula.outputProductName ?? "Producto terminado"}</p></div>
                    {canWriteFormulas && <button onClick={() => setFormulaEditor(selectedFormula)} className="h-9 px-3 rounded-lg bg-muted text-xs">Nueva versión</button>}
                  </div>
                  {versions.map((version) => (
                    <div key={version.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Versión {version.version} · Rendimiento {version.outputQuantity} {version.outputUnit}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${version.status === "approved" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-700"}`}>{version.status === "approved" ? "Aprobada" : "Borrador"}</span>
                      </div>
                      <div className="space-y-1">
                        {version.materials.map((material) => <div key={material.productId} className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{material.productName} · {material.materialType === "packaging" ? "Empaque" : "Ingrediente"}</span><span>{material.quantity} {material.unit}</span></div>)}
                      </div>
                      {version.status === "draft" && canApprove && version.version === selectedFormula.currentVersion && (
                        <button onClick={() => void approveVersion(version)} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Aprobar versión</button>
                      )}
                    </div>
                  ))}
                  {versions.length === 0 && <Empty text="No hay versiones registradas." />}
                </>
              )}
            </section>
          </div>
        )}

        {tab === "orders" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="min-w-[220px] flex-1 max-w-md"><span className="text-xs text-muted-foreground">Bodega de producción autorizada</span><select value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)} className="control mt-1">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
              {canWriteProduction && <button onClick={() => setOrderEditor(true)} disabled={!warehouses.length || !formulas.length} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm inline-flex items-center gap-2 disabled:opacity-50"><Plus className="h-4 w-4" /> Nueva orden</button>}
            </div>
            {orders.map((order) => (
              <article key={order.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{order.outputProductName}</span><span className="text-[10px] rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5">{order.status === "draft" ? "Borrador" : order.status}</span></div>
                <p className="text-xs text-muted-foreground mt-1">Orden {order.id.slice(0, 8)} · {order.formulaCode} v{order.formulaVersion}</p>
                <p className="text-sm mt-2">{order.targetQuantity} {order.outputUnit}</p>
                <p className="text-xs text-muted-foreground mt-1">{order.materials.length} materiales en snapshot · {new Date(order.createdAt).toLocaleString("es-CO")}</p>
              </article>
            ))}
            {!orders.length && <Empty text={warehouses.length ? "No hay órdenes para esta bodega." : "No tienes bodegas asignadas. Solicita al administrador que asigne tu alcance."} />}
          </section>
        )}
      </div>

      {formulaEditor && (
        <FormulaEditor
          value={formulaEditor === "new" ? null : formulaEditor}
          products={products}
          currentVersion={formulaEditor === "new" ? null : versions[0] ?? null}
          onClose={() => setFormulaEditor(null)}
          onSave={saveFormula}
        />
      )}
      {orderEditor && (
        <OrderEditor
          formulas={formulas}
          warehouses={warehouses}
          onClose={() => setOrderEditor(false)}
          onSave={saveOrder}
        />
      )}
    </div>
  );
}

function FormulaEditor({ value, products, currentVersion, onClose, onSave }: {
  value: ProductionFormula | null;
  products: CloudProduct[];
  currentVersion: ProductionFormulaVersion | null;
  onClose: () => void;
  onSave: (input: { code: string; name: string; area: ProductionArea; outputProductId: string; outputQuantity: number; outputUnit: string; materials: FormulaMaterial[] }) => Promise<void>;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [area, setArea] = useState<ProductionArea>(value?.area ?? "liquid_milk");
  const [outputProductId, setOutputProductId] = useState(value?.outputProductId ?? products.find((product) => product.productType === "finished_product")?.id ?? "");
  const outputProduct = products.find((product) => product.id === outputProductId);
  const [outputQuantity, setOutputQuantity] = useState(String(currentVersion?.outputQuantity ?? 100));
  const [materials, setMaterials] = useState<MaterialDraft[]>(currentVersion?.materials.map((material) => ({ productId: material.productId, quantity: String(material.quantity), materialType: material.materialType })) ?? []);
  const [saving, setSaving] = useState(false);
  const isVersion = !!value;

  function addMaterial() {
    setMaterials((items) => [...items, { productId: "", quantity: "1", materialType: "ingredient" }]);
  }
  function updateMaterial(index: number, patch: Partial<MaterialDraft>) {
    setMaterials((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function removeMaterial(index: number) {
    setMaterials((items) => items.filter((_, i) => i !== index));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const prepared = materials.map((material) => {
        const product = products.find((item) => item.id === material.productId);
        if (!product) throw new Error("Selecciona todos los materiales de la fórmula.");
        return {
          productId: product.id,
          quantity: Number(material.quantity),
          unit: product.baseUnit,
          materialType: material.materialType,
        };
      });
      await onSave({
        code,
        name,
        area,
        outputProductId,
        outputQuantity: Number(outputQuantity),
        outputUnit: outputProduct?.baseUnit ?? "",
        materials: prepared,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revisa los datos de la fórmula");
    } finally {
      setSaving(false);
    }
  }

  const allowedProducts = (materialType: MaterialDraft["materialType"]) => products.filter((product) =>
    product.active && product.trackInventory && (materialType === "packaging"
      ? product.productType === "packaging"
      : ["raw_material", "finished_product"].includes(product.productType))
  );

  return (
    <Modal title={isVersion ? `Nueva versión · ${value?.name}` : "Nueva fórmula"} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        {!isVersion && <>
          <Field label="Código"><input required maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} className="control" /></Field>
          <Field label="Nombre"><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="control" /></Field>
          <Field label="Área"><select value={area} onChange={(event) => setArea(event.target.value as ProductionArea)} className="control"><option value="liquid_milk">Leche líquida</option><option value="powder_milk">Leche en polvo</option></select></Field>
          <Field label="Producto terminado"><select required value={outputProductId} onChange={(event) => setOutputProductId(event.target.value)} className="control"><option value="">Selecciona…</option>{products.filter((product) => product.active && product.trackInventory && product.productType === "finished_product").map((product) => <option key={product.id} value={product.id}>{product.name} · {product.baseUnit}</option>)}</select></Field>
        </>}
        <Field label="Rendimiento de la fórmula"><input required type="number" min="0.0001" step="0.0001" value={outputQuantity} onChange={(event) => setOutputQuantity(event.target.value)} className="control" /></Field>
        <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Materiales e ingredientes</span><button type="button" onClick={addMaterial} className="text-xs text-primary inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar</button></div>
        {materials.map((material, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_100px_110px_32px] gap-2 items-end">
            <Field label="Producto"><select required value={material.productId} onChange={(event) => updateMaterial(index, { productId: event.target.value })} className="control"><option value="">Selecciona producto…</option>{allowedProducts(material.materialType).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
            <Field label="Tipo"><select value={material.materialType} onChange={(event) => updateMaterial(index, { materialType: event.target.value as MaterialDraft["materialType"], productId: "" })} className="control"><option value="ingredient">Ingrediente</option><option value="packaging">Empaque</option></select></Field>
            <Field label="Cantidad"><input required type="number" min="0.0001" step="0.0001" value={material.quantity} onChange={(event) => updateMaterial(index, { quantity: event.target.value })} className="control" /></Field>
            <button type="button" onClick={() => removeMaterial(index)} className="h-10 rounded-lg bg-muted text-muted-foreground"><X className="h-4 w-4 mx-auto" /></button>
          </div>
        ))}
        <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm">Cancelar</button><button type="submit" disabled={saving || !outputProductId || !materials.length} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Guardando…" : isVersion ? "Crear versión" : "Crear fórmula"}</button></div>
      </form>
    </Modal>
  );
}

function OrderEditor({ formulas, warehouses, onClose, onSave }: {
  formulas: ProductionFormula[];
  warehouses: InventoryWarehouse[];
  onClose: () => void;
  onSave: (input: { formulaId: string; formulaVersionId: string; warehouseId: string; targetQuantity: number; notes: string; idempotencyKey: string }) => Promise<void>;
}) {
  const [formulaId, setFormulaId] = useState(formulas[0]?.id ?? "");
  const [versions, setVersions] = useState<ProductionFormulaVersion[]>([]);
  const [versionId, setVersionId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [quantity, setQuantity] = useState("100");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!formulaId) { setVersions([]); setVersionId(""); return; }
    setVersionId("");
    setVersions([]);
    listProductionFormulaVersions(formulaId).then((items) => {
      const approved = items.filter((item) => item.status === "approved");
      setVersions(approved);
      setVersionId(approved[0]?.id ?? "");
    }).catch((error) => toast.error(error instanceof Error ? error.message : "No se pudieron consultar versiones aprobadas."));
  }, [formulaId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        formulaId,
        formulaVersionId: versionId,
        warehouseId,
        targetQuantity: Number(quantity),
        notes,
        idempotencyKey,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nueva orden de producción" onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <Field label="Fórmula"><select required value={formulaId} onChange={(event) => setFormulaId(event.target.value)} className="control">{formulas.filter((formula) => formula.active).map((formula) => <option key={formula.id} value={formula.id}>{formula.code} · {formula.name}</option>)}</select></Field>
        <Field label="Versión aprobada"><select required value={versionId} onChange={(event) => setVersionId(event.target.value)} className="control">{versions.map((version) => <option key={version.id} value={version.id}>Versión {version.version} · {version.outputQuantity} {version.outputUnit}</option>)}</select>{!versions.length && <span className="text-xs text-destructive">Esta fórmula no tiene versiones aprobadas.</span>}</Field>
        <Field label="Bodega"><select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="control">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
        <Field label="Cantidad a producir"><input required type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="control" /></Field>
        <Field label="Notas"><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="control" /></Field>
        <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm">Cancelar</button><button type="submit" disabled={saving || !versionId || !warehouseId} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{saving ? "Guardando…" : "Crear orden"}</button></div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"><div className="w-full md:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-card border border-border"><div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between"><span className="font-semibold">{title}</span><button type="button" onClick={onClose}><X className="h-5 w-5" /></button></div>{children}</div></div>;
}
