import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "format_cop",
  title: "Format Colombian pesos",
  description: "Format a numeric amount as Colombian pesos (COP) using es-CO locale, with configurable decimals.",
  inputSchema: {
    amount: z.number().describe("Numeric amount to format."),
    decimals: z.number().int().min(0).max(4).default(0).describe("Number of decimal places."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ amount, decimals }) => {
    const formatted = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
    return {
      content: [{ type: "text", text: formatted }],
      structuredContent: { amount, decimals, formatted },
    };
  },
});