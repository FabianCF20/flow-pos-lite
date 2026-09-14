import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useSync } from "@/lib/sync";

function label(lastSync: number | null) {
  if (!lastSync) return "Sin sincronizar";
  const mins = Math.floor((Date.now() - lastSync) / 60000);
  if (mins < 1) return "Al día";
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return `Hace ${h} h`;
}

/** Estado de la copia en la nube: se puede tocar para sincronizar ahora. */
export function SyncStatus() {
  const { state, lastSync, pending, sync } = useSync();

  const Icon =
    state === "syncing" ? RefreshCw : state === "offline" ? CloudOff : state === "error" ? TriangleAlert : Cloud;

  const tone =
    state === "offline"
      ? "text-muted-foreground"
      : state === "error"
        ? "text-destructive"
        : pending > 0
          ? "text-gold"
          : "text-primary";

  const text =
    state === "syncing"
      ? "Guardando en la nube…"
      : state === "offline"
        ? pending > 0
          ? `Sin conexión · ${pending} por subir`
          : "Sin conexión"
        : state === "error"
          ? "No se pudo sincronizar"
          : pending > 0
            ? `${pending} por subir`
            : label(lastSync);

  return (
    <button
      onClick={() => void sync()}
      title={`Sincronizar ahora · ${text}`}
      aria-label={`Estado de la nube: ${text}. Sincronizar ahora`}
      className="h-9 px-2.5 flex items-center gap-2 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className={`h-4 w-4 ${tone} ${state === "syncing" ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline max-w-[10rem] truncate">{text}</span>
    </button>
  );
}
