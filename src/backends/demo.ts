import { readFileSync } from "node:fs";
import { BackendError, type StoreBackend } from "../backend.js";
import type {
  Customer,
  CustomerProfile,
  InventoryUpdateResult,
  ListOrdersOptions,
  Order,
  OrdersWindow,
  Product,
} from "../types.js";

/**
 * The instant the fixtures were generated for. At load time every fixture
 * date is shifted forward by (referenceDate - FIXTURE_BASE_DATE), so the
 * demo store always looks like it traded over the last ~90 days no matter
 * when the server is run. Tests pin referenceDate to this constant to get
 * byte-for-byte deterministic data.
 */
export const FIXTURE_BASE_DATE = "2026-07-08T12:00:00.000Z";

export const DEMO_STORE_NAME = "Aurora Athletics (demo)";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

function matchesQuery(product: Product, terms: string[]): boolean {
  const haystack = [
    product.title,
    product.handle,
    product.productType,
    product.vendor,
    product.description,
    ...product.tags,
    ...product.variants.map((v) => v.sku),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Demo "closed" heuristic: delivered and settled orders count as archived. */
function isClosed(order: Order): boolean {
  return (
    order.cancelledAt === null &&
    order.fulfillmentStatus === "fulfilled" &&
    (order.financialStatus === "paid" || order.financialStatus === "refunded")
  );
}

/**
 * In-memory backend serving the bundled "Aurora Athletics" fixture store.
 * Active whenever Shopify credentials are not configured, and used by the
 * unit tests. Inventory writes mutate process memory only.
 */
export class DemoBackend implements StoreBackend {
  readonly label = DEMO_STORE_NAME;

  private readonly products: Product[];
  private readonly orders: Order[];
  private readonly customers: Customer[];

  constructor(options: { referenceDate?: Date } = {}) {
    const reference = options.referenceDate ?? new Date();
    const delta = reference.getTime() - new Date(FIXTURE_BASE_DATE).getTime();

    this.products = loadFixture<Product[]>("products.json").map((p) => ({
      ...p,
      createdAt: shiftIso(p.createdAt, delta),
      variants: p.variants.map((v) => ({ ...v })),
    }));

    this.orders = loadFixture<Order[]>("orders.json").map((o) => ({
      ...o,
      createdAt: shiftIso(o.createdAt, delta),
      cancelledAt: o.cancelledAt !== null ? shiftIso(o.cancelledAt, delta) : null,
      lineItems: o.lineItems.map((li) => ({ ...li })),
      fulfillments: o.fulfillments.map((f) => ({
        ...f,
        createdAt: shiftIso(f.createdAt, delta),
      })),
    }));

    this.customers = loadFixture<Customer[]>("customers.json").map((c) => ({
      ...c,
      createdAt: shiftIso(c.createdAt, delta),
    }));
  }

  async getStoreCurrency(): Promise<string> {
    return "USD";
  }

  async searchProducts(query: string, limit: number): Promise<Product[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return this.products.slice(0, limit);
    }
    const titleMatches: Product[] = [];
    const otherMatches: Product[] = [];
    for (const product of this.products) {
      if (!matchesQuery(product, terms)) continue;
      const inTitle = terms.every((t) => product.title.toLowerCase().includes(t));
      (inTitle ? titleMatches : otherMatches).push(product);
    }
    return [...titleMatches, ...otherMatches].slice(0, limit);
  }

  async getProduct(ref: { id?: string; handle?: string }): Promise<Product | null> {
    if (ref.id !== undefined) {
      return this.products.find((p) => p.id === ref.id) ?? null;
    }
    if (ref.handle !== undefined) {
      const handle = ref.handle.toLowerCase();
      return this.products.find((p) => p.handle === handle) ?? null;
    }
    return null;
  }

  async listOrders(options: ListOrdersOptions): Promise<Order[]> {
    const status = options.status ?? "any";
    let result = this.orders.filter((order) => {
      if (status === "cancelled") return order.cancelledAt !== null;
      if (status === "closed") return isClosed(order);
      if (status === "open") return order.cancelledAt === null && !isClosed(order);
      return true;
    });
    if (options.createdAtMin !== undefined) {
      const min = new Date(options.createdAtMin).getTime();
      result = result.filter((o) => new Date(o.createdAt).getTime() >= min);
    }
    if (options.createdAtMax !== undefined) {
      const max = new Date(options.createdAtMax).getTime();
      result = result.filter((o) => new Date(o.createdAt).getTime() <= max);
    }
    return result
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit);
  }

  async getOrder(ref: { id?: string; orderNumber?: string }): Promise<Order | null> {
    if (ref.id !== undefined) {
      return this.orders.find((o) => o.id === ref.id) ?? null;
    }
    if (ref.orderNumber !== undefined) {
      const wanted = ref.orderNumber.replace(/^#/, "");
      return this.orders.find((o) => String(o.orderNumber) === wanted) ?? null;
    }
    return null;
  }

  async getCustomer(ref: { id?: string; email?: string }): Promise<CustomerProfile | null> {
    let customer: Customer | undefined;
    if (ref.id !== undefined) {
      customer = this.customers.find((c) => c.id === ref.id);
    } else if (ref.email !== undefined) {
      const email = ref.email.toLowerCase();
      customer = this.customers.find((c) => c.email.toLowerCase() === email);
    }
    if (customer === undefined) return null;

    const recentOrders = this.orders
      .filter((o) => o.customer?.id === customer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
    return { customer, recentOrders };
  }

  async setInventory(variantId: string, quantity: number): Promise<InventoryUpdateResult> {
    for (const product of this.products) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant !== undefined) {
        const previous = variant.inventoryQuantity;
        variant.inventoryQuantity = quantity;
        return {
          variantId,
          sku: variant.sku,
          productTitle: product.title,
          variantTitle: variant.title,
          previousQuantity: previous,
          newQuantity: quantity,
        };
      }
    }
    throw new BackendError(
      `No variant with id ${variantId} exists in the demo store. ` +
        `Use get_product to look up valid variant ids.`,
    );
  }

  async ordersBetween(startIso: string, endIso: string): Promise<OrdersWindow> {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const orders = this.orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start && t <= end;
    });
    return { orders, truncated: false };
  }
}
