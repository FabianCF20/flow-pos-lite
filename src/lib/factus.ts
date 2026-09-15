import {
  db, getSettings,
  type AppSettings, type Sale, type Customer, type SaleReturn, type DebitNote,
  type FactusInvoiceInfo, type FactusDocKind,
} from "./db";

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

/* ------------------------------ Llamadas base ------------------------------ */

type Action = "auth" | "invoice" | "credit_note" | "debit_note" | "get";

function authBlock(s: AppSettings) {
  return {
    email: s.factusEmail,
    password: s.factusPassword,
    client_id: s.factusClientId,
    client_secret: s.factusClientSecret,
  };
}

/** Llama al proxy del servidor. Lanza Error con el mensaje devuelto por Factus. */
async function callFactus(
  s: AppSettings,
  action: Action,
  body: { payload?: any; path?: string } = {},
): Promise<any> {
  const res = await fetch("/api/public/factus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      env: s.factusEnv ?? "sandbox",
      auth: authBlock(s),
      action,
      ...body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return json;
}

/* -------------------------------- Catálogos -------------------------------- */

export interface FactusRange {
  id: number;
  document?: string;
  prefix?: string;
  from?: number;
  to?: number;
  current?: number;
  resolution_number?: string;
  is_expired?: boolean;
}

export interface FactusMunicipality { id: number; name: string; department?: string; code?: string }

function list(json: any): any[] {
  const d = json?.data ?? json;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

/** Rangos de numeración habilitados (facturas, notas crédito, notas débito). */
export async function fetchNumberingRanges(s: AppSettings): Promise<FactusRange[]> {
  const json = await callFactus(s, "get", { path: "/v1/numbering-ranges" });
  return list(json) as FactusRange[];
}

/** Municipios DIAN. `q` filtra por nombre. */
export async function fetchMunicipalities(s: AppSettings, q?: string): Promise<FactusMunicipality[]> {
  const path = q ? `/v1/municipalities?name=${encodeURIComponent(q)}` : "/v1/municipalities";
  const json = await callFactus(s, "get", { path });
  return list(json) as FactusMunicipality[];
}

/** Unidades de medida DIAN. */
export async function fetchMeasurementUnits(s: AppSettings) {
  const json = await callFactus(s, "get", { path: "/v1/measurement-units" });
  return list(json) as { id: number; code?: string; name: string }[];
}

/** Tributos aplicables a productos (IVA, INC, exento…). */
export async function fetchProductTributes(s: AppSettings) {
  const json = await callFactus(s, "get", { path: "/v1/tributes/products" });
  return list(json) as { id: number; name: string; code?: string }[];
}

/** Consulta una factura emitida por su número. */
export async function fetchBill(s: AppSettings, number: string) {
  return callFactus(s, "get", { path: `/v1/bills/show/${encodeURIComponent(number)}` });
}

/** Listado de facturas emitidas en Factus (para conciliar con el ERP). */
export async function fetchBills(s: AppSettings, page = 1) {
  const json = await callFactus(s, "get", { path: `/v1/bills?page=${page}` });
  return list(json);
}

/* ------------------------------ Construcción ------------------------------- */

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

/** Bloque de cliente para Factus. Sin cliente usa "consumidor final". */
export function buildCustomerBlock(settings: AppSettings, customer?: Customer | null) {
  if (!customer) {
    return {
      identification: "222222222222",
      names: "CONSUMIDOR FINAL",
      legal_organization_id: 2,
      tribute_id: 21,
      identification_document_id: 6,
      municipality_id: settings.factusMunicipalityId ?? 980,
    };
  }
  const juridica = customer.personType === "juridica" || customer.docType === "NIT";
  const block: Record<string, any> = {
    identification: customer.doc ?? "222222222222",
    company: juridica ? customer.name : "",
    trade_name: customer.tradeName ?? "",
    names: customer.name,
    address: [customer.address, customer.city].filter(Boolean).join(", "),
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    legal_organization_id: juridica ? 1 : 2,
    tribute_id: customer.taxRegime === "gran_contribuyente" ? 18 : 21,
    identification_document_id: docTypeCode(customer.docType ?? settings.factusDefaultDocType ?? "CC"),
    municipality_id: settings.factusMunicipalityId ?? 980,
  };
  if (customer.dv) block['dv'] = customer.dv;
  return block;
}

function buildItems(
  items: { productId: number; name: string; qty: number; unitPrice: number }[],
  settings: AppSettings,
) {
  const taxRate = Math.max(0, settings.taxRate || 0);
  const taxIncluded = !!settings.taxIncluded;
  return items.map((it) => {
    const unitBase = taxIncluded && taxRate > 0 ? it.unitPrice / (1 + taxRate / 100) : it.unitPrice;
    return {
      code_reference: String(it.productId),
      name: it.name,
      quantity: it.qty,
      discount_rate: 0,
      price: round2(unitBase),
      tax_rate: String(taxRate.toFixed(2)),
      unit_measure_id: settings.factusUnitMeasureId ?? 70,
      standard_code_id: 1,
      is_excluded: taxRate === 0 ? 1 : 0,
      tribute_id: settings.factusTributeId ?? 1,
      withholding_taxes: [] as any[],
    };
  });
}

/** Payload de factura de venta electrónica. */
export function buildFactusPayload(sale: Sale, settings: AppSettings, customer?: Customer | null) {
  return {
    numbering_range_id: settings.factusNumberingRange ?? 8,
    reference_code: `POS-${sale.id ?? sale.number}`,
    observation: sale.notes ?? "",
    payment_form: paymentFormId(sale.paymentMethod),
    payment_due_date: new Date(sale.createdAt).toISOString().slice(0, 10),
    payment_method_code: paymentMethodCode(sale.paymentMethod),
    customer: buildCustomerBlock(settings, customer),
    items: buildItems(sale.items, settings),
  };
}

/** Payload de nota crédito (devolución, anulación, descuento o ajuste de precio). */
export function buildCreditNotePayload(
  ret: SaleReturn,
  sale: Sale,
  settings: AppSettings,
  customer?: Customer | null,
) {
  const invoice = sale.factus;
  return {
    numbering_range_id: settings.factusCreditRange ?? settings.factusNumberingRange ?? 8,
    correction_concept_code: ret.concept,
    reference_code: `NC-${ret.id ?? ret.number}`,
    observation: ret.reason ?? `Devolución de la factura ${invoice?.number ?? sale.number}`,
    customer: buildCustomerBlock(settings, customer),
    billing_reference: {
      code_reference: `POS-${sale.id ?? sale.number}`,
      number: invoice?.number ?? "",
      cufe: invoice?.cufe ?? "",
      issue_date: new Date(sale.createdAt).toISOString().slice(0, 10),
    },
    items: buildItems(ret.items, settings),
  };
}

/** Payload de nota débito (intereses, gastos por cobrar, cambio de valor). */
export function buildDebitNotePayload(
  note: DebitNote,
  sale: Sale,
  settings: AppSettings,
  customer?: Customer | null,
) {
  const invoice = sale.factus;
  return {
    numbering_range_id: settings.factusDebitRange ?? settings.factusNumberingRange ?? 8,
    correction_concept_code: note.concept,
    reference_code: `ND-${note.id ?? note.number}`,
    observation: note.reason ?? `Nota débito de la factura ${invoice?.number ?? sale.number}`,
    customer: buildCustomerBlock(settings, customer),
    billing_reference: {
      code_reference: `POS-${sale.id ?? sale.number}`,
      number: invoice?.number ?? "",
      cufe: invoice?.cufe ?? "",
      issue_date: new Date(sale.createdAt).toISOString().slice(0, 10),
    },
    items: buildItems(
      [{ productId: 0, name: note.reason || "Cargo adicional", qty: 1, unitPrice: note.total }],
      settings,
    ),
  };
}

/* -------------------------------- Emisión ---------------------------------- */

function parseDoc(json: any, kind: FactusDocKind, relatedNumber?: string): FactusInvoiceInfo {
  const data = json?.data ?? json;
  const doc = data?.bill ?? data?.credit_note ?? data?.debit_note ?? data;
  const info: FactusInvoiceInfo = {
    status: doc?.status === 0 ? "pending" : (typeof doc?.status === "string" ? doc.status : "validated"),
    docKind: kind,
    validatedAt: Date.now(),
    raw: data,
    createdAt: Date.now(),
  };
  const number = doc?.number ?? doc?.name ?? undefined;
  const cufe = doc?.cufe ?? doc?.cude ?? undefined;
  const qr = doc?.qr ?? doc?.qr_image ?? undefined;
  const pdf = data?.pdf_url ?? doc?.pdf ?? doc?.pdf_url ?? undefined;
  const xml = data?.xml_url ?? doc?.xml ?? doc?.xml_url ?? undefined;
  if (number) info.number = String(number);
  if (cufe) info.cufe = String(cufe);
  if (qr) info.qr = String(qr);
  if (pdf) info.pdfUrl = String(pdf);
  if (xml) info.xmlUrl = String(xml);
  if (relatedNumber) info.relatedNumber = relatedNumber;
  return info;
}

function errorInfo(kind: FactusDocKind, message: string, raw?: any): FactusInvoiceInfo {
  const info: FactusInvoiceInfo = {
    status: "error",
    docKind: kind,
    errorMessage: message,
    createdAt: Date.now(),
  };
  if (raw !== undefined) info.raw = raw;
  return info;
}

/** Emite la factura electrónica de una venta y guarda el resultado. */
export async function emitFactusInvoice(sale: Sale): Promise<FactusInvoiceInfo> {
  const settings = await getSettings();
  if (!isFactusConfigured(settings)) throw new Error("Factus no está configurado");
  if (sale.status === "voided") throw new Error("La venta está anulada");
  if (sale.factus?.status === "validated") throw new Error("Esta venta ya tiene factura electrónica");

  const customer = sale.customerId ? await db.customers.get(sale.customerId) : null;
  const payload = buildFactusPayload(sale, settings, customer);
  try {
    const json = await callFactus(settings, "invoice", { payload });
    const info = parseDoc(json, "invoice");
    await db.sales.update(sale.id!, { factus: info });
    return info;
  } catch (e: any) {
    await db.sales.update(sale.id!, { factus: errorInfo("invoice", e?.message ?? "Error de Factus") });
    throw e;
  }
}

/** Emite la nota crédito electrónica de una devolución y guarda el resultado. */
export async function emitFactusCreditNote(ret: SaleReturn): Promise<FactusInvoiceInfo> {
  const settings = await getSettings();
  if (!isFactusConfigured(settings)) throw new Error("Factus no está configurado");
  if (ret.factus?.status === "validated") throw new Error("Esta devolución ya tiene nota crédito");
  const sale = await db.sales.get(ret.saleId);
  if (!sale) throw new Error("Venta original no encontrada");
  if (!sale.factus?.number || sale.factus.status !== "validated") {
    throw new Error("La venta no tiene factura electrónica validada; no se puede emitir nota crédito");
  }
  const customer = ret.customerId ? await db.customers.get(ret.customerId) : null;
  const payload = buildCreditNotePayload(ret, sale, settings, customer);
  try {
    const json = await callFactus(settings, "credit_note", { payload });
    const info = parseDoc(json, "credit_note", sale.factus.number);
    await db.saleReturns.update(ret.id!, { factus: info });
    return info;
  } catch (e: any) {
    await db.saleReturns.update(ret.id!, { factus: errorInfo("credit_note", e?.message ?? "Error de Factus") });
    throw e;
  }
}

/** Emite la nota débito electrónica de un cargo adicional. */
export async function emitFactusDebitNote(note: DebitNote): Promise<FactusInvoiceInfo> {
  const settings = await getSettings();
  if (!isFactusConfigured(settings)) throw new Error("Factus no está configurado");
  if (note.factus?.status === "validated") throw new Error("Esta nota débito ya fue emitida");
  const sale = await db.sales.get(note.saleId);
  if (!sale) throw new Error("Venta original no encontrada");
  if (!sale.factus?.number || sale.factus.status !== "validated") {
    throw new Error("La venta no tiene factura electrónica validada; no se puede emitir nota débito");
  }
  const customer = note.customerId ? await db.customers.get(note.customerId) : null;
  const payload = buildDebitNotePayload(note, sale, settings, customer);
  try {
    const json = await callFactus(settings, "debit_note", { payload });
    const info = parseDoc(json, "debit_note", sale.factus.number);
    await db.debitNotes.update(note.id!, { factus: info });
    return info;
  } catch (e: any) {
    await db.debitNotes.update(note.id!, { factus: errorInfo("debit_note", e?.message ?? "Error de Factus") });
    throw e;
  }
}

/** Prueba las credenciales contra Factus (obtiene token). */
export async function testFactusAuth(s: AppSettings): Promise<{ ok: boolean; message: string }> {
  try {
    await callFactus(s, "auth");
    return { ok: true, message: "Conexión con Factus exitosa" };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Error de red" };
  }
}
