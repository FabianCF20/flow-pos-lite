import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// DIAN NIT check-digit algorithm (mod 11 with fixed weight vector).
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

function computeCheckDigit(nitDigits: string): number {
  const reversed = nitDigits.split("").reverse();
  let sum = 0;
  for (let i = 0; i < reversed.length; i++) {
    sum += Number(reversed[i]) * WEIGHTS[i];
  }
  const mod = sum % 11;
  if (mod === 0) return 0;
  if (mod === 1) return 1;
  return 11 - mod;
}

export default defineTool({
  name: "validate_nit",
  title: "Validate Colombian NIT check digit",
  description: "Compute and verify the DIAN check digit for a Colombian NIT. Accepts the NIT with or without the check digit; returns the expected DV.",
  inputSchema: {
    nit: z.string().describe("NIT number, e.g. '900123456' or '900123456-7'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ nit }) => {
    const cleaned = nit.replace(/[^0-9-]/g, "");
    const [rawBase, rawDv] = cleaned.split("-");
    const base = (rawBase ?? "").replace(/\D/g, "");
    if (!base || base.length > WEIGHTS.length) {
      return { content: [{ type: "text", text: "NIT inválido" }], isError: true };
    }
    const expected = computeCheckDigit(base);
    const provided = rawDv !== undefined && rawDv !== "" ? Number(rawDv) : undefined;
    const valid = provided === undefined ? null : provided === expected;
    const text =
      valid === null
        ? `NIT ${base}, dígito de verificación esperado: ${expected}`
        : valid
          ? `NIT ${base}-${provided} válido`
          : `NIT ${base}-${provided} inválido; esperado -${expected}`;
    return {
      content: [{ type: "text", text }],
      structuredContent: { nit: base, providedDv: provided ?? null, expectedDv: expected, valid },
    };
  },
});