import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { db, getSettings, type Product } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/AppShell";
import { Plus, Search, X, Trash2, Edit3, Camera, ImagePlus, Package } from "lucide-react";
import { toast } from "sonner";
import { fileToCompressedDataURL } from "@/lib/image";

export const Route = createFileRoute("/products")({ component: ProductsPage });

function ProductsPage() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = (products ?? []).filter((p) =>
    !search ? true :
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode ?? "").includes(search)
  );

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={`${products?.length ?? 0} productos`}
        right={
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        }
      />

      <div className="px-4 md:px-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos"
            className="w-full h-11 pl-10 pr-3 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden shrink-0 grid place-items-center">
                {p.image ? (
                  <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatMoney(p.price, settings)} {p.trackStock && `· Stock ${p.stock}`}
                </div>
              </div>
              <button onClick={() => { setEditing(p); setShowForm(true); }} className="h-9 w-9 rounded-lg bg-muted grid place-items-center">
                <Edit3 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">Sin productos</div>}
        </div>
      </div>

      {showForm && (
        <ProductForm
          product={editing}
          categories={categories ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function ProductForm({ product, categories, onClose, onSaved }: any) {
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [cost, setCost] = useState(String(product?.cost ?? ""));
  const [stock, setStock] = useState(String(product?.stock ?? "0"));
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true);
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [categoryId, setCategoryId] = useState<number | undefined>(product?.categoryId);
  const [image, setImage] = useState<string | undefined>(product?.image);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busyImg, setBusyImg] = useState(false);
  const [active, setActive] = useState(product?.active ?? true);

  async function save() {
    if (!name.trim()) { toast.error("Nombre requerido"); return; }
    const data: Product = {
      name: name.trim(),
      price: Number(price) || 0,
      cost: cost ? Number(cost) : undefined,
      stock: Number(stock) || 0,
      trackStock,
      barcode: barcode || undefined,
      sku: sku || undefined,
      categoryId,
      image,
      active,
      createdAt: product?.createdAt ?? Date.now(),
    };
    if (product?.id) await db.products.update(product.id, data);
    else await db.products.add(data);
    toast.success("Guardado");
    onSaved();
  }

  async function remove() {
    if (!product?.id) return;
    if (!confirm("¿Eliminar producto?")) return;
    await db.products.delete(product.id);
    toast.success("Eliminado");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-lg md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">{product ? "Editar" : "Nuevo"} producto</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} className="ipt" autoFocus /></Field>

          <div>
            <span className="text-xs text-muted-foreground">Foto del producto</span>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-20 w-20 rounded-xl bg-background border border-border overflow-hidden grid place-items-center shrink-0">
                {image ? (
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={busyImg}
                  className="h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" /> Cámara
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={busyImg}
                  className="h-11 rounded-lg bg-muted text-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <ImagePlus className="h-4 w-4" /> Galería
                </button>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage(undefined)}
                    className="col-span-2 h-9 rounded-lg border border-border text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Quitar foto
                  </button>
                )}
              </div>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                setBusyImg(true);
                try { setImage(await fileToCompressedDataURL(f)); }
                catch { toast.error("No se pudo procesar la imagen"); }
                finally { setBusyImg(false); e.target.value = ""; }
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                setBusyImg(true);
                try { setImage(await fileToCompressedDataURL(f)); }
                catch { toast.error("No se pudo procesar la imagen"); }
                finally { setBusyImg(false); e.target.value = ""; }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio venta"><input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="ipt text-right" /></Field>
            <Field label="Costo (opc.)"><input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="ipt text-right" /></Field>
          </div>

          <Field label="Categoría">
            <select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)} className="ipt">
              <option value="">— Sin categoría —</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <div className="flex items-center justify-between rounded-lg bg-background border border-border p-3">
            <div>
              <div className="text-sm font-medium">Controlar inventario</div>
              <div className="text-xs text-muted-foreground">Descontar stock al vender</div>
            </div>
            <Toggle on={trackStock} onChange={setTrackStock} />
          </div>

          {trackStock && (
            <Field label="Stock actual"><input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className="ipt text-right" /></Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código de barras"><input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="ipt" /></Field>
            <Field label="SKU"><input value={sku} onChange={(e) => setSku(e.target.value)} className="ipt" /></Field>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-background border border-border p-3">
            <div className="text-sm font-medium">Activo</div>
            <Toggle on={active} onChange={setActive} />
          </div>

          <div className="flex gap-2 pt-2">
            {product && (
              <button onClick={remove} className="h-12 px-4 rounded-xl border border-destructive/40 text-destructive flex items-center gap-2"><Trash2 className="h-4 w-4" /></button>
            )}
            <button onClick={save} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
          </div>
        </div>
      </div>
      <style>{`.ipt{width:100%;height:44px;padding:0 12px;border-radius:10px;background:var(--background);border:1px solid var(--border);outline:none;font-size:14px;color:var(--foreground)}.ipt:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"} relative`}>
      <span className={`absolute top-0.5 ${on ? "left-5" : "left-0.5"} h-5 w-5 rounded-full bg-white transition-all`} />
    </button>
  );
}