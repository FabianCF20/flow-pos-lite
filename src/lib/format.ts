import type { AppSettings } from "./db";

export function formatMoney(amount: number, settings?: Pick<AppSettings, "currency" | "decimals">): string {
  const decimals = settings?.decimals ?? 0;
  const currency = settings?.currency ?? "COP";
  const locale = currency === "EUR" ? "es-ES" : currency === "USD" ? "en-US" : "es-CO";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(decimals)}`;
  }
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function endOfDay(ts: number = Date.now()): number {
  const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime();
}