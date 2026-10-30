import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import {
  createCloudCategory,
  createCloudProduct,
  deactivateCloudProduct,
  listCloudCategories,
  listCloudProducts,
  updateCloudCategory,
  updateCloudProduct,
  type CloudCategory,
  type CloudProduct,
  type DairyProductType,
} from "@/lib/cloud-catalog";
import { toast } from "sonner";
import { Package, Tag, Plus, RefreshCw, X, Power, Pencil, Save } from "lucide-react";

export const Route = createFileRoute("/catalog")({
  head: () => ({ meta: [{ title: "Catálogo maestro — ERP" }] }),
  component: CloudCatalogPage,
});

type CatalogTab = "products" | "categories";

const PRODUCT_TYPES: { value: DairyProductType; label: string }[] = [
  { value: "raw_material", label: "Materia prima" },
  { value: "finished_product", label: "Producto terminado" },
  { value: "packaging", label: "Material de empaque" },
  { value: "supply", label: "Suministro" },
];

function CloudCatalogPage() {
  const { can, loading } = useAuth();
  const canRead = can("products", "read") && can("categories", "read");
  const canWriteProducts = can("products", "write");
  const canWriteCategories = can("categories", "write");
  const [tab, setTab] = useState<CatalogTab>("products");
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [categories, setCategories] = useState<CloudCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [productForm, setProductForm] = useState<CloudProduct | "new" | null>(null);
  const [categoryForm, setCategoryForm] = useState<CloudCategory | "new" | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        listCloudCategories(),
        listCloudProducts(),
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo consultar el catálogo en Firestore.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canRead) void reload();
  }, [loading, canRead, reload]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!canRead) return <div className="p-6 text-sm text-destructive">No tienes permiso para consultar el catálogo.</div>;

  async function saveCategory(input: { code: string; name: string; description: string; color: string; active: boolean }) {
    try {
      if (categoryForm && categoryForm !== "new") {
        await updateCloudCategory(categoryForm.id, {
          name: input.name,
          description: input.description,
          color: input.color,
          active: input.active,
        }, categoryForm.revision);
        toast.success("Categoría actualizada en Firestore");
      } else {
        await createCloudCategory({
          code: input.code,
          name: input.name,
          description: input.description,
          color: input.color,
        });
        toast.success("Categoría creada en Firestore");
      }
      setCategoryForm(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la categoría");
    }
  }

  async function saveProduct(input: {
    code: string;
    name: string;
    description: string;
    categoryId: string;
    productType: DairyProductType;
    sku: string;
    barcode: string;
    baseUnit: string;
    salePrice: number;
    standardCost: number;
    trackInventory: boolean;
    active: boolean;
  }) {
    try {
      if (productForm && productForm !== "new") {
        await updateCloudProduct(productForm.id, input, productForm.revision);
        toast.success("Producto actualizado en Firestore");
      } else {
        await createCloudProduct(input);
        toast.success("Producto creado en Firestore");
      }
      setProductForm(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el producto");
    }
  }

  async function toggleProduct(product: CloudProduct) {
    try {
      if (product.active) {
        await deactivateCloudProduct(product.id, product.revision);
        toast.success("Producto desactivado");
      } else {
        await updateCloudProduct(product.id, {
          code: product.code,
          name: product.name,
          description: product.description,
          categoryId: product.categoryId,
          productType: product.productType,
          sku: product.sku,
          barcode: product.barcode,
          baseUnit: product.baseUnit,
          salePrice: product.salePrice,
          standardCost: product.standardCost,
          trackInventory: product.trackInventory,
          active: true,
          imagePath: product.imagePath,
        }, product.revision);
        toast.success("Producto activado");
      }
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar el estado del producto");
    }
  }

  return (
    <div>
      <PageHeader
        title="Catálogo maestro"
        subtitle="Datos maestros oficiales almacenados en Firestore"
        right={
          <button onClick={() => void reload()} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Actualizar
          </button>
        }
      />
      <div className="px-4 md:px-6 pb-8 space-y-4">
        <div className="flex gap-2 border-b border-border">
          <button onClick={() => setTab("products")} className={`px-3 py-2.5 text-sm border-b-2 ${tab === "products" ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground"}`}>
            <Package className="inline h-4 w-4 mr-1.5" /> Productos ({products.length})
          </button>
          <button onClick={() => setTab("categories")} className={`px-3 py-2.5 text-sm border-b-2 ${tab === "categories" ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground"}`}>
            <Tag className="inline h-4 w-4 mr-1.5" /> Categorías ({categories.length})
          </button>
        </div>

        {tab === "products" && (
          <section className="space-y-3">
            {canWriteProducts && (
              <div className="flex justify-end">
                <button onClick={() => setProductForm("new")} disabled={!categories.some((category) => category.active)} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm inline-flex items-center gap-2 disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Nuevo producto
                </button>
              </div>
            )}
            {products.map((product) => {
              const category = categories.find((item) => item.id === product.categoryId);
              return (
                <article key={product.id} className="rounded-xl bg-card border border-border p-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><Package className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{product.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${product.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{product.active ? "Activo" : "Inactivo"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{product.code} · {category?.name ?? "Categoría no encontrada"} · {PRODUCT_TYPES.find((type) => type.value === product.productType)?.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Unidad: {product.baseUnit} · Costo estándar: {product.standardCost.toLocaleString("es-CO")} · Precio: {product.salePrice.toLocaleString("es-CO")}</p>
                    {(product.sku || product.barcode) && <p className="text-[11px] text-muted-foreground mt-0.5">SKU: {product.sku || "—"} · Código de barras: {product.barcode || "—"}</p>}
                  </div>
                  {canWriteProducts && (
                    <div className="flex gap-1">
                      <button onClick={() => setProductForm(product)} title="Editar" className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => void toggleProduct(product)} title={product.active ? "Desactivar" : "Activar"} className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><Power className="h-4 w-4" /></button>
                    </div>
                  )}
                </article>
              );
            })}
            {products.length === 0 && <EmptyState text="Aún no hay productos en el catálogo cloud." />}
          </section>
        )}

        {tab === "categories" && (
          <section className="space-y-3">
            {canWriteCategories && (
              <div className="flex justify-end">
                <button onClick={() => setCategoryForm("new")} className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Nueva categoría
                </button>
              </div>
            )}
            {categories.map((category) => (
              <article key={category.id} className="rounded-xl bg-card border border-border p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg grid place-items-center shrink-0" style={{ background: category.color || "#64748b" }}><Tag className="h-5 w-5 text-white" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{category.name}</span><span className="text-[10px] text-muted-foreground">{category.active ? "Activa" : "Inactiva"}</span></div>
                  <p className="text-xs text-muted-foreground mt-1">{category.code}{category.description ? ` · ${category.description}` : ""}</p>
                </div>
                {canWriteCategories && <button onClick={() => setCategoryForm(category)} className="h-9 w-9 rounded-lg bg-muted grid place-items-center"><Pencil className="h-4 w-4" /></button>}
              </article>
            ))}
            {categories.length === 0 && <EmptyState text="Aún no hay categorías. Crea una para comenzar el catálogo." />}
          </section>
        )}
      </div>

      {categoryForm && (
        <CategoryEditor
          value={categoryForm === "new" ? null : categoryForm}
          onClose={() => setCategoryForm(null)}
          onSave={saveCategory}
        />
      )}
      {productForm && (
        <ProductEditor
          value={productForm === "new" ? null : productForm}
          categories={categories.filter((category) => category.active)}
          onClose={() => setProductForm(null)}
          onSave={saveProduct}
        />
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function CategoryEditor({ value, onClose, onSave }: {
  value: CloudCategory | null;
  onClose: () => void;
  onSave: (input: { code: string; name: string; description: string; color: string; active: boolean }) => Promise<void>;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [color, setColor] = useState(value?.color ?? "#64748b");
  const [active, setActive] = useState(value?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ code, name, description, color, active });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={value ? "Editar categoría" : "Nueva categoría"} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <Field label="Código"><input required maxLength={40} disabled={!!value} value={code} onChange={(event) => setCode(event.target.value)} className="control" /></Field>
        <Field label="Nombre"><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="control" /></Field>
        <Field label="Descripción"><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="control" /></Field>
        <Field label="Color"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background p-1" /></Field>
        {value && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Categoría activa</label>}
        <FormActions saving={saving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function ProductEditor({ value, categories, onClose, onSave }: {
  value: CloudProduct | null;
  categories: CloudCategory[];
  onClose: () => void;
  onSave: (input: {
    code: string; name: string; description: string; categoryId: string; productType: DairyProductType;
    sku: string; barcode: string; baseUnit: string; salePrice: number; standardCost: number;
    trackInventory: boolean; active: boolean;
  }) => Promise<void>;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [categoryId, setCategoryId] = useState(value?.categoryId ?? categories[0]?.id ?? "");
  const [productType, setProductType] = useState<DairyProductType>(value?.productType ?? "raw_material");
  const [sku, setSku] = useState(value?.sku ?? "");
  const [barcode, setBarcode] = useState(value?.barcode ?? "");
  const [baseUnit, setBaseUnit] = useState(value?.baseUnit ?? "kg");
  const [salePrice, setSalePrice] = useState(String(value?.salePrice ?? 0));
  const [standardCost, setStandardCost] = useState(String(value?.standardCost ?? 0));
  const [trackInventory, setTrackInventory] = useState(value?.trackInventory ?? true);
  const [active, setActive] = useState(value?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        code, name, description, categoryId, productType, sku, barcode, baseUnit,
        salePrice: Number(salePrice), standardCost: Number(standardCost), trackInventory, active,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={value ? "Editar producto" : "Nuevo producto"} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código"><input required maxLength={40} disabled={!!value} value={code} onChange={(event) => setCode(event.target.value)} className="control" /></Field>
          <Field label="Tipo"><select value={productType} onChange={(event) => setProductType(event.target.value as DairyProductType)} className="control">{PRODUCT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
        </div>
        <Field label="Nombre"><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="control" /></Field>
        <Field label="Categoría"><select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="control">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
        <Field label="Descripción"><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="control" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU (inmutable)"><input disabled={!!value} value={sku} onChange={(event) => setSku(event.target.value)} className="control" /></Field>
          <Field label="Código de barras (inmutable)"><input disabled={!!value} value={barcode} onChange={(event) => setBarcode(event.target.value)} className="control" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Unidad base"><input required maxLength={16} value={baseUnit} onChange={(event) => setBaseUnit(event.target.value)} className="control" /></Field>
          <Field label="Costo estándar"><input type="number" min="0" step="0.01" value={standardCost} onChange={(event) => setStandardCost(event.target.value)} className="control" /></Field>
          <Field label="Precio venta"><input type="number" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} className="control" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trackInventory} onChange={(event) => setTrackInventory(event.target.checked)} /> Controlar inventario</label>
        {value && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Producto activo</label>}
        <FormActions saving={saving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function FormActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm">Cancelar</button><button type="submit" disabled={saving} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Guardando…" : "Guardar"}</button></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"><div className="w-full md:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-card border border-border"><div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between"><span className="font-semibold">{title}</span><button type="button" onClick={onClose}><X className="h-5 w-5" /></button></div>{children}</div></div>;
}
