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

export interface Customer {
  id?: number;
  name: string;
  doc?: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: number;
}

export interface SaleItem {
  productId: number;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  comboId?: number;
  components?: { productId: number; qty: number }[];
}

export type PaymentMethod = "cash" | "card" | "transfer" | "credit" | "other";

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

export interface ComboItem {
  productId: number;
  qty: number;
}

export interface Combo {
  id?: number;
  name: string;
  price: number;          // precio del combo (fijo)
  items: ComboItem[];     // productos incluidos
  image?: string;         // dataURL
  color?: string;
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
  combos!: Table<Combo, number>;

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
      combos: "++id, name, active",
    });
  }
}

export const db = new POSDB();

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
      businessName: "Mi Negocio",
      currency: "COP",
      decimals: 0,
      taxRate: 0,
      taxIncluded: true,
      receiptFooter: "¡Gracias por su compra!",
    });
  }
  const catCount = await db.categories.count();
  if (catCount === 0) {
    // El administrador debe crear las categorías iniciales.
  }
}

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.toCollection().first();
  return s ?? {
    businessName: "Mi Negocio", currency: "COP", decimals: 0, taxRate: 0, taxIncluded: true,
  };
}