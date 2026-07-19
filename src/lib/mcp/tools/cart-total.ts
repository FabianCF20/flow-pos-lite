import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "cart_total",
  title: "Compute cart total",
  description: "Compute subtotal, discount and total for a POS cart. Accepts a list of items with qty and unitPrice, an optional overall discount, and paid amount for change.",
  inputSchema: {
    items: z
      .array(
        z.object({
          name: z.string().optional(),
          qty: z.number().positive(),
          unitPrice: z.number().nonnegative(),
        }),
      )
      .describe("Cart line items."),
    discount: z.number().nonnegative().default(0).describe("Overall discount amount in COP."),
    paid: z.number().nonnegative().default(0).describe("Amount paid by the customer in COP."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ items, discount, paid }) => {
    const round = (n: number) => Math.round(n * 100) / 100;
    const lines = items.map((it) => ({
      name: it.name ?? "",
      qty: it.qty,
      unitPrice: it.unitPrice,
      total: round(it.qty * it.unitPrice),
    }));
    const subtotal = round(lines.reduce((s, l) => s + l.total, 0));
    const total = Math.max(0, round(subtotal - discount));
    const change = round(Math.max(0, paid - total));
    const due = round(Math.max(0, total - paid));
    const result = { lines, subtotal, discount, total, paid, change, due };
    return {
      content: [
        {
          type: "text",
          text: `Subtotal: ${subtotal} · Descuento: ${discount} · Total: ${total} · Pagado: ${paid} · Cambio: ${change}${due > 0 ? ` · Falta: ${due}` : ""}`,
        },
      ],
      structuredContent: result,
    };
  },
});