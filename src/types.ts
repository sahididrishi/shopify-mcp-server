/**
 * Domain model shared by every backend.
 *
 * The Shopify Admin REST API and the bundled demo fixtures are both mapped
 * into these types, so tool handlers never need to know which backend is
 * serving a request.
 */

export type FinancialStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "partially_paid"
  | "partially_refunded"
  | "refunded"
  | "voided";

export type FulfillmentStatus = "unfulfilled" | "partial" | "fulfilled";

/** Matches Shopify's `status` query parameter for the orders endpoint. */
export type OrderStatusFilter = "any" | "open" | "closed" | "cancelled";

export interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  inventoryQuantity: number;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string;
  productType: string;
  vendor: string;
  status: "active" | "archived" | "draft";
  tags: string[];
  createdAt: string;
  variants: ProductVariant[];
}

export interface LineItem {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  /** Unit price at the time of purchase. */
  price: number;
}

export interface Fulfillment {
  status: string;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
}

export interface OrderCustomerRef {
  id: string;
  name: string;
  email: string;
}

export interface Order {
  id: string;
  /** Human-facing order name, e.g. "#1042". */
  name: string;
  orderNumber: number;
  createdAt: string;
  cancelledAt: string | null;
  currency: string;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  subtotal: number;
  totalDiscounts: number;
  totalShipping: number;
  totalTax: number;
  total: number;
  /** Amount refunded so far (0 for most orders). */
  totalRefunded: number;
  customer: OrderCustomerRef | null;
  lineItems: LineItem[];
  fulfillments: Fulfillment[];
}

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  ordersCount: number;
  totalSpent: number;
  currency: string;
  tags: string[];
  city: string | null;
  country: string | null;
}

export interface CustomerProfile {
  customer: Customer;
  /** Most recent orders, newest first. */
  recentOrders: Order[];
}

export interface InventoryUpdateResult {
  variantId: string;
  sku: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  previousQuantity: number | null;
  newQuantity: number;
}

export interface ListOrdersOptions {
  status?: OrderStatusFilter;
  /** ISO 8601 lower bound on createdAt (inclusive). */
  createdAtMin?: string;
  /** ISO 8601 upper bound on createdAt (inclusive). */
  createdAtMax?: string;
  limit: number;
}

export interface OrdersWindow {
  orders: Order[];
  /**
   * True when the backend hit its pagination cap and the window may be
   * incomplete. Surfaced in sales_summary output so numbers are never
   * silently wrong.
   */
  truncated: boolean;
}
