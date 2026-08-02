import type { Order } from "./types.js";

export interface TopProduct {
  productId: string;
  title: string;
  units: number;
  revenue: number;
}

export interface SalesSummary {
  start: string;
  end: string;
  currency: string;
  /** Orders placed in the window, excluding cancelled ones. */
  orderCount: number;
  cancelledCount: number;
  unitsSold: number;
  /** Sum of order totals (excluding cancelled orders). */
  grossRevenue: number;
  /** Sum of amounts refunded on orders in the window. */
  refundedAmount: number;
  /** grossRevenue - refundedAmount. */
  netRevenue: number;
  /** grossRevenue / orderCount, 0 when there are no orders. */
  averageOrderValue: number;
  /** Top products by line-item revenue, best first. */
  topProducts: TopProduct[];
  /** Calendar day (UTC) with the highest gross revenue. */
  bestDay: { date: string; revenue: number } | null;
  /** True if the backend could not return the complete order window. */
  truncated: boolean;
}

export interface TopCustomer {
  customerId: string;
  name: string;
  email: string;
  /** Orders placed in the window, excluding cancelled ones. */
  orderCount: number;
  /** Sum of order totals minus refunds. */
  netSpent: number;
  /** createdAt of the customer's most recent order in the window. */
  lastOrderAt: string;
}

export interface TopCustomersSummary {
  start: string;
  end: string;
  currency: string;
  /** Customers ranked by net spend, best first. */
  customers: TopCustomer[];
  /** Non-cancelled orders with no customer attached (guest checkouts). */
  guestOrderCount: number;
  /** True if the backend could not return the complete order window. */
  truncated: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Pure aggregation over a window of orders. Cancelled orders are excluded
 * from every monetary figure and only reported as a count; refunds are
 * subtracted from gross to produce net revenue.
 */
export function computeSalesSummary(
  orders: Order[],
  window: { start: string; end: string },
  options: { topProductCount?: number; truncated?: boolean } = {},
): SalesSummary {
  const topProductCount = options.topProductCount ?? 5;
  const active = orders.filter((o) => o.cancelledAt === null);
  const cancelledCount = orders.length - active.length;

  let grossRevenue = 0;
  let refundedAmount = 0;
  let unitsSold = 0;
  const byProduct = new Map<string, TopProduct>();
  const byDay = new Map<string, number>();

  for (const order of active) {
    grossRevenue += order.total;
    refundedAmount += order.totalRefunded;

    const day = order.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + order.total);

    for (const item of order.lineItems) {
      unitsSold += item.quantity;
      const entry = byProduct.get(item.productId) ?? {
        productId: item.productId,
        title: item.title,
        units: 0,
        revenue: 0,
      };
      entry.units += item.quantity;
      entry.revenue += item.price * item.quantity;
      byProduct.set(item.productId, entry);
    }
  }

  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
    .slice(0, topProductCount)
    .map((p) => ({ ...p, revenue: round2(p.revenue) }));

  let bestDay: SalesSummary["bestDay"] = null;
  for (const [date, revenue] of byDay) {
    if (bestDay === null || revenue > bestDay.revenue) {
      bestDay = { date, revenue: round2(revenue) };
    }
  }

  return {
    start: window.start,
    end: window.end,
    currency: active[0]?.currency ?? orders[0]?.currency ?? "USD",
    orderCount: active.length,
    cancelledCount,
    unitsSold,
    grossRevenue: round2(grossRevenue),
    refundedAmount: round2(refundedAmount),
    netRevenue: round2(grossRevenue - refundedAmount),
    averageOrderValue: active.length > 0 ? round2(grossRevenue / active.length) : 0,
    topProducts,
    bestDay,
    truncated: options.truncated ?? false,
  };
}

/**
 * Ranks customers by net spend (order totals minus refunds) over a window of
 * orders. Cancelled orders are excluded entirely; guest checkouts cannot be
 * attributed to a customer and are only reported as a count.
 */
export function computeTopCustomers(
  orders: Order[],
  window: { start: string; end: string },
  options: { limit?: number; truncated?: boolean } = {},
): TopCustomersSummary {
  const limit = options.limit ?? 10;
  const active = orders.filter((o) => o.cancelledAt === null);

  let guestOrderCount = 0;
  const byCustomer = new Map<string, TopCustomer>();

  for (const order of active) {
    if (order.customer === null) {
      guestOrderCount++;
      continue;
    }
    const entry = byCustomer.get(order.customer.id) ?? {
      customerId: order.customer.id,
      name: order.customer.name,
      email: order.customer.email,
      orderCount: 0,
      netSpent: 0,
      lastOrderAt: order.createdAt,
    };
    entry.orderCount++;
    entry.netSpent += order.total - order.totalRefunded;
    if (order.createdAt > entry.lastOrderAt) entry.lastOrderAt = order.createdAt;
    byCustomer.set(order.customer.id, entry);
  }

  const customers = [...byCustomer.values()]
    .sort((a, b) => b.netSpent - a.netSpent || b.orderCount - a.orderCount)
    .slice(0, limit)
    .map((c) => ({ ...c, netSpent: round2(c.netSpent) }));

  return {
    start: window.start,
    end: window.end,
    currency: active[0]?.currency ?? orders[0]?.currency ?? "USD",
    customers,
    guestOrderCount,
    truncated: options.truncated ?? false,
  };
}
