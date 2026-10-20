import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Factory, Plus, Pencil, Check, X, ClipboardList, Ruler, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { db, getSettings, type Measure, type ProductionRecipe, type ProductionOrder } from "@/lib/db";
import { ensureDefaultMeasure, completeProductionOrder, cancelProductionOrder, orderLabel } from "@/lib/production";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MeasureForm, RecipeForm, OrderForm, ProductionModal } from "@/components/ProductionForms";

export const Route = createFileRoute("/production")({
  head: () => ({ meta: [
    { title: "Producción — ERP Importaciones" },
    { name: "description", content: "Gestiona fórmulas, medidas de tu empresa y órdenes de producción con consumo de inventario." },
    { property: "og:title", content: "Producción — ERP Importaciones" },
    { property: "og:description", content: "Órdenes de producción, materiales y medidas personalizadas con inventario local." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: ProductionPage,
});

function ProductionPage() {
  useEffect(() => { ensureDefaultMeasure().catch(() => toast.error("No se pudieron cargar las medidas")); }, []);
  const measures = useLiveQuery(() => db.measures.toArray(), []) ?? [];
  const recipes = useLiveQuery(() => db.productionRecipes.toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.productionOrders.orderBy("createdAt").reverse().toArray(), []) ?? [];
  const products = useLiveQuery(async () => (await db.products.toArray()).filter(p => p.active && p.trackStock), []) ?? [];
  const warehouses = useLiveQuery(() => db.warehouses.toArray(), []) ?? [];
  const settings = useLiveQuery(getSettings, []);
  const [tab, setTab] = useState("orders");
  const [form, setForm] = useState<"measure" | "recipe" | "order" | null>(null);
  const [editingMeasure, setEditingMeasure] = useState<Measure>();
  const [editingRecipe, setEditingRecipe] = useState<ProductionRecipe>();
  const [detail, setDetail] = useState<ProductionOrder>();
  const [confirmation, setConfirmation] = useState<{ id: number; cancel: boolean }>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("all");
  const close = () => { setForm(null); setEditingMeasure(undefined); setEditingRecipe(undefined); };
  const selected = detail ? orders.find(o => o.id === detail.id) ?? detail : undefined;
  return <div>
    <PageHeader title="Producción" subtitle="Órdenes, fórmulas y medidas" right={<Factory className="h-7 w-7 text-primary" />} />
    <div className="px-4 md:px-6 space-y-5">
      <div className="grid grid-cols-3 gap-3 border-y border-border py-4">
        {[{ label: "Pendientes", value: orders.filter(o => o.status === "draft").length }, { label: "Completadas", value: orders.filter(o => o.status === "completed").length }, { label: "Fórmulas", value: recipes.length }].map(s => <div key={s.label}><div className="text-2xl font-display font-semibold">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>)}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto"><TabsTrigger value="orders"><ClipboardList className="mr-1 h-4 w-4" />Órdenes</TabsTrigger><TabsTrigger value="recipes"><FlaskConical className="mr-1 h-4 w-4" />Fórmulas</TabsTrigger><TabsTrigger value="measures"><Ruler className="mr-1 h-4 w-4" />Medidas</TabsTrigger></TabsList>
        <TabsContent value="orders" className="space-y-3 pt-3">
          <div className="flex flex-wrap justify-between gap-3"><select aria-label="Estado de órdenes" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="draft">Pendientes</option><option value="completed">Completadas</option><option value="cancelled">Canceladas</option></select><Button disabled={!recipes.length} onClick={() => setForm("order")}><Plus />Nueva orden</Button></div>
          {orders.filter(o => status === "all" || status === o.status).map(o => <div key={o.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex justify-between items-start gap-2"><div className="min-w-0"><div className="text-xs text-muted-foreground">Orden #{o.id} · {formatDate(o.createdAt)}</div><h2 className="font-semibold break-words">{o.productName}</h2><div className="text-sm text-muted-foreground">{o.qty} {o.measure} · {o.recipeName}</div></div><span className={`text-xs font-medium shrink-0 ${o.status === "completed" ? "text-success" : o.status === "cancelled" ? "text-muted-foreground" : "text-warning"}`}>{orderLabel(o)}</span></div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3"><Button size="sm" variant="outline" onClick={() => setDetail(o)}>Detalle</Button>{o.status === "draft" && <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Cancelar orden ${o.id}`} title="Cancelar orden" onClick={() => { if (o.id !== undefined) setConfirmation({ id: o.id, cancel: true }); }}><X /></Button><Button size="sm" onClick={() => { if (o.id !== undefined) setConfirmation({ id: o.id, cancel: false }); }}><Check />Producir</Button></div>}</div>
          </div>)}
          {!orders.filter(o => status === "all" || status === o.status).length && <Empty icon={<ClipboardList />} text="Sin órdenes de producción" />}
        </TabsContent>
        <TabsContent value="recipes" className="space-y-3 pt-3"><div className="flex justify-end"><Button disabled={!products.length || !measures.length} onClick={() => setForm("recipe")}><Plus />Nueva fórmula</Button></div>
          {recipes.map(r => <div key={r.id} className="rounded-lg border border-border bg-card p-4 flex gap-3 items-start"><FlaskConical className="h-5 w-5 text-primary shrink-0 mt-1" /><div className="flex-1 min-w-0"><h2 className="font-semibold break-words">{r.name}</h2><p className="text-sm text-muted-foreground">{products.find(p => p.id === r.productId)?.name ?? "Producto no disponible"} · {r.outputQty} {measures.find(m => m.id === r.outputMeasureId)?.symbol}</p><p className="text-xs text-muted-foreground mt-1">{r.materials.length} materiales</p></div><Button variant="ghost" size="icon" title="Editar fórmula" aria-label={`Editar fórmula ${r.name}`} onClick={() => { setEditingRecipe(r); setForm("recipe"); }}><Pencil /></Button></div>)}
          {!recipes.length && <Empty icon={<FlaskConical />} text="Sin fórmulas" />}
          {!products.length && <Button asChild variant="outline"><Link to="/products">Productos</Link></Button>}
        </TabsContent>
        <TabsContent value="measures" className="space-y-3 pt-3"><div className="flex justify-end"><Button onClick={() => setForm("measure")}><Plus />Nueva medida</Button></div>
          {measures.map(m => <div key={m.id} className="rounded-lg border border-border bg-card p-4 flex items-center gap-3"><Ruler className="h-5 w-5 text-primary shrink-0" /><div className="flex-1 min-w-0"><h2 className="font-semibold break-words">{m.name} <span className="text-muted-foreground font-normal">({m.symbol})</span></h2><p className="text-xs text-muted-foreground break-words">{m.group} · Equivalencia base: {m.factor}</p></div><Button variant="ghost" size="icon" title="Editar medida" aria-label={`Editar medida ${m.name}`} onClick={() => { setEditingMeasure(m); setForm("measure"); }}><Pencil /></Button></div>)}
        </TabsContent>
      </Tabs>
    </div>
    {form === "measure" && <MeasureForm measure={editingMeasure} measures={measures} close={close} />}
    {form === "recipe" && <RecipeForm recipe={editingRecipe} products={products} measures={measures} close={close} />}
    {form === "order" && <OrderForm recipes={recipes} measures={measures} warehouses={warehouses} close={close} />}
    {selected && <ProductionModal title={`Orden #${selected.id}`} close={() => setDetail(undefined)}><div className="space-y-4 text-sm"><div><h3 className="font-semibold">{selected.productName}</h3><p>{selected.qty} {selected.measure} · {orderLabel(selected)}</p><p className="text-muted-foreground">{warehouses.find(w => w.id === selected.warehouseId)?.name} · {selected.userName}</p></div><h3 className="font-semibold">Consumo de materiales</h3><div className="divide-y divide-border">{selected.materials.map(m => <div key={m.productId} className="py-2 flex justify-between gap-3"><span className="break-words min-w-0">{m.name}</span><div className="text-right shrink-0"><div>{m.qty} {m.measure}</div><div className="text-xs text-muted-foreground">{m.stockQty} {m.stockMeasure} de inventario</div></div></div>)}</div><div className="border-t border-border pt-3 flex justify-between"><span>Costo de materiales</span><strong>{formatMoney(selected.totalCost, settings)}</strong></div>{selected.notes && <p className="break-words text-muted-foreground">{selected.notes}</p>}</div></ProductionModal>}
    {confirmation && <ProductionModal title={confirmation.cancel ? "Cancelar orden" : "Confirmar producción"} close={() => { if (!busy) setConfirmation(undefined); }}><p className="text-sm text-muted-foreground">{confirmation.cancel ? "La orden quedará cancelada sin mover inventario." : "Se descontarán los materiales y se ingresará el producto terminado. Esta operación no se puede repetir."}</p><Button disabled={busy} variant={confirmation.cancel ? "destructive" : "default"} onClick={async () => { setBusy(true); try { if (confirmation.cancel) await cancelProductionOrder(confirmation.id); else await completeProductionOrder(confirmation.id); toast.success(confirmation.cancel ? "Orden cancelada" : "Producción completada; inventario actualizado"); setConfirmation(undefined); } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo procesar"); } finally { setBusy(false); } }}>{busy ? "Procesando…" : confirmation.cancel ? "Cancelar orden" : "Confirmar y producir"}</Button></ProductionModal>}
  </div>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="py-14 flex flex-col items-center gap-3 text-muted-foreground">{icon}<p className="text-sm">{text}</p></div>;
}