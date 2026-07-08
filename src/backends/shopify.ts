import { BackendError, type StoreBackend } from "../backend.js";
import type {
  Customer,
  CustomerProfile,
  FinancialStatus,
  FulfillmentStatus,
  InventoryUpdateResult,
  ListOrdersOptions,
  Order,
  OrdersWindow,
  Product,
} from "../types.js";

export interface ShopifyConfig {
  /** e.g. "aurora-athletics.myshopify.com" */
  storeDomain: string;
  /** Admin API access token from a custom app ("shpat_..."). */
  accessToken: string;
  /** Admin API version, e.g. "2026-04". */
  apiVersion: string;
}

export const DEFAULT_API_VERSION = "2026-04";

/** Requests per call to list endpoints (Shopify's maximum). */
const PAGE_SIZE = 250;
/** Hard cap on pages fetched for analytics windows (5 x 250 = 1250 orders). */
const MAX_ANALYTICS_PAGES = 5;
const MAX_RETRIES = 4;

// ---------------------------------------------------------------------------
// Raw Admin REST API payload shapes (only the fields this server reads).
// ---------------------------------------------------------------------------

interface RestVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
  inventory_item_id: number;
}

interface RestProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  product_type: string;
  vendor: string;
  status: "active" | "archived" | "draft";
  tags: string;
  created_at: string;
  variants: RestVariant[];
}

interface RestLineItem {
  product_id: number | null;
  variant_id: number | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
}

interface RestFulfillment {
  status: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
}

interface RestRefundTransaction {
  kind: string;
  status: string;
  amount: string;
}

interface RestOrder {
  id: number;
  name: string;
  order_number: number;
  created_at: string;
  cancelled_at: string | null;
  currency: string;
  financial_status: FinancialStatus | null;
  fulfillment_status: "fulfilled" | "partial" | "restocked" | null;
  subtotal_price: string;
  total_discounts: string;
  total_shipping_price_set?: { shop_money: { amount: string } };
  total_tax: string;
  total_price: string;
  customer: {
    id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  line_items: RestLineItem[];
  fulfillments: RestFulfillment[];
  refunds?: { transactions: RestRefundTransaction[] }[];
}

interface RestCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  orders_count: number;
  total_spent: string;
  currency: string;
  tags: string;
  default_address?: { city: string | null; country: string | null } | null;
}

// ---------------------------------------------------------------------------
// Mapping into the shared domain model
// ---------------------------------------------------------------------------

const num = (value: string | null | undefined): number =>
  value === null || value === undefined ? 0 : Number.parseFloat(value) || 0;

const stripHtml = (html: string | null): string =>
  (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function mapProduct(p: RestProduct): Product {
  return {
    id: String(p.id),
    title: p.title,
    handle: p.handle,
    description: stripHtml(p.body_html),
    productType: p.product_type,
    vendor: p.vendor,
    status: p.status,
    tags: p.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    createdAt: p.created_at,
    variants: p.variants.map((v) => ({
      id: String(v.id),
      title: v.title,
      sku: v.sku ?? "",
      price: num(v.price),
      compareAtPrice: v.compare_at_price !== null ? num(v.compare_at_price) : null,
      inventoryQuantity: v.inventory_quantity,
    })),
  };
}

function totalRefunded(o: RestOrder): number {
  let sum = 0;
  for (const refund of o.refunds ?? []) {
    for (const tx of refund.transactions) {
      if (tx.kind === "refund" && tx.status === "success") sum += num(tx.amount);
    }
  }
  return Math.round(sum * 100) / 100;
}

function mapFulfillmentStatus(s: RestOrder["fulfillment_status"]): FulfillmentStatus {
  if (s === "fulfilled") return "fulfilled";
  if (s === "partial") return "partial";
  return "unfulfilled";
}

function mapOrder(o: RestOrder): Order {
  return {
    id: String(o.id),
    name: o.name,
    orderNumber: o.order_number,
    createdAt: o.created_at,
    cancelledAt: o.cancelled_at,
    currency: o.currency,
    financialStatus: o.financial_status ?? "pending",
    fulfillmentStatus: mapFulfillmentStatus(o.fulfillment_status),
    subtotal: num(o.subtotal_price),
    totalDiscounts: num(o.total_discounts),
    totalShipping: num(o.total_shipping_price_set?.shop_money.amount),
    totalTax: num(o.total_tax),
    total: num(o.total_price),
    totalRefunded: totalRefunded(o),
    customer: o.customer
      ? {
          id: String(o.customer.id),
          name:
            [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ") ||
            "Unknown",
          email: o.customer.email ?? "",
        }
      : null,
    lineItems: o.line_items.map((li) => ({
      productId: li.product_id !== null ? String(li.product_id) : "",
      variantId: li.variant_id !== null ? String(li.variant_id) : "",
      title: li.title,
      variantTitle: li.variant_title ?? "Default",
      sku: li.sku ?? "",
      quantity: li.quantity,
      price: num(li.price),
    })),
    fulfillments: o.fulfillments.map((f) => ({
      status: f.status,
      trackingCompany: f.tracking_company,
      trackingNumber: f.tracking_number,
      trackingUrl: f.tracking_url,
      createdAt: f.created_at,
    })),
  };
}

function mapCustomer(c: RestCustomer): Customer {
  return {
    id: String(c.id),
    email: c.email ?? "",
    firstName: c.first_name ?? "",
    lastName: c.last_name ?? "",
    createdAt: c.created_at,
    ordersCount: c.orders_count,
    totalSpent: num(c.total_spent),
    currency: c.currency,
    tags: c.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    city: c.default_address?.city ?? null,
    country: c.default_address?.country ?? null,
  };
}

// ---------------------------------------------------------------------------
// HTTP client with rate-limit handling
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

interface ApiResponse<T> {
  data: T;
  /** Cursor for the next page, parsed from the Link header (if any). */
  nextPageInfo: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (linkHeader === null) return null;
  // Link: <https://shop.myshopify.com/admin/api/.../orders.json?page_info=XYZ&limit=250>; rel="next"
  for (const part of linkHeader.split(",")) {
    if (!part.includes('rel="next"')) continue;
    const match = part.match(/<([^>]+)>/);
    if (match) {
      return new URL(match[1]).searchParams.get("page_info");
    }
  }
  return null;
}

class ShopifyClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ShopifyConfig) {
    const domain = config.storeDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.baseUrl = `https://${domain}/admin/api/${config.apiVersion}`;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let lastError = "request failed";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "X-Shopify-Access-Token": this.config.accessToken,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch (error) {
        // DNS failure, connection reset, etc. Retry with backoff.
        lastError = `network error reaching ${url.hostname}: ${(error as Error).message}`;
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (response.status === 429) {
        // Admin REST rate limit. Honour Retry-After when present.
        const retryAfter = Number.parseFloat(response.headers.get("Retry-After") ?? "");
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 500 * 2 ** attempt;
        lastError = "rate limited (HTTP 429)";
        await sleep(waitMs);
        continue;
      }

      if (response.status >= 500) {
        lastError = `Shopify returned HTTP ${response.status}`;
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        throw new BackendError(await describeHttpError(response));
      }

      return {
        data: (await response.json()) as T,
        nextPageInfo: parseNextPageInfo(response.headers.get("Link")),
      };
    }

    throw new BackendError(
      `Shopify API request to ${path} failed after ${MAX_RETRIES} attempts: ${lastError}.`,
    );
  }
}

async function describeHttpError(response: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await response.json()) as { errors?: unknown; error?: unknown };
    const errors = body.errors ?? body.error;
    if (errors !== undefined) detail = ` - ${JSON.stringify(errors)}`;
  } catch {
    // Non-JSON error body; the status line is enough.
  }
  switch (response.status) {
    case 401:
      return `Shopify rejected the access token (HTTP 401)${detail}. Check SHOPIFY_ACCESS_TOKEN.`;
    case 403:
      return `Access denied (HTTP 403)${detail}. The custom app is missing a required Admin API scope for this operation.`;
    case 404:
      return `Shopify returned HTTP 404${detail}. Check SHOPIFY_STORE_DOMAIN and the requested id.`;
    default:
      return `Shopify API error (HTTP ${response.status})${detail}.`;
  }
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export class ShopifyBackend implements StoreBackend {
  readonly label: string;

  private readonly client: ShopifyClient;
  private currency: string | null = null;

  constructor(private readonly config: ShopifyConfig) {
    this.label = config.storeDomain;
    this.client = new ShopifyClient(config);
  }

  async getStoreCurrency(): Promise<string> {
    if (this.currency === null) {
      const { data } = await this.client.request<{ shop: { currency: string } }>(
        "shop.json",
      );
      this.currency = data.shop.currency;
    }
    return this.currency;
  }

  async searchProducts(query: string, limit: number): Promise<Product[]> {
    // The Admin REST API has no fuzzy product search endpoint, so we pull the
    // most recently updated page of products (250, Shopify's max) and match
    // locally across title, handle, type, vendor, tags and SKUs. For stores
    // with more than 250 products, an exact `title` lookup is merged in so
    // direct title queries still hit beyond the first page.
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const [page, byTitle] = await Promise.all([
      this.client.request<{ products: RestProduct[] }>("products.json", {
        query: { limit: PAGE_SIZE, order: "updated_at desc" },
      }),
      this.client.request<{ products: RestProduct[] }>("products.json", {
        query: { title: query, limit },
      }),
    ]);

    const seen = new Set<number>();
    const results: Product[] = [];
    const consider = (raw: RestProduct, matchAll: boolean) => {
      if (seen.has(raw.id)) return;
      const product = mapProduct(raw);
      const haystack = [
        product.title,
        product.handle,
        product.productType,
        product.vendor,
        ...product.tags,
        ...product.variants.map((v) => v.sku),
      ]
        .join(" ")
        .toLowerCase();
      if (!matchAll || terms.every((t) => haystack.includes(t))) {
        seen.add(raw.id);
        results.push(product);
      }
    };

    for (const raw of byTitle.data.products) consider(raw, false);
    for (const raw of page.data.products) consider(raw, true);
    return results.slice(0, limit);
  }

  async getProduct(ref: { id?: string; handle?: string }): Promise<Product | null> {
    if (ref.id !== undefined) {
      try {
        const { data } = await this.client.request<{ product: RestProduct }>(
          `products/${encodeURIComponent(ref.id)}.json`,
        );
        return mapProduct(data.product);
      } catch (error) {
        if (error instanceof BackendError && error.message.includes("404")) return null;
        throw error;
      }
    }
    if (ref.handle !== undefined) {
      const { data } = await this.client.request<{ products: RestProduct[] }>(
        "products.json",
        { query: { handle: ref.handle, limit: 1 } },
      );
      return data.products.length > 0 ? mapProduct(data.products[0]) : null;
    }
    return null;
  }

  async listOrders(options: ListOrdersOptions): Promise<Order[]> {
    const { data } = await this.client.request<{ orders: RestOrder[] }>("orders.json", {
      query: {
        status: options.status ?? "any",
        created_at_min: options.createdAtMin,
        created_at_max: options.createdAtMax,
        limit: Math.min(options.limit, PAGE_SIZE),
        order: "created_at desc",
      },
    });
    return data.orders.map(mapOrder);
  }

  async getOrder(ref: { id?: string; orderNumber?: string }): Promise<Order | null> {
    if (ref.id !== undefined) {
      try {
        const { data } = await this.client.request<{ order: RestOrder }>(
          `orders/${encodeURIComponent(ref.id)}.json`,
        );
        return mapOrder(data.order);
      } catch (error) {
        if (error instanceof BackendError && error.message.includes("404")) return null;
        throw error;
      }
    }
    if (ref.orderNumber !== undefined) {
      // Orders are addressable by display name; "name" matching needs the
      // leading "#" that Shopify adds to order numbers by default.
      const name = ref.orderNumber.startsWith("#") ? ref.orderNumber : `#${ref.orderNumber}`;
      const { data } = await this.client.request<{ orders: RestOrder[] }>("orders.json", {
        query: { name, status: "any", limit: 1 },
      });
      return data.orders.length > 0 ? mapOrder(data.orders[0]) : null;
    }
    return null;
  }

  async getCustomer(ref: { id?: string; email?: string }): Promise<CustomerProfile | null> {
    let raw: RestCustomer | null = null;

    if (ref.id !== undefined) {
      try {
        const { data } = await this.client.request<{ customer: RestCustomer }>(
          `customers/${encodeURIComponent(ref.id)}.json`,
        );
        raw = data.customer;
      } catch (error) {
        if (error instanceof BackendError && error.message.includes("404")) return null;
        throw error;
      }
    } else if (ref.email !== undefined) {
      const { data } = await this.client.request<{ customers: RestCustomer[] }>(
        "customers/search.json",
        { query: { query: `email:${ref.email}`, limit: 1 } },
      );
      raw = data.customers[0] ?? null;
    }
    if (raw === null) return null;

    const { data: orderData } = await this.client.request<{ orders: RestOrder[] }>(
      `customers/${raw.id}/orders.json`,
      { query: { status: "any", limit: 10 } },
    );
    const recentOrders = orderData.orders
      .map(mapOrder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { customer: mapCustomer(raw), recentOrders };
  }

  async setInventory(variantId: string, quantity: number): Promise<InventoryUpdateResult> {
    // Inventory in Shopify hangs off inventory items and locations, not
    // variants directly: variant -> inventory_item_id -> level at a location.
    let variant: RestVariant;
    try {
      const { data } = await this.client.request<{ variant: RestVariant }>(
        `variants/${encodeURIComponent(variantId)}.json`,
      );
      variant = data.variant;
    } catch (error) {
      if (error instanceof BackendError && error.message.includes("404")) {
        throw new BackendError(
          `No variant with id ${variantId} exists. Use get_product to look up valid variant ids.`,
        );
      }
      throw error;
    }

    const { data: levelData } = await this.client.request<{
      inventory_levels: { location_id: number; available: number | null }[];
    }>("inventory_levels.json", {
      query: { inventory_item_ids: variant.inventory_item_id },
    });
    const level = levelData.inventory_levels[0];
    if (level === undefined) {
      throw new BackendError(
        `Variant ${variantId} is not stocked at any location, so its inventory cannot be set. ` +
          `Enable inventory tracking for it in the Shopify admin first.`,
      );
    }

    await this.client.request("inventory_levels/set.json", {
      method: "POST",
      body: {
        location_id: level.location_id,
        inventory_item_id: variant.inventory_item_id,
        available: quantity,
      },
    });

    let productTitle: string | null = null;
    try {
      const { data } = await this.client.request<{ product: { title: string } }>(
        `products/${variant.product_id}.json`,
        { query: { fields: "title" } },
      );
      productTitle = data.product.title;
    } catch {
      // Cosmetic only; the write already succeeded.
    }

    return {
      variantId,
      sku: variant.sku,
      productTitle,
      variantTitle: variant.title,
      previousQuantity: level.available,
      newQuantity: quantity,
    };
  }

  async ordersBetween(startIso: string, endIso: string): Promise<OrdersWindow> {
    const orders: Order[] = [];
    let pageInfo: string | null = null;
    let truncated = false;

    for (let page = 0; page < MAX_ANALYTICS_PAGES; page++) {
      // After the first page, Shopify's cursor pagination forbids repeating
      // filter params - only page_info and limit may be sent.
      const query: Record<string, string | number | undefined> =
        pageInfo === null
          ? {
              status: "any",
              created_at_min: startIso,
              created_at_max: endIso,
              limit: PAGE_SIZE,
            }
          : { page_info: pageInfo, limit: PAGE_SIZE };

      const { data, nextPageInfo } = await this.client.request<{ orders: RestOrder[] }>(
        "orders.json",
        { query },
      );
      orders.push(...data.orders.map(mapOrder));

      if (nextPageInfo === null) break;
      pageInfo = nextPageInfo;
      if (page === MAX_ANALYTICS_PAGES - 1) truncated = true;
    }

    return { orders, truncated };
  }
}
