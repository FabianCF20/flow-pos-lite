import { useState } from "react";
import { toast } from "sonner";
import type { AppSettings } from "@/lib/db";
import { fetchNumberingRanges, fetchMunicipalities, isFactusConfigured, type FactusRange, type FactusMunicipality } from "@/lib/factus";

const cls = "mt-1 w-full h-11 px-3 rounded-lg bg-background border border-border text-sm";

export function FactusExtra({ s, setS }: { s: AppSettings; setS: (s: AppSettings) => void }) {
  const [ranges, setRanges] = useState<FactusRange[]>([]);
  const [munis, setMunis] = useState<FactusMunicipality[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRanges() {
    if (!isFactusConfigured(s)) { toast.error("Completa las credenciales"); return; }
    setLoading(true);
    try {
      const r = await fetchNumberingRanges(s);
      setRanges(r);
      toast.success(`${r.length} rangos cargados`);
    } catch (e: any) { toast.error(e?.message ?? "Error"); } finally { setLoading(false); }
  }
  async function searchMuni() {
    if (!isFactusConfigured(s)) { toast.error("Completa las credenciales"); return; }
    try { setMunis(await fetchMunicipalities(s, q)); } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  const label = (r: FactusRange) => `${r.id} · ${r.document ?? ""} ${r.prefix ?? ""} (${r.from ?? ""}-${r.to ?? ""})${r.is_expired ? " vencido" : ""}`;
  const RangeField = ({ title, field }: { title: string; field: "factusNumberingRange" | "factusCreditRange" | "factusDebitRange" }) => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{title}</span>
      {ranges.length ? (
        <select className={cls} value={s[field] ?? ""} onChange={(e) => setS({ ...s, [field]: Number(e.target.value) || undefined })}>
          <option value="">—</option>
          {ranges.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      ) : (
        <input type="number" className={cls} value={s[field] ?? ""} onChange={(e) => setS({ ...s, [field]: Number(e.target.value) || undefined })} />
      )}
    </label>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Rangos y catálogos DIAN</div>
        <button type="button" disabled={loading} onClick={loadRanges} className="h-9 px-3 rounded-lg bg-card border border-border text-xs font-medium disabled:opacity-50">
          {loading ? "Cargando…" : "Cargar rangos desde Factus"}
        </button>
      </div>
      <RangeField title="Rango notas crédito" field="factusCreditRange" />
      <RangeField title="Rango notas débito" field="factusDebitRange" />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-muted-foreground">Unidad de medida (ID)</span>
          <input type="number" className={cls} value={s.factusUnitMeasureId ?? ""} placeholder="70 = Unidad" onChange={(e) => setS({ ...s, factusUnitMeasureId: Number(e.target.value) || undefined })} />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Tributo (ID)</span>
          <input type="number" className={cls} value={s.factusTributeId ?? ""} placeholder="1 = IVA" onChange={(e) => setS({ ...s, factusTributeId: Number(e.target.value) || undefined })} />
        </label>
      </div>
      <div>
        <span className="text-xs text-muted-foreground">Buscar municipio</span>
        <div className="flex gap-2 mt-1">
          <input className={cls + " mt-0"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: Medellín" />
          <button type="button" onClick={searchMuni} className="h-11 px-3 rounded-lg bg-card border border-border text-sm">Buscar</button>
        </div>
        {munis.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {munis.slice(0, 50).map((m) => (
              <button type="button" key={m.id} onClick={() => { setS({ ...s, factusMunicipalityId: m.id }); setMunis([]); toast.success(`Municipio ${m.name} seleccionado`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">
                {m.name} {m.department ? `· ${m.department}` : ""} <span className="text-muted-foreground">#{m.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!s.factusAutoInvoice} onChange={(e) => setS({ ...s, factusAutoInvoice: e.target.checked })} />
        Emitir factura electrónica automáticamente al vender
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!s.factusAutoCreditNote} onChange={(e) => setS({ ...s, factusAutoCreditNote: e.target.checked })} />
        Emitir nota crédito automáticamente en devoluciones
      </label>
    </div>
  );
}
