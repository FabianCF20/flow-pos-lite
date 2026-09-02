import Dexie, { type Table } from "dexie";

export interface Category {
  id?: number;
  name: string;
  color?: string;
}

export interface Product {
  id?: number;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;        // sale price
  cost?: number;        // unit cost
  stock: number;
  trackStock: boolean;
  categoryId?: number;
  imageEmoji?: string;
  image?: string; // dataURL (base64) — foto del producto
  active: boolean;
  createdAt: number;
}

export type DocType = "CC" | "NIT" | "CE" | "PP" | "TI" | "NITE" | "PEP";
export type PersonType = "natural" | "juridica";
export type TaxRegime = "simplificado" | "comun" | "gran_contribuyente" | "no_responsable_iva" | "regimen_simple";

export interface Customer {
  id?: number;
  name: string;               // razón social / nombre completo
  tradeName?: string;         // nombre comercial
  docType?: DocType;
  doc?: string;
  dv?: string;                // dígito de verificación (NIT)
  personType?: PersonType;
  taxRegime?: TaxRegime;
  phone?: string;
  phone2?: string;
  email?: string;
  contactName?: string;       // persona de contacto
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;             // departamento
  country?: string;
  postalCode?: string;
  website?: string;
  priceList?: string;         // lista de precios / segmento
  paymentTerms?: number;      // días de plazo
  creditLimit?: number;
  taxExempt?: boolean;        // exento de IVA
  seller?: string;            // vendedor asignado
  notes?: string;
  active?: boolean;
  createdAt: number;
}


export interface SaleItem {
  productId: number;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export type PaymentMethod = "cash" | "card" | "transfer" | "credit" | "other";

export interface FactusInvoiceInfo {
  number?: string;         // e.g. SETP990000001
  cufe?: string;
  qr?: string;             // QR string or URL
  pdfUrl?: string;
  xmlUrl?: string;
  status?: string;         // validated, pending, error
  errorMessage?: string;
  raw?: any;
  createdAt: number;
}

export interface Sale {
  id?: number;
  number: number;             // ticket number per shift
  cashSessionId?: number;
  userId: number;
  customerId?: number;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change: number;
  paymentMethod: PaymentMethod;
  status: "completed" | "voided";
  createdAt: number;
  notes?: string;
  factus?: FactusInvoiceInfo;
}

export interface CashSession {
  id?: number;
  userId: number;
  openedAt: number;
  closedAt?: number;
  openingAmount: number;
  countedAmount?: number;
  expectedAmount?: number;
  difference?: number;
  notes?: string;
}

export type CashMovementType = "in" | "out";
export interface CashMovement {
  id?: number;
  sessionId: number;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt: number;
  userId: number;
}

export type UserRole = "admin" | "cashier";
export interface User {
  id?: number;
  name: string;
  pin: string;       // 4-6 digit PIN
  role: UserRole;
  active: boolean;
  createdAt: number;
}

export interface AppSettings {
  id?: number;
  businessName: string;
  address?: string;
  phone?: string;
  taxId?: string;
  currency: string;       // "COP"
  decimals: number;       // 0
  taxRate: number;        // %
  taxIncluded: boolean;
  receiptFooter?: string;
  printerName?: string;   // last paired BT device
  // Factus (facturación electrónica DIAN — Colombia)
  factusEnabled?: boolean;
  factusEnv?: "sandbox" | "production";
  factusEmail?: string;
  factusPassword?: string;
  factusClientId?: string;
  factusClientSecret?: string;
  factusNumberingRange?: number;   // range id from Factus dashboard
  factusDefaultDocType?: string;   // "CC" | "NIT" | "CE" | ...
  factusMunicipalityId?: number;   // default municipality
}

// ===================== ERP =====================

export interface Supplier {
  id?: number;
  name: string;               // razón social
  tradeName?: string;
  docType?: DocType;
  nit?: string;
  dv?: string;
  taxRegime?: TaxRegime;
  supplierType?: "nacional" | "importacion" | "servicios";
  phone?: string;
  phone2?: string;
  email?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;           // país de origen (importaciones)
  website?: string;
  currency?: string;          // USD, EUR, COP...
  incoterm?: "EXW" | "FOB" | "CIF" | "CFR" | "DAP" | "DDP" | "FCA";
  leadTimeDays?: number;      // tiempo de entrega
  paymentTerms?: number;      // días de plazo
  creditLimit?: number;
  bankName?: string;
  bankAccount?: string;
  swift?: string;             // SWIFT / IBAN proveedores del exterior
  notes?: string;
  active?: boolean;
  createdAt: number;
}


export interface Warehouse {
  id?: number;
  name: string;
  location?: string;
  isDefault?: boolean;
  createdAt: number;
}

export type StockMoveType = "in" | "out" | "adjust" | "transfer_in" | "transfer_out";
export interface StockMove {
  id?: number;
  productId: number;
  productName: string;
  warehouseId: number;
  type: StockMoveType;
  qty: number;              // siempre positivo
  unitCost?: number;
  balanceAfter?: number;    // saldo del producto en la bodega
  refType?: "sale" | "purchase" | "adjust" | "transfer" | "void";
  refId?: number;
  note?: string;
  userId?: number;
  createdAt: number;
}

export interface PurchaseItem {
  productId: number;
  name: string;
  qty: number;
  unitCost: number;
  total: number;
}

export type PurchaseStatus = "draft" | "received" | "cancelled";
export interface Purchase {
  id?: number;
  number: number;
  supplierId: number;
  supplierName: string;
  warehouseId: number;
  items: PurchaseItem[];
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  status: PurchaseStatus;
  dueDate?: number;
  notes?: string;
  createdAt: number;
  receivedAt?: number;
}

export interface SupplierPayment {
  id?: number;
  purchaseId: number;
  amount: number;
  method: PaymentMethod;
  note?: string;
  userId?: number;
  createdAt: number;
}

export type ReceivableStatus = "open" | "paid" | "cancelled";
export interface Receivable {
  id?: number;
  saleId: number;
  saleNumber: number;
  customerId?: number;
  customerName: string;
  total: number;
  paid: number;
  status: ReceivableStatus;
  dueDate: number;
  createdAt: number;
}

export interface ArPayment {
  id?: number;
  receivableId: number;
  amount: number;
  method: PaymentMethod;
  note?: string;
  userId?: number;
  createdAt: number;
}

export type AccountType = "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto" | "costo";
export interface Account {
  id?: number;
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  active?: boolean;
  system?: boolean;      // cuenta usada por automatismos, no borrable

}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  note?: string;
  thirdParty?: string;   // tercero (cliente / proveedor / empleado)
}

export interface JournalEntry {
  id?: number;
  number?: number;       // consecutivo del comprobante
  date: number;
  description: string;
  refType?: string;
  refId?: number;
  thirdParty?: string;
  lines: JournalLine[];
  userId?: number;
  closing?: boolean;     // asiento de cierre de ejercicio
}


export interface Employee {
  id?: number;
  name: string;
  doc?: string;
  position?: string;
  salary?: number;
  phone?: string;
  active: boolean;
  createdAt: number;
}

/** Documento soporte (factura, comprobante de pago, recibo) guardado localmente. */
export type AttachmentRef =
  | "sale" | "purchase" | "ap_payment" | "ar_payment" | "expense" | "journal" | "supplier" | "customer";

export interface Attachment {
  id?: number;
  refType: AttachmentRef;
  refId: number;
  name: string;
  mime: string;
  size: number;
  data: string;          // dataURL (imagen comprimida o PDF en base64)
  note?: string;
  userId?: number;
  createdAt: number;
}


class POSDB extends Dexie {
  categories!: Table<Category, number>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  sales!: Table<Sale, number>;
  cashSessions!: Table<CashSession, number>;
  cashMovements!: Table<CashMovement, number>;
  users!: Table<User, number>;
  settings!: Table<AppSettings, number>;
  // ERP
  suppliers!: Table<Supplier, number>;
  warehouses!: Table<Warehouse, number>;
  stockMoves!: Table<StockMove, number>;
  purchases!: Table<Purchase, number>;
  supplierPayments!: Table<SupplierPayment, number>;
  receivables!: Table<Receivable, number>;
  arPayments!: Table<ArPayment, number>;
  accounts!: Table<Account, number>;
  journalEntries!: Table<JournalEntry, number>;
  attachments!: Table<Attachment, number>;


  constructor() {
    super("pos_offline_db");
    this.version(1).stores({
      categories: "++id, name",
      products: "++id, name, sku, barcode, categoryId, active",
      customers: "++id, name, doc, phone",
      sales: "++id, number, cashSessionId, userId, customerId, status, createdAt",
      cashSessions: "++id, userId, openedAt, closedAt",
      cashMovements: "++id, sessionId, type, createdAt",
      users: "++id, name, role, active",
      settings: "++id",
    });
    this.version(2).stores({
      suppliers: "++id, name, nit",
      warehouses: "++id, name",
      stockMoves: "++id, productId, warehouseId, type, refType, refId, createdAt",
      purchases: "++id, number, supplierId, status, createdAt",
      supplierPayments: "++id, purchaseId, createdAt",
      receivables: "++id, saleId, customerId, status, dueDate, createdAt",
      arPayments: "++id, receivableId, createdAt",
      accounts: "++id, code, name, type",
      journalEntries: "++id, date, refType, refId",
    });
    this.version(3).stores({
      customers: "++id, name, doc, phone, city, active",
      suppliers: "++id, name, nit, city, country, supplierType, active",
    });
    this.version(4).stores({
      attachments: "++id, refType, refId, createdAt",
    });

  }
}

export const db = new POSDB();

/** Plan Único de Cuentas (PUC Colombia) simplificado para empresa importadora / comercializadora. */
export const DEFAULT_ACCOUNTS: Omit<Account, "id">[] = [
  // 1 — Activo
  { code: "1105", name: "Caja general", type: "activo", system: true },
  { code: "1110", name: "Bancos", type: "activo", system: true },
  { code: "1305", name: "Clientes (cartera)", type: "activo", system: true },
  { code: "1330", name: "Anticipos a proveedores", type: "activo" },
  { code: "1355", name: "IVA descontable", type: "activo", system: true },
  { code: "1360", name: "Retenciones a favor (autoretención)", type: "activo" },
  { code: "1435", name: "Inventario de mercancías", type: "activo", system: true },
  { code: "1465", name: "Mercancía en tránsito (importaciones)", type: "activo" },
  { code: "1524", name: "Equipo de oficina y cómputo", type: "activo" },
  { code: "1592", name: "Depreciación acumulada", type: "activo" },
  // 2 — Pasivo
  { code: "2205", name: "Proveedores nacionales", type: "pasivo", system: true },
  { code: "2210", name: "Proveedores del exterior", type: "pasivo" },
  { code: "2335", name: "Costos y gastos por pagar", type: "pasivo", system: true },
  { code: "2365", name: "Retención en la fuente por pagar", type: "pasivo" },
  { code: "2367", name: "IVA retenido por pagar", type: "pasivo" },
  { code: "2368", name: "ICA retenido por pagar", type: "pasivo" },
  { code: "2380", name: "Anticipos de clientes", type: "pasivo" },
  { code: "2408", name: "IVA generado por pagar", type: "pasivo", system: true },
  { code: "2505", name: "Salarios por pagar", type: "pasivo" },
  { code: "2610", name: "Prestaciones sociales por pagar", type: "pasivo" },
  { code: "2805", name: "Obligaciones financieras", type: "pasivo" },
  // 3 — Patrimonio
  { code: "3105", name: "Capital social", type: "patrimonio", system: true },
  { code: "3605", name: "Utilidad del ejercicio", type: "patrimonio", system: true },
  { code: "3705", name: "Resultados de ejercicios anteriores", type: "patrimonio", system: true },
  // 4 — Ingresos
  { code: "4135", name: "Ingresos por ventas", type: "ingreso", system: true },
  { code: "4175", name: "Devoluciones en ventas", type: "ingreso", system: true },
  { code: "4210", name: "Ingresos financieros", type: "ingreso" },
  { code: "4295", name: "Otros ingresos (diferencia en cambio)", type: "ingreso" },
  // 5 — Gastos
  { code: "5105", name: "Gastos de personal", type: "gasto" },
  { code: "5110", name: "Honorarios", type: "gasto" },
  { code: "5115", name: "Impuestos (ICA, predial, otros)", type: "gasto" },
  { code: "5120", name: "Arrendamientos", type: "gasto" },
  { code: "5125", name: "Contribuciones y afiliaciones", type: "gasto" },
  { code: "5135", name: "Servicios públicos y comunicaciones", type: "gasto" },
  { code: "5140", name: "Gastos legales", type: "gasto" },
  { code: "5145", name: "Mantenimiento y reparaciones", type: "gasto" },
  { code: "5150", name: "Adecuación e instalación", type: "gasto" },
  { code: "5155", name: "Gastos de viaje", type: "gasto" },
  { code: "5160", name: "Depreciaciones", type: "gasto" },
  { code: "5195", name: "Gastos diversos", type: "gasto", system: true },
  { code: "5305", name: "Gastos financieros e intereses", type: "gasto" },
  { code: "5310", name: "Diferencia en cambio (gasto)", type: "gasto" },
  // 6 — Costos
  { code: "6135", name: "Costo de ventas", type: "costo", system: true },
  { code: "6140", name: "Fletes y gastos de importación", type: "costo" },
  { code: "6145", name: "Aranceles y tributos aduaneros", type: "costo" },
];


export async function ensureSeed() {
  const usersCount = await db.users.count();
  if (usersCount === 0) {
    await db.users.add({
      name: "Administrador",
      pin: "1234",
      role: "admin",
      active: true,
      createdAt: Date.now(),
    });
  }
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.add({
      businessName: "Mi Empresa",
      currency: "COP",
      decimals: 0,
      taxRate: 0,
      taxIncluded: true,
      receiptFooter: "¡Gracias por su compra!",
    });
  }
  // Sincroniza el PUC: agrega cuentas nuevas sin borrar las personalizadas
  const existing = await db.accounts.toArray();
  const codes = new Set(existing.map((a) => a.code));
  const missing = DEFAULT_ACCOUNTS.filter((a) => !codes.has(a.code));
  if (missing.length) await db.accounts.bulkAdd(missing as Account[]);

  if ((await db.warehouses.count()) === 0) {
    await db.warehouses.add({ name: "Bodega principal", isDefault: true, createdAt: Date.now() });
  }
}

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.toCollection().first();
  return s ?? {
    businessName: "Mi Empresa", currency: "COP", decimals: 0, taxRate: 0, taxIncluded: true,
  };
}

export async function getDefaultWarehouseId(): Promise<number> {
  const all = await db.warehouses.toArray();
  const def = all.find((w) => w.isDefault) ?? all[0];
  if (def?.id) return def.id;
  return db.warehouses.add({ name: "Bodega principal", isDefault: true, createdAt: Date.now() });
}
