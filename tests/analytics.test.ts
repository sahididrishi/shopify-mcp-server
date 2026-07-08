import { describe, expect, it } from "vitest";
import { computeSalesSummary } from "../src/analytics.js";
import type { Order } from "../src/types.js";

function makeOrder(overrides: Partial<Order> & { id: string }): Order {
  return {
    name: `#${overrides.id}`,
    orderNumber: Number(overrides.id),
    createdAt: "2026-06-15T10:00:00.000Z",
    cancelledAt: null,
    currency: "USD",
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    subtotal: 100,
    totalDiscounts: 0,
    totalShipping: 0,
    totalTax: 8,
    total: 108,
    totalRefunded: 0,
    customer: null,
    lineItems: [],
    fulfillments: [],
    ...overrides,
  };
}

const WINDOW = { start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" };

describe("computeSalesSummary", () => {
  it("returns zeroes for an empty window", () => {
    const summary = computeSalesSummary([], WINDOW);
    expect(summary.orderCount).toBe(0);
    expect(summary.grossRevenue).toBe(0);
    expect(summary.netRevenue).toBe(0);
    expect(summary.averageOrderValue).toBe(0);
    expect(summary.topProducts).toEqual([]);
    expect(summary.bestDay).toBeNull();
  });

  it("sums gross revenue and computes AOV over non-cancelled orders", () => {
    const orders = [
      makeOrder({ id: "1", total: 100 }),
      makeOrder({ id: "2", total: 50 }),
      makeOrder({ id: "3", total: 30.5 }),
    ];
    const summary = computeSalesSummary(orders, WINDOW);
    expect(summary.orderCount).toBe(3);
    expect(summary.grossRevenue).toBe(180.5);
    expect(summary.averageOrderValue).toBeCloseTo(60.17, 2);
  });

  it("excludes cancelled orders from revenue but counts them", () => {
    const orders = [
      makeOrder({ id: "1", total: 100 }),
      makeOrder({ id: "2", total: 999, cancelledAt: "2026-06-16T00:00:00.000Z" }),
    ];
    const summary = computeSalesSummary(orders, WINDOW);
    expect(summary.orderCount).toBe(1);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.grossRevenue).toBe(100);
    expect(summary.averageOrderValue).toBe(100);
  });

  it("subtracts refunds to produce net revenue", () => {
    const orders = [
      makeOrder({ id: "1", total: 100 }),
      makeOrder({ id: "2", total: 80, totalRefunded: 80, financialStatus: "refunded" }),
      makeOrder({ id: "3", total: 60, totalRefunded: 25.5, financialStatus: "partially_refunded" }),
    ];
    const summary = computeSalesSummary(orders, WINDOW);
    expect(summary.grossRevenue).toBe(240);
    expect(summary.refundedAmount).toBe(105.5);
    expect(summary.netRevenue).toBe(134.5);
  });

  it("counts units and ranks top products by line-item revenue", () => {
    const orders = [
      makeOrder({
        id: "1",
        lineItems: [
          { productId: "p1", variantId: "v1", title: "Leggings", variantTitle: "M", sku: "L-M", quantity: 2, price: 60 },
          { productId: "p2", variantId: "v2", title: "Cap", variantTitle: "OS", sku: "C", quantity: 1, price: 24 },
        ],
      }),
      makeOrder({
        id: "2",
        lineItems: [
          { productId: "p2", variantId: "v2", title: "Cap", variantTitle: "OS", sku: "C", quantity: 5, price: 24 },
        ],
      }),
      makeOrder({
        id: "3",
        cancelledAt: "2026-06-16T00:00:00.000Z",
        lineItems: [
          { productId: "p3", variantId: "v3", title: "Ghost", variantTitle: "OS", sku: "G", quantity: 99, price: 10 },
        ],
      }),
    ];
    const summary = computeSalesSummary(orders, WINDOW);
    expect(summary.unitsSold).toBe(8); // cancelled order's 99 units excluded
    expect(summary.topProducts).toHaveLength(2);
    expect(summary.topProducts[0]).toMatchObject({ productId: "p2", units: 6, revenue: 144 });
    expect(summary.topProducts[1]).toMatchObject({ productId: "p1", units: 2, revenue: 120 });
  });

  it("limits top products and identifies the best day", () => {
    const orders = [
      makeOrder({ id: "1", createdAt: "2026-06-10T09:00:00.000Z", total: 40 }),
      makeOrder({ id: "2", createdAt: "2026-06-10T18:00:00.000Z", total: 40 }),
      makeOrder({ id: "3", createdAt: "2026-06-11T12:00:00.000Z", total: 75 }),
    ];
    const summary = computeSalesSummary(orders, WINDOW, { topProductCount: 1 });
    expect(summary.bestDay).toEqual({ date: "2026-06-10", revenue: 80 });
  });

  it("propagates the truncated flag", () => {
    expect(computeSalesSummary([], WINDOW, { truncated: true }).truncated).toBe(true);
    expect(computeSalesSummary([], WINDOW).truncated).toBe(false);
  });
});
