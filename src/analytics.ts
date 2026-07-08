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
