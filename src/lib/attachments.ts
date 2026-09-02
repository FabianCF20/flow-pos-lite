import { db, type Attachment, type AttachmentRef } from "./db";
import { fileToCompressedDataURL } from "./image";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB por archivo

const ALLOWED = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/csv",
  "application/xml", "text/xml",
];

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

/** Guarda un archivo soporte (factura, comprobante) en el almacenamiento local. */
export async function saveAttachment(
  file: File,
  refType: AttachmentRef,
  refId: number,
  opts?: { note?: string; userId?: number },
): Promise<number> {
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.includes(mime)) {
    throw new Error("Formato no permitido. Usa imagen, PDF, XML, CSV o TXT.");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("El archivo supera 4 MB. Comprímelo o toma una foto del documento.");
  }
  const isImage = mime.startsWith("image/") && mime !== "image/gif";
  const data = isImage ? await fileToCompressedDataURL(file, 1400, 0.72) : await readAsDataURL(file);
  const row: Attachment = {
    refType,
    refId,
    name: file.name || "documento",
    mime,
    size: data.length,
    data,
    createdAt: Date.now(),
    ...(opts?.note ? { note: opts.note } : {}),
    ...(opts?.userId !== undefined ? { userId: opts.userId } : {}),
  };
  return db.attachments.add(row);
}

export async function listAttachments(refType: AttachmentRef, refId: number): Promise<Attachment[]> {
  const all = await db.attachments.where("refType").equals(refType).toArray();
  return all.filter((a) => a.refId === refId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function countAttachments(refType: AttachmentRef, refId: number): Promise<number> {
  return (await listAttachments(refType, refId)).length;
}

export async function deleteAttachment(id: number): Promise<void> {
  await db.attachments.delete(id);
}

/** Abre / descarga un adjunto desde su dataURL. */
export function openAttachment(a: Attachment) {
  const [meta, b64] = a.data.split(",");
  if (!b64) return;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = meta?.match(/data:([^;]+)/)?.[1] ?? a.mime;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const win = window.open(url, "_blank");
  if (!win) {
    const link = document.createElement("a");
    link.href = url;
    link.download = a.name;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
