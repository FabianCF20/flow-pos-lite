// Lee un File de imagen y lo redimensiona/comprime a dataURL JPEG.
// Mantiene el almacenamiento local liviano (≤ ~80 KB por foto).
export async function fileToCompressedDataURL(
  file: File,
  maxSize = 384,
  quality = 0.72,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("No se pudo leer la imagen"));
    i.src = dataUrl;
  });
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  // Prefiere WebP cuando esté soportado (≈30% menos peso, decodifica más rápido)
  try {
    const webp = canvas.toDataURL("image/webp", quality);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {}
  return canvas.toDataURL("image/jpeg", quality);
}
