import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type Measure, type Product, type ProductionRecipe, type Warehouse } from "@/lib/db";
import { saveMeasure, saveRecipe, createProductionOrder, convertQuantity } from "@/lib/production";
import { useAuth } from "@/lib/auth";

export const controlClass = "mt-1 w-full min-w-0 h-11 rounded-md border border-input bg-background px-3 text-sm";
export function ProductionField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
export function ProductionModal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent aria-describedby={undefined} className="max-w-2xl w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto rounded-lg p-4 sm:p-6"><DialogTitle>{title}</DialogTitle>{children}</DialogContent></Dialog>;
}

export function MeasureForm({ measure, measures, close }: { measure?: Measure; measures: Measure[]; close: () => void }) {
  const [name, setName] = useState(measure?.name ?? "");
  const [symbol, setSymbol] = useState(measure?.symbol ?? "");
  const [group, setGroup] = useState(measure?.group ?? "");
  const [factor, setFactor] = useState(String(measure?.factor ?? 1));
  const [referenceId, setReferenceId] = useState(String(measure?.referenceMeasureId ?? ""));
  const [referenceQty, setReferenceQty] = useState(String(measure?.referenceQty ?? 1));
  const reference = measures.find(m => m.id === Number(referenceId));
  const eligible = measures.filter(m => {
    const seen = new Set<number>();
    let current: Measure | undefined = m;
    while (current?.id !== undefined) {
      if (current.id === measure?.id || seen.has(current.id)) return false;
      seen.add(current.id);
      current = measures.find(item => item.id === current?.referenceMeasureId);
    }
    return true;
  });
  const [busy, setBusy] = useState(false);
  return <ProductionModal title={measure ? "Editar medida" : "Nueva medida"} close={close}>
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await saveMeasure({ ...(measure?.id !== undefined ? { id: measure.id } : {}), name, symbol, group: reference?.group ?? group, factor: reference ? reference.factor * Number(referenceQty) : Number(factor), ...(reference ? { referenceMeasureId: reference.id, referenceQty: Number(referenceQty) } : {}) }); toast.success("Medida guardada"); close(); } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); } finally { setBusy(false); } }}>
      <ProductionField label="Nombre"><input required className={controlClass} value={name} onChange={e => setName(e.target.value)} placeholder="Kilogramo" /></ProductionField>
      <ProductionField label="Símbolo"><input required className={controlClass} value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="kg" /></ProductionField>
      <ProductionField label="Medida de referencia"><select className={controlClass} value={referenceId} onChange={e => setReferenceId(e.target.value)}><option value="">Sin referencia · equivalencia base</option>{eligible.map(m => <option key={m.id} value={m.id}>{m.name} ({m.symbol})</option>)}</select></ProductionField>
      {reference ? <><ProductionField label={`1 ${name || "nueva medida"} equivale a (${reference.symbol})`}><input required type="number" min="0.00000001" step="any" className={controlClass} value={referenceQty} onChange={e => setReferenceQty(e.target.value)} /></ProductionField><div className="border-y border-border py-3 text-sm space-y-1"><p className="font-semibold">1 {symbol || name || "medida"} = {referenceQty} {reference.symbol}</p>{measures.filter(m => m.group === reference.group && m.id !== measure?.id).map(m => <p key={m.id} className="text-muted-foreground">{Number((Number(referenceQty) * reference.factor / m.factor).toFixed(8))} {m.symbol}</p>)}</div></> : <><ProductionField label="Grupo de equivalencias"><input required list="measure-groups" className={controlClass} value={group} onChange={e => setGroup(e.target.value)} placeholder="Peso" /></ProductionField><ProductionField label="Equivalencia en unidad base del grupo"><input required type="number" min="0.00000001" step="any" className={controlClass} value={factor} onChange={e => setFactor(e.target.value)} /></ProductionField></>}
      <datalist id="measure-groups">{Array.from(new Set(measures.map(m => m.group))).map(g => <option key={g} value={g} />)}</datalist>
      <Button type="submit" disabled={busy} className="w-full">Guardar medida</Button>
    </form>
  </ProductionModal>;
}

export function RecipeForm({ recipe, products, measures, close }: { recipe?: ProductionRecipe; products: Product[]; measures: Measure[]; close: () => void }) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [productId, setProduct] = useState(String(recipe?.productId ?? ""));
  const [outputQty, setQty] = useState(String(recipe?.outputQty ?? 1));
  const [outputMeasure, setMeasure] = useState(String(recipe?.outputMeasureId ?? ""));
  const [materials, setMaterials] = useState(recipe?.materials.map(m => ({ productId: String(m.productId), qty: String(m.qty), measureId: String(m.measureId) })) ?? [{ productId: "", qty: "", measureId: "" }]);
  const [busy, setBusy] = useState(false);
  const unitsFor = (id: string) => {
    const p = products.find(p => p.id === Number(id));
    const base = measures.find(m => m.id === p?.measureId) ?? measures.find(m => m.symbol === "u");
    return measures.filter(m => m.group === base?.group);
  };
  const baseFor = (id: string) => String(products.find(p => p.id === Number(id))?.measureId ?? measures.find(m => m.symbol === "u")?.id ?? "");
  const patch = (i: number, changes: Partial<typeof materials[number]>) => setMaterials(items => items.map((m, index) => index === i ? { ...m, ...changes } : m));
  return <ProductionModal title={recipe ? "Editar fórmula" : "Nueva fórmula"} close={close}>
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await saveRecipe({ ...(recipe?.id !== undefined ? { id: recipe.id } : {}), name, productId: Number(productId), outputQty: Number(outputQty), outputMeasureId: Number(outputMeasure), materials: materials.map(m => ({ productId: Number(m.productId), qty: Number(m.qty), measureId: Number(m.measureId) })), updatedAt: Date.now() }); toast.success("Fórmula guardada"); close(); } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); } finally { setBusy(false); } }}>
      <ProductionField label="Nombre de fórmula"><input required className={controlClass} value={name} onChange={e => setName(e.target.value)} /></ProductionField>
      <ProductionField label="Producto terminado"><select required className={controlClass} value={productId} onChange={e => { setProduct(e.target.value); setMeasure(baseFor(e.target.value)); }}><option value="">Selecciona producto</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></ProductionField>
      <div className="grid grid-cols-2 gap-3"><ProductionField label="Rendimiento por lote"><input required type="number" min="0.00000001" step="any" className={controlClass} value={outputQty} onChange={e => setQty(e.target.value)} /></ProductionField><ProductionField label="Medida del terminado"><select required className={controlClass} value={outputMeasure} onChange={e => setMeasure(e.target.value)}><option value="">Selecciona</option>{unitsFor(productId).map(m => <option key={m.id} value={m.id}>{m.name} ({m.symbol})</option>)}</select></ProductionField></div>
      <h3 className="text-sm font-semibold border-t border-border pt-4">Materiales por lote</h3>
      <div className="divide-y divide-border">{materials.map((m, i) => <div key={i} className="space-y-2 py-3">
        <ProductionField label={`Material ${i + 1}`}><select required className={controlClass} value={m.productId} onChange={e => patch(i, { productId: e.target.value, measureId: baseFor(e.target.value) })}><option value="">Selecciona material</option>{products.filter(p => p.id !== Number(productId)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></ProductionField>
        <div className="flex items-end gap-2"><div className="grid grid-cols-2 gap-2 flex-1 min-w-0"><ProductionField label="Cantidad"><input required type="number" min="0.00000001" step="any" className={controlClass} value={m.qty} onChange={e => patch(i, { qty: e.target.value })} /></ProductionField><ProductionField label="Medida"><select required className={controlClass} value={m.measureId} onChange={e => patch(i, { measureId: e.target.value })}><option value="">Selecciona</option>{unitsFor(m.productId).map(u => <option key={u.id} value={u.id}>{u.symbol}</option>)}</select></ProductionField></div><Button type="button" variant="ghost" size="icon" aria-label={`Quitar material ${i + 1}`} title="Quitar material" onClick={() => setMaterials(items => items.filter((_, index) => index !== i))}><Trash2 /></Button></div>
      </div>)}</div>
      <Button type="button" variant="outline" onClick={() => setMaterials(items => [...items, { productId: "", qty: "", measureId: "" }])}><Plus />Agregar material</Button>
      <Button type="submit" disabled={busy} className="w-full">Guardar fórmula</Button>
    </form>
  </ProductionModal>;
}

export function OrderForm({ products, recipes, measures, warehouses, close }: { products: Product[]; recipes: ProductionRecipe[]; measures: Measure[]; warehouses: Warehouse[]; close: () => void }) {
  const { user } = useAuth();
  const [recipeId, setRecipe] = useState("");
  const [qty, setQty] = useState("1");
  const [outputMeasureId, setOutputMeasureId] = useState("");
  const [warehouseId, setWarehouse] = useState(String((warehouses.find(w => w.isDefault) ?? warehouses[0])?.id ?? ""));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const recipe = recipes.find(r => r.id === Number(recipeId));
  const recipeMeasure = measures.find(m => m.id === recipe?.outputMeasureId);
  const selectedMeasure = measures.find(m => m.id === Number(outputMeasureId));
  let batches = 0;
  if (recipe && recipeMeasure && selectedMeasure && Number(qty) > 0) batches = convertQuantity(Number(qty), selectedMeasure, recipeMeasure) / recipe.outputQty;
  return <ProductionModal title="Nueva orden de producción" close={close}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await createProductionOrder({ recipeId: Number(recipeId), qty: Number(qty), outputMeasureId: Number(outputMeasureId), warehouseId: Number(warehouseId), notes, userId: user?.id, userName: user?.name }); toast.success("Orden creada"); close(); } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo crear"); } finally { setBusy(false); } }}>
    <ProductionField label="Fórmula"><select required className={controlClass} value={recipeId} onChange={e => { const next = recipes.find(r => r.id === Number(e.target.value)); setRecipe(e.target.value); setQty(String(next?.outputQty ?? 1)); setOutputMeasureId(String(next?.outputMeasureId ?? "")); }}><option value="">Selecciona fórmula</option>{recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></ProductionField>
    <div className="grid grid-cols-2 gap-3"><ProductionField label="Cantidad a producir"><input required type="number" min="0.00000001" step="any" className={controlClass} value={qty} onChange={e => setQty(e.target.value)} /></ProductionField><ProductionField label="Medida de producción"><select required className={controlClass} value={outputMeasureId} onChange={e => setOutputMeasureId(e.target.value)}><option value="">Selecciona</option>{measures.filter(m => m.group === recipeMeasure?.group).map(m => <option key={m.id} value={m.id}>{m.name} ({m.symbol})</option>)}</select></ProductionField></div>
    {recipe && batches > 0 && <div className="border-y border-border py-3 space-y-2"><h3 className="text-sm font-semibold">Materiales requeridos</h3>{recipe.materials.map(m => <div key={m.productId} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{products.find(p => p.id === m.productId)?.name ?? `Material #${m.productId}`}</span><span className="tabular">{Number((m.qty * batches).toFixed(8))} {measures.find(unit => unit.id === m.measureId)?.symbol}</span></div>)}</div>}
    <ProductionField label="Bodega de materiales y terminados"><select required className={controlClass} value={warehouseId} onChange={e => setWarehouse(e.target.value)}>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></ProductionField>
    <ProductionField label="Referencia o notas"><input className={controlClass} value={notes} onChange={e => setNotes(e.target.value)} /></ProductionField>
    <Button type="submit" disabled={busy} className="w-full">Crear orden pendiente</Button>
  </form></ProductionModal>;
}