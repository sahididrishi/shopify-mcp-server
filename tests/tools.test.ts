/**
 * End-to-end tool tests: a real MCP client talks to the real server over an
 * in-memory transport, backed by the demo store. No network, no processes.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { DemoBackend, FIXTURE_BASE_DATE } from "../src/backends/demo.js";
import { createServer } from "../src/server.js";

let client: Client;

async function callTool(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { text: content.map((c) => c.text).join("\n"), isError: result.isError === true };
}

beforeAll(async () => {
  const backend = new DemoBackend({ referenceDate: new Date(FIXTURE_BASE_DATE) });
  const server = createServer(backend);
  client = new Client({ name: "vitest", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

describe("tool registration", () => {
  it("exposes all seven tools with schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_customer",
      "get_order",
      "get_product",
      "list_orders",
      "sales_summary",
      "search_products",
      "update_inventory",
    ]);
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("search_products", () => {
  it("returns matching products with ids and prices", async () => {
    const { text, isError } = await callTool("search_products", { query: "leggings" });
    expect(isError).toBe(false);
    expect(text).toContain("Summit Seamless Leggings");
    expect(text).toContain("id 8001");
    expect(text).toContain("$");
  });

  it("handles zero matches gracefully", async () => {
    const { text, isError } = await callTool("search_products", { query: "snowboard" });
    expect(isError).toBe(false);
    expect(text).toContain("No products matched");
  });
});

describe("get_product", () => {
  it("renders full details with a variant table", async () => {
    const { text } = await callTool("get_product", { handle: "summit-seamless-leggings" });
    expect(text).toContain("# Summit Seamless Leggings");
    expect(text).toContain("| XS |");
    expect(text).toContain("90001");
    expect(text).toContain("$68.00");
  });

  it("errors when neither id nor handle is given", async () => {
    const { isError, text } = await callTool("get_product", {});
    expect(isError).toBe(true);
    expect(text).toContain("Provide either");
  });

  it("errors for an unknown product", async () => {
    const { isError } = await callTool("get_product", { id: "424242" });
    expect(isError).toBe(true);
  });
});

describe("list_orders", () => {
  it("lists recent orders newest first", async () => {
    const { text } = await callTool("list_orders", { limit: 5 });
    expect(text).toContain("5 order(s)");
    expect(text.indexOf("#1060")).toBeLessThan(text.indexOf("#1056"));
  });

  it("filters by status and date range", async () => {
    const { text } = await callTool("list_orders", {
      status: "cancelled",
      created_after: "2026-04-01",
      created_before: "2026-07-08",
      limit: 100,
    });
    expect(text).toContain("3 order(s)");
    expect(text).toContain("cancelled");
  });
});

describe("get_order", () => {
  it("includes line items, totals and tracking", async () => {
    const { text } = await callTool("get_order", { order_number: "#1001" });
    expect(text).toContain("# Order #1001");
    expect(text).toContain("## Line items");
    expect(text).toContain("## Totals");
    expect(text).toMatch(/Fulfillments/);
    expect(text).toMatch(/USPS|UPS|FedEx/);
  });

  it("errors for an unknown order number", async () => {
    const { isError, text } = await callTool("get_order", { order_number: "9999" });
    expect(isError).toBe(true);
    expect(text).toContain("No order found");
  });
});

describe("get_customer", () => {
  it("returns profile plus order history summary", async () => {
    const { text } = await callTool("get_customer", { email: "liam.carter@example.com" });
    expect(text).toContain("# Liam Carter");
    expect(text).toContain("3 orders");
    expect(text).toContain("## Recent orders (3)");
  });

  it("rejects a malformed email via schema validation", async () => {
    const { isError, text } = await callTool("get_customer", { email: "not-an-email" });
    expect(isError).toBe(true);
    expect(text).toContain("Invalid email address");
  });
});

describe("update_inventory", () => {
  it("sets the quantity and reports previous value", async () => {
    const { text, isError } = await callTool("update_inventory", {
      variant_id: "90002",
      quantity: 41,
    });
    expect(isError).toBe(false);
    expect(text).toContain("Previous quantity: 93");
    expect(text).toContain("New quantity: 41");

    const after = await callTool("get_product", { id: "8001" });
    expect(after.text).toMatch(/\| S \|[^\n]*\| 41 \|/);
  });

  it("surfaces unknown variants as tool errors", async () => {
    const { isError, text } = await callTool("update_inventory", {
      variant_id: "123456",
      quantity: 1,
    });
    expect(isError).toBe(true);
    expect(text).toContain("No variant with id 123456");
  });
});

describe("sales_summary", () => {
  it("computes exact aggregates over the full fixture window", async () => {
    // Ground truth computed independently from the fixture JSON:
    // 57 non-cancelled orders, 3 cancelled, gross 10082.06, refunds 340.63.
    const { text, isError } = await callTool("sales_summary", {
      start_date: "2026-04-01",
      end_date: "2026-07-08",
    });
    expect(isError).toBe(false);
    expect(text).toContain("Orders: 57 (+ 3 cancelled, excluded from revenue)");
    expect(text).toContain("Units sold: 187");
    expect(text).toContain("Gross revenue: $10,082.06");
    expect(text).toContain("Refunded: $340.63");
    expect(text).toContain("Net revenue: $9,741.43");
    expect(text).toContain("Average order value: $176.88");
    expect(text).toContain("Meridian Duffel Bag");
  });

  it("narrows correctly to a sub-window", async () => {
    const { text } = await callTool("sales_summary", {
      start_date: "2026-06-08",
      end_date: "2026-07-08",
    });
    expect(text).toMatch(/Orders: (19|20)/);
    expect(text).toContain("## Top products by revenue");
  });

  it("handles an empty window", async () => {
    const { text, isError } = await callTool("sales_summary", {
      start_date: "2020-01-01",
      end_date: "2020-01-31",
    });
    expect(isError).toBe(false);
    expect(text).toContain("Orders: 0");
    expect(text).toContain("No sales in this period.");
  });

  it("rejects an inverted date range", async () => {
    const { isError, text } = await callTool("sales_summary", {
      start_date: "2026-07-01",
      end_date: "2026-06-01",
    });
    expect(isError).toBe(true);
    expect(text).toContain("start_date must not be after end_date");
  });
});
