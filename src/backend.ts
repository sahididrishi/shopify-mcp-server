import type {
  CustomerProfile,
  InventoryUpdateResult,
  ListOrdersOptions,
  Order,
  OrdersWindow,
  Product,
} from "./types.js";

/**
 * Error type whose message is safe to surface directly to the model as an
 * MCP tool error. Backends throw this for expected failure modes (bad input,
 * missing records, Shopify API errors); anything else is reported generically.
 */
export class BackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

/**
 * The single interface every tool handler is written against.
 * Implemented by ShopifyBackend (live Admin REST API) and DemoBackend
 * (bundled fixture store).
 */
export interface StoreBackend {
  /** Short label shown in tool output, e.g. "demo" or the store domain. */
  readonly label: string;

  /** ISO 4217 currency code the store trades in (cached after first call). */
  getStoreCurrency(): Promise<string>;

  /** Case-insensitive product search across title, handle, type, vendor and tags. */
  searchProducts(query: string, limit: number): Promise<Product[]>;

  /** Look up one product by numeric id or URL handle. Returns null if absent. */
  getProduct(ref: { id?: string; handle?: string }): Promise<Product | null>;

  listOrders(options: ListOrdersOptions): Promise<Order[]>;

  /** Look up one order by id or by order number (e.g. 1042 or "#1042"). */
  getOrder(ref: { id?: string; orderNumber?: string }): Promise<Order | null>;

  /** Look up a customer by id or email, with their recent order history. */
  getCustomer(ref: { id?: string; email?: string }): Promise<CustomerProfile | null>;

  /** Set the available inventory quantity for a variant. Write operation. */
  setInventory(variantId: string, quantity: number): Promise<InventoryUpdateResult>;

  /** All orders created inside [start, end], for analytics. */
  ordersBetween(startIso: string, endIso: string): Promise<OrdersWindow>;
}
