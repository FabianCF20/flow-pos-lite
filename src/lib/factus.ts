import { db, type AppSettings, type Sale, type Customer } from "./db";

export type FactusEnv = "sandbox" | "production";

export function factusBaseUrl(env: FactusEnv | undefined) {
  return env === "production"
    ? "https://api.factus.com.co"
    : "https://api-sandbox.factus.com.co";
}

export function isFactusConfigured(s?: AppSettings | null): boolean {
  if (!s?.factusEnabled) return false;
  return !!(s.factusEmail && s.factusPassword && s.factusClientId && s.factusClientSecret);
}

function round2(n: number) { return Math.round(n * 100) / 100; }

/** Build a Factus invoice payload from a POS sale. */
export function buildFactusPayload(sale: Sale, settings: AppSettings, customer?: Customer | null) {
  const taxRate = Math.max(0, settings.taxRate || 0);
  const taxIncluded = !!settings.taxIncluded;

  const items = sale.items.map((it) => {
    // unit price sent to Factus is the base (without tax) when taxes are included in POS price
    const unitBase = taxIncluded && taxRate > 0
      ? it.unitPrice / (1 + taxRate / 100)
      : it.unitPrice;
    return {
      code_reference: String(it.productId),
      name: it.name,
      quantity: it.qty,
      discount_rate: 0,
      price: round2(unitBase),
      tax_rate: String(taxRate.toFixed(2)),
      unit_measure_id: 70,           // 70 = "Unidad" (default catalog)
      standard_code_id: 1,
      is_excluded: taxRate === 0 ? 1 : 0,
      tribute_id: 1,                  // 01 = IVA
      withholding_taxes: [] as any[],
    };
  });

  const customerBlock = customer
    ? {
        identification: customer.doc ?? "222222222222",
        dv: undefined,
        company: "",
        trade_name: "",
        names: customer.name,
        address: "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        legal_organization_id: 2,     // 2 = Natural
        tribute_id: 21,               // 21 = No aplica
        identification_document_id: docTypeCode(settings.factusDefaultDocType ?? "CC"),
        municipality_id: settings.factusMunicipalityId ?? 980, // 980 Bogotá default
      }
    : {
        // consumidor final
        identification: "222222222222",
        names: "CONSUMIDOR FINAL",
        legal_organization_id: 2,
        tribute_id: 21,
        identification_document_id: 6, // NIT genérico "222..." usa NIT
        municipality_id: settings.factusMunicipalityId ?? 980,
      };

  return {
    numbering_range_id: settings.factusNumberingRange ?? 8,
    reference_code: `POS-${sale.id ?? sale.number}`,
    observation: sale.notes ?? "",
    payment_form: paymentFormId(sale.paymentMethod),
    payment_due_date: new Date(sale.createdAt).toISOString().slice(0, 10),
    payment_method_code: paymentMethodCode(sale.paymentMethod),
    billing_period: undefined,
    customer: customerBlock,
    items,
  };
}

function docTypeCode(t: string) {
  const map: Record<string, number> = { RC: 1, TI: 2, CC: 3, TE: 4, CE: 5, NIT: 6, PAS: 7, DEX: 8, PEP: 9, PPT: 10 };
  return map[t] ?? 3;
}
function paymentFormId(m: Sale["paymentMethod"]) {
  return m === "credit" ? 2 : 1; // 1 contado, 2 crédito
}
function paymentMethodCode(m: Sale["paymentMethod"]) {
  switch (m) {
    case "cash": return "10";        // efectivo
    case "card": return "48";        // tarjeta crédito/débito
    case "transfer": return "42";    // consignación
    case "credit": return "ZZZ";
    default: return "10";
  }
}

/** Call the server proxy to validate + emit the electronic invoice. */
export async function emitFactusInvoice(sale: Sale): Promise<void> {
  const settings = await db.settings.toCollection().first();
  if (!settings) throw new Error("Ajustes no encontrados");
  if (!isFactusConfigured(settings)) throw new Error("Factus no está configurado");

  const customer = sale.customerId ? await db.customers.get(sale.customerId) : null;
  const payload = buildFactusPayload(sale, settings, customer);

  const res = await fetch("/api/public/factus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      env: settings.factusEnv ?? "sandbox",
      auth: {
        email: settings.factusEmail,
        password: settings.factusPassword,
        client_id: settings.factusClientId,
        client_secret: settings.factusClientSecret,
      },
      payload,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    await db.sales.update(sale.id!, {
      factus: {
        status: "error",
        errorMessage: typeof msg === "string" ? msg : JSON.stringify(msg),
        raw: json,
        createdAt: Date.now(),
      },
    });
    throw new Error(typeof msg === "string" ? msg : "Error de Factus");
  }

  const data = json?.data ?? json;
  const bill = data?.bill ?? data;
  const info = {
    number: bill?.number ?? bill?.name ?? undefined,
    cufe: bill?.cufe ?? undefined,
    qr: bill?.qr ?? bill?.qr_image ?? undefined,
    pdfUrl: bill?.pdf ?? bill?.pdf_url ?? undefined,
    xmlUrl: bill?.xml ?? bill?.xml_url ?? undefined,
    status: bill?.status ?? "validated",
    raw: data,
    createdAt: Date.now(),
  };
  await db.sales.update(sale.id!, { factus: info });
}

/** Test credentials against Factus (obtains access token). */
export async function testFactusAuth(s: AppSettings): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/public/factus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        env: s.factusEnv ?? "sandbox",
        auth: {
          email: s.factusEmail,
          password: s.factusPassword,
          client_id: s.factusClientId,
          client_secret: s.factusClientSecret,
        },
        testAuth: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return { ok: false, message: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true, message: "Conexión con Factus exitosa" };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Error de red" };
  }
}