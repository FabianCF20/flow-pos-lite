import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { db, type AttachmentRef } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { saveAttachment, deleteAttachment, openAttachment, humanSize } from "@/lib/attachments";
import { Paperclip, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  refType: AttachmentRef;
  refId: number;
  title?: string;
  hint?: string;
}

/** Panel de documentos soporte: sube facturas, comprobantes de pago y evidencias. */
export function Attachments({ refType, refId, title = "Documentos soporte", hint }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const items = useLiveQuery(async () => {
    const all = await db.attachments.where("refType").equals(refType).toArray();
    return all.filter((a) => a.refId === refId).sort((a, b) => b.createdAt - a.createdAt);
  }, [refType, refId]);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await saveAttachment(f, refType, refId, user?.id !== undefined ? { userId: user.id } : undefined);
      }
      toast.success(files.length > 1 ? "Documentos adjuntados" : "Documento adjuntado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo adjuntar");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold inline-flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" /> {title}
        </div>
        <span className="text-[11px] text-muted-foreground">{items?.length ?? 0}</span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.xml,.csv,.txt"
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="w-full h-10 rounded-xl border border-dashed border-border text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Upload className="h-4 w-4" /> {busy ? "Guardando…" : "Subir factura o comprobante"}
      </button>

      <div className="space-y-1.5">
        {items?.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-2">
            <div className="h-8 w-8 rounded-md bg-primary/15 text-primary grid place-items-center shrink-0">
              {a.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <button type="button" onClick={() => openAttachment(a)} className="flex-1 min-w-0 text-left">
              <div className="text-xs font-medium truncate">{a.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatDate(a.createdAt)} · {humanSize(a.size)}
              </div>
            </button>
            <button
              type="button"
              onClick={async () => { await deleteAttachment(a.id!); toast.success("Documento eliminado"); }}
              className="h-8 w-8 rounded-md text-destructive grid place-items-center shrink-0"
              aria-label={`Eliminar ${a.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {items?.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-2">Sin documentos adjuntos</div>
        )}
      </div>
    </div>
  );
}
