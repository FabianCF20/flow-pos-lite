import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "calculate_iva",
  title: "Calculate IVA (Colombia)",
  description: "Break down an amount into base and IVA (VAT) given a tax rate percentage. Set taxIncluded=true when the input already includes IVA.",
  inputSchema: {
    amount: z.number().nonnegative().describe("Amount in COP."),
    rate: z.number().min(0).max(100).default(19).describe("IVA rate as a percentage, e.g. 19 for 19%."),
    taxIncluded: z.boolean().default(true).describe("Whether the amount already includes IVA."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ amount, rate, taxIncluded }) => {
    const r = rate / 100;
    let base: number;
    let iva: number;
    let total: number;
    if (taxIncluded) {
      base = amount / (1 + r);
      iva = amount - base;
      total = amount;
    } else {
      base = amount;
      iva = amount * r;
      total = amount + iva;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const result = { base: round(base), iva: round(iva), total: round(total), rate, taxIncluded };
    return {
      content: [{ type: "text", text: `Base: ${result.base} · IVA (${rate}%): ${result.iva} · Total: ${result.total}` }],
      structuredContent: result,
    };
  },
});