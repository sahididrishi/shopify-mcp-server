import { beforeEach, describe, expect, it } from "vitest";
import { BackendError } from "../src/backend.js";
import { DemoBackend, FIXTURE_BASE_DATE } from "../src/backends/demo.js";

/** Pin the reference date so fixture dates are not rebased and stay exact. */
const backend = () => new DemoBackend({ referenceDate: new Date(FIXTURE_BASE_DATE) });

describe("DemoBackend", () => {
  let demo: DemoBackend;
  beforeEach(() => {
    demo = backend();
  });

  describe("searchProducts", () => {
    it("matches on title words, case-insensitively", async () => {
      const results = await demo.searchProducts("seamless LEGGINGS", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe("Summit Seamless Leggings");
    });

    it("matches on tags and product type", async () => {
      const results = await demo.searchProducts("yoga", 10);
      const titles = results.map((r) => r.title);
      expect(titles).toContain("Eclipse Yoga Mat");
      expect(titles).toContain("Flow Strappy Bra"); // tagged "yoga"
    });

    it("requires all terms to match and respects the limit", async () => {
      expect(await demo.searchProducts("leggings zebra", 10)).toEqual([]);
      expect(await demo.searchProducts("aurora", 3)).toHaveLength(3);
    });
  });

  describe("getProduct", () => {
    it("finds a product by id and by handle", async () => {
      const byId = await demo.getProduct({ id: "8001" });
      const byHandle = await demo.getProduct({ handle: "summit-seamless-leggings" });
      expect(byId?.title).toBe("Summit Seamless Leggings");
      expect(byHandle?.id).toBe("8001");
      expect(byId?.variants).toHaveLength(5);
    });

    it("returns null for unknown references", async () => {
      expect(await demo.getProduct({ id: "999999" })).toBeNull();
      expect(await demo.getProduct({ handle: "does-not-exist" })).toBeNull();
    });
  });

  describe("listOrders", () => {
    it("returns newest first and respects the limit", async () => {
      const orders = await demo.listOrders({ limit: 5 });
      expect(orders).toHaveLength(5);
      const times = orders.map((o) => new Date(o.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(orders[0].name).toBe("#1060");
    });

    it("filters cancelled orders", async () => {
      const cancelled = await demo.listOrders({ status: "cancelled", limit: 100 });
      expect(cancelled).toHaveLength(3);
      expect(cancelled.every((o) => o.cancelledAt !== null)).toBe(true);
    });

    it("splits open vs closed without overlap", async () => {
      const open = await demo.listOrders({ status: "open", limit: 100 });
      const closed = await demo.listOrders({ status: "closed", limit: 100 });
      const cancelled = await demo.listOrders({ status: "cancelled", limit: 100 });
      expect(open.length + closed.length + cancelled.length).toBe(60);
      expect(open.every((o) => o.cancelledAt === null)).toBe(true);
      expect(
        closed.every(
          (o) =>
            o.fulfillmentStatus === "fulfilled" &&
            (o.financialStatus === "paid" || o.financialStatus === "refunded"),
        ),
      ).toBe(true);
    });

    it("applies a creation date range", async () => {
      const orders = await demo.listOrders({
        createdAtMin: "2026-06-08T00:00:00.000Z",
        createdAtMax: "2026-07-08T23:59:59.999Z",
        limit: 100,
      });
      expect(orders).toHaveLength(20);
      for (const order of orders) {
        expect(new Date(order.createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date("2026-06-08T00:00:00.000Z").getTime(),
        );
      }
    });
  });

  describe("getOrder", () => {
    it("finds an order by id and by order number, with and without '#'", async () => {
      const byId = await demo.getOrder({ id: "450060" });
      expect(byId?.name).toBe("#1060");
      expect((await demo.getOrder({ orderNumber: "1060" }))?.id).toBe("450060");
      expect((await demo.getOrder({ orderNumber: "#1060" }))?.id).toBe("450060");
    });

    it("includes line items and fulfillment tracking", async () => {
      const order = await demo.getOrder({ orderNumber: "1001" });
      expect(order).not.toBeNull();
      expect(order!.lineItems.length).toBeGreaterThan(0);
      expect(order!.fulfillments[0].trackingNumber).toBeTruthy();
      expect(order!.fulfillments[0].trackingCompany).toBeTruthy();
    });

    it("returns null for unknown orders", async () => {
      expect(await demo.getOrder({ orderNumber: "9999" })).toBeNull();
    });
  });

  describe("getCustomer", () => {
    it("finds a customer by email (case-insensitive) and by id", async () => {
      const byEmail = await demo.getCustomer({ email: "LIAM.CARTER@example.com" });
      expect(byEmail?.customer.id).toBe("6002");
      const byId = await demo.getCustomer({ id: "6002" });
      expect(byId?.customer.email).toBe("liam.carter@example.com");
    });

    it("summarises lifetime stats consistently with order history", async () => {
      const profile = await demo.getCustomer({ id: "6002" });
      expect(profile).not.toBeNull();
      const { customer, recentOrders } = profile!;
      expect(customer.ordersCount).toBe(3);
      expect(recentOrders).toHaveLength(3);
      const expectedSpend = recentOrders
        .filter((o) => o.cancelledAt === null)
        .reduce((sum, o) => sum + o.total - o.totalRefunded, 0);
      expect(customer.totalSpent).toBeCloseTo(expectedSpend, 2);
    });

    it("returns null for unknown customers", async () => {
      expect(await demo.getCustomer({ email: "nobody@example.com" })).toBeNull();
    });
  });

  describe("setInventory", () => {
    it("updates the quantity and reports the previous value", async () => {
      const result = await demo.setInventory("90003", 55);
      expect(result).toMatchObject({
        variantId: "90003",
        productTitle: "Summit Seamless Leggings",
        variantTitle: "M",
        previousQuantity: 3,
        newQuantity: 55,
      });
      const product = await demo.getProduct({ id: "8001" });
      expect(product!.variants.find((v) => v.id === "90003")!.inventoryQuantity).toBe(55);
    });

    it("throws a BackendError for unknown variants", async () => {
      await expect(demo.setInventory("nope", 1)).rejects.toBeInstanceOf(BackendError);
    });
  });

  describe("ordersBetween", () => {
    it("returns exactly the orders inside the window", async () => {
      const { orders, truncated } = await demo.ordersBetween(
        "2026-06-08T12:00:00.000Z",
        "2026-07-08T12:00:00.000Z",
      );
      expect(orders).toHaveLength(20);
      expect(truncated).toBe(false);
    });
  });

  describe("date rebasing", () => {
    it("shifts fixture dates so the store is always freshly active", async () => {
      const now = new Date();
      const fresh = new DemoBackend({ referenceDate: now });
      const [latest] = await fresh.listOrders({ limit: 1 });
      const ageDays = (now.getTime() - new Date(latest.createdAt).getTime()) / 86_400_000;
      expect(ageDays).toBeGreaterThan(0);
      expect(ageDays).toBeLessThan(3);
    });
  });
});
