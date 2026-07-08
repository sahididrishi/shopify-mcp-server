import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { computeSalesSummary } from "./analytics.js";
import { BackendError, type StoreBackend } from "./backend.js";
import {
  formatCustomer,
  formatOrder,
  formatOrderLine,
  formatProduct,
  formatProductLine,
  formatSalesSummary,
} from "./format.js";

export const SERVER_NAME = "shopify-mcp-server";
export const SERVER_VERSION = "1.0.0";

const text = (value: string): CallToolResult => ({
  content: [{ type: "text", text: value }],
});

const toolError = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/**
 * Runs a tool handler, converting expected failures (validation problems,
 * Shopify API errors) into MCP tool errors the model can read and react to.
 */
async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BackendError) return toolError(error.message);
    return toolError(`Unexpected error: ${(error as Error).message}`);
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

const dateInput = (description: string) =>
  z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD or an ISO 8601 timestamp").describe(description);

/** "2026-05-01" -> start of that UTC day; full timestamps pass through. */
function toStartOfDay(value: string): string {
  return value.length === 10 ? `${value}T00:00:00.000Z` : new Date(value).toISOString();
}

/** "2026-05-01" -> end of that UTC day; full timestamps pass through. */
function toEndOfDay(value: string): string {
  return value.length === 10 ? `${value}T23:59:59.999Z` : new Date(value).toISOString();
}

export function createServer(backend: StoreBackend): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        `Tools for the Shopify store "${backend.label}". ` +
        "Read tools cover products, orders, customers and sales analytics; " +
        "update_inventory is the only write operation. " +
        "Monetary values are in the store currency.",
    },
  );

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search the store catalog by keywords. Matches product title, handle, type, " +
        "vendor, tags and SKUs (case-insensitive, all words must match). Returns a " +
        "compact list with ids, price range, stock and status.",
      inputSchema: {
        query: z.string().min(1).describe("Search keywords, e.g. 'seamless leggings'"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results to return (default 10)"),
      },
    },
    ({ query, limit }) =>
      run(async () => {
        const max = limit ?? 10;
        const [products, currency] = await Promise.all([
          backend.searchProducts(query, max),
          backend.getStoreCurrency(),
        ]);
        if (products.length === 0) {
          return text(`No products matched "${query}". Try fewer or broader keywords.`);
        }
        const header = `${products.length} product(s) matching "${query}":\n\n`;
        return text(header + products.map((p) => formatProductLine(p, currency)).join("\n"));
      }),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description:
        "Fetch one product with full details: description, tags, and every variant " +
        "with SKU, price and live inventory. Look up by numeric product id or by URL " +
        "handle (e.g. 'summit-seamless-leggings'). Provide exactly one of id/handle.",
      inputSchema: {
        id: z.string().optional().describe("Product id, e.g. '8001'"),
        handle: z.string().optional().describe("Product URL handle, e.g. 'summit-seamless-leggings'"),
      },
    },
    ({ id, handle }) =>
      run(async () => {
        if (id === undefined && handle === undefined) {
          return toolError("Provide either 'id' or 'handle'.");
        }
        const [product, currency] = await Promise.all([
          backend.getProduct({ id, handle }),
          backend.getStoreCurrency(),
        ]);
        if (product === null) {
          return toolError(
            `No product found for ${id !== undefined ? `id ${id}` : `handle "${handle}"`}. ` +
              "Use search_products to find valid ids and handles.",
          );
        }
        return text(formatProduct(product, currency));
      }),
  );

  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description:
        "List recent orders, newest first, with customer, total and payment/fulfillment " +
        "status. Filter by order status and/or creation date range. Use get_order for " +
        "line items and tracking details.",
      inputSchema: {
        status: z
          .enum(["any", "open", "closed", "cancelled"])
          .optional()
          .describe("Order status filter (default 'any'). 'open' = not archived or cancelled."),
        created_after: dateInput("Only orders created on/after this date (YYYY-MM-DD)").optional(),
        created_before: dateInput("Only orders created on/before this date (YYYY-MM-DD)").optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(250)
          .optional()
          .describe("Maximum orders to return (default 20)"),
      },
    },
    ({ status, created_after, created_before, limit }) =>
      run(async () => {
        const orders = await backend.listOrders({
          status,
          createdAtMin: created_after !== undefined ? toStartOfDay(created_after) : undefined,
          createdAtMax: created_before !== undefined ? toEndOfDay(created_before) : undefined,
          limit: limit ?? 20,
        });
        if (orders.length === 0) {
          return text("No orders matched those filters.");
        }
        return text(
          `${orders.length} order(s), newest first:\n\n` +
            orders.map(formatOrderLine).join("\n"),
        );
      }),
  );

  server.registerTool(
    "get_order",
    {
      title: "Get order",
      description:
        "Fetch one order in full: line items, totals breakdown, payment status, " +
        "fulfillment status and shipment tracking numbers. Look up by internal order " +
        "id or by the customer-facing order number (e.g. '1042' or '#1042'). Provide " +
        "exactly one of id/order_number.",
      inputSchema: {
        id: z.string().optional().describe("Internal order id"),
        order_number: z
          .string()
          .optional()
          .describe("Customer-facing order number, with or without '#'"),
      },
    },
    ({ id, order_number }) =>
      run(async () => {
        if (id === undefined && order_number === undefined) {
          return toolError("Provide either 'id' or 'order_number'.");
        }
        const order = await backend.getOrder({ id, orderNumber: order_number });
        if (order === null) {
          return toolError(
            `No order found for ${id !== undefined ? `id ${id}` : `number ${order_number}`}. ` +
              "Use list_orders to find valid order numbers.",
          );
        }
        return text(formatOrder(order));
      }),
  );

  server.registerTool(
    "get_customer",
    {
      title: "Get customer",
      description:
        "Fetch a customer profile by email address or customer id: contact details, " +
        "lifetime order count and spend, plus a summary of their most recent orders. " +
        "Provide exactly one of email/id.",
      inputSchema: {
        email: z.string().email().optional().describe("Customer email address"),
        id: z.string().optional().describe("Customer id"),
      },
    },
    ({ email, id }) =>
      run(async () => {
        if (email === undefined && id === undefined) {
          return toolError("Provide either 'email' or 'id'.");
        }
        const profile = await backend.getCustomer({ id, email });
        if (profile === null) {
          return toolError(
            `No customer found for ${email !== undefined ? email : `id ${id}`}.`,
          );
        }
        return text(formatCustomer(profile));
      }),
  );

  server.registerTool(
    "update_inventory",
    {
      title: "Update inventory",
      description:
        "WRITE OPERATION. Set the available inventory quantity for a product variant " +
        "(absolute value, not a delta). Get variant ids from get_product. Returns the " +
        "previous and new quantity so the change can be verified or reversed.",
      inputSchema: {
        variant_id: z.string().min(1).describe("Variant id from get_product"),
        quantity: z
          .number()
          .int()
          .min(0)
          .describe("New available quantity (absolute, must be >= 0)"),
      },
    },
    ({ variant_id, quantity }) =>
      run(async () => {
        const result = await backend.setInventory(variant_id, quantity);
        const label = [result.productTitle, result.variantTitle]
          .filter(Boolean)
          .join(" - ");
        return text(
          [
            "Inventory updated.",
            "",
            `- Variant: ${label || result.variantId}${result.sku ? ` (SKU ${result.sku})` : ""}`,
            `- Previous quantity: ${result.previousQuantity ?? "unknown"}`,
            `- New quantity: ${result.newQuantity}`,
          ].join("\n"),
        );
      }),
  );

  server.registerTool(
    "sales_summary",
    {
      title: "Sales summary",
      description:
        "Aggregate sales analytics for a date range: order count, units sold, gross and " +
        "net revenue, refunds, average order value, best day, and top products by " +
        "revenue. Cancelled orders are excluded from revenue. Defaults to the last 30 days.",
      inputSchema: {
        start_date: dateInput("Range start (YYYY-MM-DD). Default: 30 days ago.").optional(),
        end_date: dateInput("Range end (YYYY-MM-DD, inclusive). Default: today.").optional(),
      },
    },
    ({ start_date, end_date }) =>
      run(async () => {
        const end = end_date !== undefined ? toEndOfDay(end_date) : new Date().toISOString();
        const start =
          start_date !== undefined
            ? toStartOfDay(start_date)
            : new Date(new Date(end).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        if (new Date(start).getTime() > new Date(end).getTime()) {
          return toolError("start_date must not be after end_date.");
        }
        const [{ orders, truncated }, currency] = await Promise.all([
          backend.ordersBetween(start, end),
          backend.getStoreCurrency(),
        ]);
        const summary = computeSalesSummary(orders, { start, end }, { truncated });
        // An empty window has no orders to infer a currency from; fall back
        // to the store currency so formatting stays correct.
        summary.currency = orders[0]?.currency ?? currency;
        return text(formatSalesSummary(summary));
      }),
  );

  return server;
}
