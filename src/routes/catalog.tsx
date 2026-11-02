import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import {
  createCloudCategory, createCloudProduct, deactivateCloudProduct,
  listCloudCategories, listCloudProducts, updateCloudCategory, updateCloudProduct,
  type CloudCategory, type CloudProduct, type DairyProductType,
} from "@/lib/cloud-catalog";
import { toast } from "sonner";
import {
  Package, Tag, Plus, RefreshCw, X, Power, Pencil, Save, Search,
  Boxes, CircleCheck, CircleX, Filter, Barcode, Layers3,
} from "lucide-react";

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

const money = (value: unknown) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(Number.isFinite(Number(value)) ? Number(value) : 0);

function CloudCatalogPage() {
  const { can, loading } = useAuth();
  const canRead = can("products", "read") && can("categories", "read");
  const canWriteProducts = can("products", "write");
  const canWriteCategories = can("categories", "write");
  const [tab, setTab] = useState<CatalogTab>("products");
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [categories, setCategories] = useState<CloudCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [productForm, setProductForm] = useState<CloudProduct | "new" | null>(null);
  const [categoryForm, setCategoryForm] = useState<CloudCategory | "new" | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setLoadError("");
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        listCloudCategories(), listCloudProducts(),
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar el catálogo.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canRead) void reload();
  }, [loading, canRead, reload]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const category = categories.find((item) => item.id === product.categoryId);
      const matchesTerm = !term || [
        product.name, product.code, product.sku, product.barcode, category?.name,
      ].some((value) => String(value ?? "").toLocaleLowerCase("es").includes(term));
      const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" ? product.active !== false : product.active === false);
      return matchesTerm && matchesCategory && matchesStatus;
    });
  }, [products, categories, search, categoryFilter, statusFilter]);

  const activeProducts = products.filter((product) => product.active !== false).length;
  const activeCategories = categories.filter((category) => category.active !== false).length;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!canRead) return <div className="p-6 text-sm text-destructive">No tienes permiso para consultar el catálogo.</div>;

  async function saveCategory(input: { code: string; name: string; description: string; color: string; active: boolean }) {
    try {
      if (categoryForm && categoryForm !== "new") {
        await updateCloudCategory(categoryForm.id, {
          name: input.name, description: input.description, color: input.color, active: input.active,
        }, categoryForm.revision);
        toast.success("Categoría actualizada");
      } else {
        await createCloudCategory({ code: input.code, name: input.name, description: input.description, color: input.color });
        toast.success("Categoría creada");
      }
      setCategoryForm(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la categoría");
    }
  }

  async function saveProduct(input: {
    code: string; name: string; description: string; categoryId: string; productType: DairyProductType;
    sku: string; barcode: string; baseUnit: string; salePrice: number; standardCost: number;
    trackInventory: boolean; active: boolean;
  }) {
    try {
      if (productForm && productForm !== "new") {
        await updateCloudProduct(productForm.id, input, productForm.revision);
        toast.success("Producto actualizado");
      } else {
        await createCloudProduct(input);
        toast.success("Producto creado");
      }
      setProductForm(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el producto");
    }
  }

  async function toggleProduct(product: CloudProduct) {
    try {
      if (product.active !== false) {
        await deactivateCloudProduct(product.id, product.revision);
        toast.success("Producto desactivado");
      } else {
        await updateCloudProduct(product.id, {
          code: product.code, name: product.name, description: product.description,
          categoryId: product.categoryId, productType: product.productType, sku: product.sku,
          barcode: product.barcode, baseUnit: product.baseUnit || "u",
          salePrice: Number(product.salePrice ?? 0), standardCost: Number(product.standardCost ?? 0),
          trackInventory: product.trackInventory !== false, active: true, imagePath: product.imagePath,
        }, product.revision);
        toast.success("Producto activado");
      }
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar el estado del producto");
    }
  }

  return (
    <div className="min-h-full">
      <PageHeader
        title="Catálogo maestro"
        subtitle="Administración central de productos y categorías"
        right={
          <button onClick={() => void reload()} disabled={busy}
            className="h-10 px-3.5 rounded-lg border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Actualizar
          </button>
        }
      />
      <div className="px-4 md:px-6 pb-8 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Boxes className="h-4 w-4" /> Productos registrados</div>
            <div className="mt-2 text-2xl font-semibold tabular">{products.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">{activeProducts} activos</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Tag className="h-4 w-4" /> Categorías</div>
            <div className="mt-2 text-2xl font-semibold tabular">{categories.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">{activeCategories} activas</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 col-span-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Layers3 className="h-4 w-4" /> Organización del catálogo</div>
            <div className="mt-2 text-sm font-medium">Productos clasificados por categoría y tipo</div>
            <div className="mt-1 text-xs text-muted-foreground">Consulta códigos, unidades, costos y precios desde una sola vista.</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 md:px-5 pt-4 border-b border-border">
            <div className="flex items-center gap-1">
              <button onClick={() => setTab("products")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 inline-flex items-center gap-2 ${tab === "products" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Package className="h-4 w-4" /> Productos <span className="text-xs font-normal">({products.length})</span>
              </button>
              <button onClick={() => setTab("categories")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 inline-flex items-center gap-2 ${tab === "categories" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Tag className="h-4 w-4" /> Categorías <span className="text-xs font-normal">({categories.length})</span>
              </button>
            </div>
            {tab === "products" && canWriteProducts && (
              <button onClick={() => setProductForm("new")} disabled={!categories.some((category) => category.active !== false)}
                className="mb-3 sm:mb-0 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                <Plus className="h-4 w-4" /> Nuevo producto
              </button>
            )}
            {tab === "categories" && canWriteCategories && (
              <button onClick={() => setCategoryForm("new")}
                className="mb-3 sm:mb-0 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" /> Nueva categoría
              </button>
            )}
          </div>

          {loadError && (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <CircleX className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">No fue posible cargar el catálogo</p>
                  <p className="text-xs text-muted-foreground mt-1 break-words">{loadError}</p>
                  <button onClick={() => void reload()} className="mt-3 text-xs font-semibold text-primary underline">Reintentar conexión</button>
                </div>
              </div>
            </div>
          )}

          {tab === "products" && (
            <>
              <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_200px_160px] gap-3 border-b border-border bg-muted/20">
                <label className="relative block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, código, SKU o barras…"
                    className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </label>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="all">Todas las categorías</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="active">Solo activos</option><option value="inactive">Solo inactivos</option><option value="all">Todos los estados</option>
                </select>
              </div>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">Producto</th>
                      <th className="px-4 py-3 text-left font-semibold">Categoría / tipo</th>
                      <th className="px-4 py-3 text-left font-semibold">Unidad</th>
                      <th className="px-4 py-3 text-right font-semibold">Costo estándar</th>
                      <th className="px-4 py-3 text-right font-semibold">Precio venta</th>
                      <th className="px-4 py-3 text-center font-semibold">Estado</th>
                      <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredProducts.map((product) => {
                      const category = categories.find((item) => item.id === product.categoryId);
                      return <tr key={product.id} className="hover:bg-muted/20">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold">{product.name || "Producto sin nombre"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{product.code || "Sin código"}{product.sku ? ` · SKU ${product.sku}` : ""}{product.barcode ? ` · ${product.barcode}` : ""}</div>
                        </td>
                        <td className="px-4 py-3.5"><div>{category?.name ?? "Sin categoría"}</div><div className="text-xs text-muted-foreground mt-0.5">{PRODUCT_TYPES.find((type) => type.value === product.productType)?.label ?? "Sin tipo"}</div></td>
                        <td className="px-4 py-3.5">{product.baseUnit || "—"}</td>
                        <td className="px-4 py-3.5 text-right tabular">{money(product.standardCost)}</td>
                        <td className="px-4 py-3.5 text-right tabular font-semibold">{money(product.salePrice)}</td>
                        <td className="px-4 py-3.5 text-center"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${product.active !== false ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{product.active !== false ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}{product.active !== false ? "Activo" : "Inactivo"}</span></td>
                        <td className="px-5 py-3.5"><div className="flex justify-end gap-1">
                          {canWriteProducts && <><button onClick={() => setProductForm(product)} title="Editar producto" aria-label="Editar producto" className="h-8 w-8 rounded-md border border-border hover:bg-muted grid place-items-center"><Pencil className="h-4 w-4" /></button><button onClick={() => void toggleProduct(product)} title={product.active !== false ? "Desactivar producto" : "Activar producto"} aria-label={product.active !== false ? "Desactivar producto" : "Activar producto"} className="h-8 w-8 rounded-md border border-border hover:bg-muted grid place-items-center"><Power className="h-4 w-4" /></button></>}
                        </div></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
                {filteredProducts.length === 0 && <EmptyState text={products.length ? "No hay productos que coincidan con los filtros." : "Aún no hay productos registrados en el catálogo."} />}
              </div>
              <div className="lg:hidden p-3 space-y-2">
                {filteredProducts.map((product) => {
                  const category = categories.find((item) => item.id === product.categoryId);
                  return <article key={product.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted text-primary grid place-items-center shrink-0"><Package className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-sm">{product.name || "Producto sin nombre"}</h3><span className={`text-[10px] px-2 py-1 rounded-full shrink-0 ${product.active !== false ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{product.active !== false ? "Activo" : "Inactivo"}</span></div>
                        <p className="text-xs text-muted-foreground mt-1">{product.code || "Sin código"} · {category?.name ?? "Sin categoría"}</p>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                          <div><span className="text-muted-foreground">Costo</span><div className="font-medium tabular">{money(product.standardCost)}</div></div>
                          <div><span className="text-muted-foreground">Precio</span><div className="font-semibold tabular">{money(product.salePrice)}</div></div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border text-xs text-muted-foreground"><span>Unidad: {product.baseUnit || "—"}</span>
                          {canWriteProducts && <div className="flex gap-1"><button onClick={() => setProductForm(product)} className="h-8 px-2 rounded-md border border-border inline-flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</button><button onClick={() => void toggleProduct(product)} aria-label="Cambiar estado" className="h-8 w-8 rounded-md border border-border grid place-items-center"><Power className="h-4 w-4" /></button></div>}
                        </div>
                      </div>
                    </div>
                  </article>;
                })}
                {filteredProducts.length === 0 && <EmptyState text={products.length ? "No hay productos que coincidan con los filtros." : "Aún no hay productos registrados en el catálogo."} />}
              </div>
            </>
          )}

          {tab === "categories" && (
            <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {categories.map((category) => (
                <article key={category.id} className="rounded-lg border border-border bg-background p-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg grid place-items-center shrink-0" style={{ background: category.color || "#64748b" }}><Tag className="h-5 w-5 text-white" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-semibold">{category.name}</h3><span className="text-[10px] text-muted-foreground">{category.active !== false ? "Activa" : "Inactiva"}</span></div>
                    <p className="text-xs text-muted-foreground mt-1">{category.code}</p>
                    {category.description && <p className="text-xs text-muted-foreground mt-2">{category.description}</p>}
                    <p className="text-xs text-muted-foreground mt-2">{Number(category.activeProductCount ?? 0)} productos activos</p>
                  </div>
                  {canWriteCategories && <button onClick={() => setCategoryForm(category)} aria-label="Editar categoría" className="h-8 w-8 rounded-md border border-border hover:bg-muted grid place-items-center"><Pencil className="h-4 w-4" /></button>}
                </article>
              ))}
              {categories.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyState text="Aún no hay categorías. Crea una para organizar los productos." /></div>}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          El catálogo maestro se almacena en Firestore. La integración con las pantallas anteriores de punto de venta e inventario sigue pendiente; los cambios aquí no modifican todavía esos catálogos locales.
        </p>
      </div>

      {categoryForm && <CategoryEditor value={categoryForm === "new" ? null : categoryForm} onClose={() => setCategoryForm(null)} onSave={saveCategory} />}
      {productForm && <ProductEditor
        value={productForm === "new" ? null : productForm}
        categories={categories.filter((category) => category.active !== false || (productForm !== "new" && productForm !== null && category.id === productForm.categoryId))}
        onClose={() => setProductForm(null)} onSave={saveProduct}
      />}
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
        <Field label="Categoría"><select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="control">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactiva)"}</option>)}</select></Field>
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
