import type { Sale, AppSettings } from "./db";
import { formatMoney, formatDate } from "./format";

const W = 32; // chars per line for 58mm printers

function pad(left: string, right: string, width = W): string {
  const space = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(space) + right;
}
function center(text: string, width = W): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}
function line(ch = "-", width = W) { return ch.repeat(width); }

export function buildReceiptText(sale: Sale, settings: AppSettings, cashierName: string): string {
  const lines: string[] = [];
  lines.push(center(settings.businessName));
  if (settings.address) lines.push(center(settings.address));
  if (settings.phone) lines.push(center("Tel: " + settings.phone));
  if (settings.taxId) lines.push(center("NIT: " + settings.taxId));
  lines.push(line("="));
  lines.push(`Ticket #${sale.number}`);
  lines.push(formatDate(sale.createdAt));
  lines.push(`Cajero: ${cashierName}`);
  lines.push(line());
  for (const it of sale.items) {
    lines.push(it.name.slice(0, W));
    lines.push(pad(`  ${it.qty} x ${formatMoney(it.unitPrice, settings)}`, formatMoney(it.total, settings)));
  }
  lines.push(line());
  lines.push(pad("Subtotal", formatMoney(sale.subtotal, settings)));
  if (sale.discount > 0) lines.push(pad("Descuento", "-" + formatMoney(sale.discount, settings)));
  lines.push(pad("TOTAL", formatMoney(sale.total, settings)));
  lines.push(pad("Pago (" + sale.paymentMethod + ")", formatMoney(sale.paid, settings)));
  if (sale.change > 0) lines.push(pad("Cambio", formatMoney(sale.change, settings)));
  lines.push(line("="));
  if (settings.receiptFooter) lines.push(center(settings.receiptFooter));
  lines.push("");
  return lines.join("\n");
}