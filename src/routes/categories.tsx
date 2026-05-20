import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, type Category } from "@/lib/db";
import { PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Plus, X, Trash2, Edit3, Tag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/categories")({ component: CategoriesPage });

const PALETTE = [
  "#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

function CategoriesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      navigate({ to: "/pos", replace: true });
    }
  }, [loading, user, navigate]);

  function countFor(catId?: number) {
    if (!catId) return 0;
    return (products ?? []).filter((p) => p.categoryId === catId).length;
  }

  return (
    <div>
      <PageHeader
        title="Categorías"
        subtitle={`${categories?.length ?? 0} categorías`}
        right={
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Nueva
          </button>
        }
      />

      <div className="px-4 md:px-6 space-y-2">
        {(categories ?? []).map((c) => (
          <div key={c.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg grid place-items-center shrink-0" style={{ background: c.color ?? "#4f46e5" }}>
              <Tag className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{c.name}</div>
              <div className="text-xs text-muted-foreground">{countFor(c.id)} productos</div>
            </div>
            <button onClick={() => { setEditing(c); setShowForm(true); }} className="h-9 w-9 rounded-lg bg-muted grid place-items-center">
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(categories?.length ?? 0) === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            Aún no hay categorías. Crea la primera para empezar a agregar productos.
          </div>
        )}
      </div>

      {showForm && (
        <CategoryForm
          category={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
          productCount={countFor(editing?.id)}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  onClose,
  onSaved,
  productCount,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
  productCount: number;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? PALETTE[0]);

  async function save() {
    const n = name.trim();
    if (!n) { toast.error("Nombre requerido"); return; }
    if (category?.id) {
      await db.categories.update(category.id, { name: n, color });
    } else {
      await db.categories.add({ name: n, color });
    }
    toast.success("Guardado");
    onSaved();
  }

  async function remove() {
    if (!category?.id) return;
    if (productCount > 0) {
      toast.error(`No se puede eliminar: tiene ${productCount} producto(s)`);
      return;
    }
    if (!confirm("¿Eliminar categoría?")) return;
    await db.categories.delete(category.id);
    toast.success("Eliminada");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="absolute bottom-0 inset-x-0 md:inset-0 md:m-auto md:max-w-md md:h-fit md:rounded-2xl bg-card rounded-t-2xl max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-card flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold">{category ? "Editar" : "Nueva"} categoría</div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <label className="block">
            <span className="text-xs text-muted-foreground">Nombre</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border outline-none focus:border-primary text-sm"
              placeholder="Ej: Bebidas"
            />
          </label>

          <div>
            <span className="text-xs text-muted-foreground">Color</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {category && (
              <button onClick={remove} className="h-12 px-4 rounded-xl border border-destructive/40 text-destructive flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={save} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}