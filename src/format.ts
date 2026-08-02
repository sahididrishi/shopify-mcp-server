import type { SalesSummary, TopCustomersSummary } from "./analytics.js";
import type { CustomerProfile, Order, Product } from "./types.js";

/** "1234.5" -> "$1,234.50" (uses the order/store currency code). */
export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

export function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

function totalInventory(product: Product): number {
  return product.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
}

function priceRange(product: Product, currency: string): string {
  const prices = product.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max
    ? money(min, currency)
    : `${money(min, currency)}-${money(max, currency)}`;
}

export function formatProductLine(product: Product, currency: string): string {
  return [
    `- ${product.title} (id ${product.id}, handle "${product.handle}")`,
    `  ${product.productType} | ${priceRange(product, currency)} | ${totalInventory(product)} in stock | ${product.status}`,
  ].join("\n");
}

export function formatProduct(product: Product, currency: string): string {
  const lines = [
    `# ${product.title}`,
    "",
    `- ID: ${product.id}`,
    `- Handle: ${product.handle}`,
    `- Type: ${product.productType} | Vendor: ${product.vendor} | Status: ${product.status}`,
    `- Tags: ${product.tags.length > 0 ? product.tags.join(", ") : "(none)"}`,
    `- Created: ${shortDate(product.createdAt)}`,
    "",
    product.description,
    "",
    `## Variants (${product.variants.length})`,
    "",
    "| Variant | SKU | Price | Compare at | Inventory | Variant ID |",
    "|---|---|---|---|---|---|",
  ];
  for (const v of product.variants) {
    lines.push(
      `| ${v.title} | ${v.sku} | ${money(v.price, currency)} | ${
        v.compareAtPrice !== null ? money(v.compareAtPrice, currency) : "-"
      } | ${v.inventoryQuantity} | ${v.id} |`,
    );
  }
  return lines.join("\n");
}

export function formatOrderLine(order: Order): string {
  const customer = order.customer ? order.customer.name : "Guest checkout";
  const status = order.cancelledAt
    ? "cancelled"
    : `${order.financialStatus} / ${order.fulfillmentStatus}`;
  return `- ${order.name} | ${shortDate(order.createdAt)} | ${customer} | ${money(order.total, order.currency)} | ${status}`;
}

export function formatOrder(order: Order): string {
  const c = order.currency;
  const lines = [
    `# Order ${order.name}`,
    "",
    `- ID: ${order.id}`,
    `- Placed: ${order.createdAt}`,
    `- Customer: ${
      order.customer
        ? `${order.customer.name} <${order.customer.email}> (id ${order.customer.id})`
        : "Guest checkout"
    }`,
    `- Payment: ${order.financialStatus} | Fulfillment: ${order.fulfillmentStatus}`,
  ];
  if (order.cancelledAt) {
    lines.push(`- CANCELLED at ${order.cancelledAt}`);
  }
  if (order.totalRefunded > 0) {
    lines.push(`- Refunded so far: ${money(order.totalRefunded, c)}`);
  }
  lines.push(
    "",
    `## Line items (${order.lineItems.length})`,
    "",
    "| Item | SKU | Qty | Unit price | Total |",
    "|---|---|---|---|---|",
  );
  for (const item of order.lineItems) {
    lines.push(
      `| ${item.title} - ${item.variantTitle} | ${item.sku} | ${item.quantity} | ${money(item.price, c)} | ${money(item.price * item.quantity, c)} |`,
    );
  }
  lines.push(
    "",
    "## Totals",
    "",
    `- Subtotal: ${money(order.subtotal, c)}`,
    `- Discounts: ${order.totalDiscounts > 0 ? `-${money(order.totalDiscounts, c)}` : money(0, c)}`,
    `- Shipping: ${money(order.totalShipping, c)}`,
    `- Tax: ${money(order.totalTax, c)}`,
    `- **Total: ${money(order.total, c)}**`,
  );
  if (order.fulfillments.length > 0) {
    lines.push("", "## Fulfillments", "");
    for (const f of order.fulfillments) {
      const tracking =
        f.trackingNumber !== null
          ? `${f.trackingCompany ?? "carrier"} ${f.trackingNumber}${f.trackingUrl ? ` (${f.trackingUrl})` : ""}`
          : "no tracking";
      lines.push(`- ${f.status} on ${shortDate(f.createdAt)} - ${tracking}`);
    }
  } else {
    lines.push("", "No fulfillments yet.");
  }
  return lines.join("\n");
}

export function formatCustomer(profile: CustomerProfile): string {
  const { customer, recentOrders } = profile;
  const lines = [
    `# ${customer.firstName} ${customer.lastName}`,
    "",
    `- ID: ${customer.id}`,
    `- Email: ${customer.email}`,
    `- Location: ${[customer.city, customer.country].filter(Boolean).join(", ") || "unknown"}`,
    `- Customer since: ${shortDate(customer.createdAt)}`,
    `- Lifetime: ${customer.ordersCount} orders, ${money(customer.totalSpent, customer.currency)} spent`,
    `- Tags: ${customer.tags.length > 0 ? customer.tags.join(", ") : "(none)"}`,
    "",
    `## Recent orders (${recentOrders.length})`,
    "",
  ];
  if (recentOrders.length === 0) {
    lines.push("No orders yet.");
  } else {
    for (const order of recentOrders) {
      lines.push(formatOrderLine(order));
    }
  }
  return lines.join("\n");
}

export function formatSalesSummary(summary: SalesSummary): string {
  const c = summary.currency;
  const lines = [
    `# Sales summary: ${shortDate(summary.start)} to ${shortDate(summary.end)}`,
    "",
    `- Orders: ${summary.orderCount}${summary.cancelledCount > 0 ? ` (+ ${summary.cancelledCount} cancelled, excluded from revenue)` : ""}`,
    `- Units sold: ${summary.unitsSold}`,
    `- Gross revenue: ${money(summary.grossRevenue, c)}`,
    `- Refunded: ${money(summary.refundedAmount, c)}`,
    `- **Net revenue: ${money(summary.netRevenue, c)}**`,
    `- Average order value: ${money(summary.averageOrderValue, c)}`,
  ];
  if (summary.bestDay) {
    lines.push(`- Best day: ${summary.bestDay.date} (${money(summary.bestDay.revenue, c)})`);
  }
  lines.push("", "## Top products by revenue", "");
  if (summary.topProducts.length === 0) {
    lines.push("No sales in this period.");
  } else {
    lines.push("| # | Product | Units | Revenue |", "|---|---|---|---|");
    summary.topProducts.forEach((p, i) => {
      lines.push(`| ${i + 1} | ${p.title} | ${p.units} | ${money(p.revenue, c)} |`);
    });
  }
  if (summary.truncated) {
    lines.push(
      "",
      "Note: the order window hit the API pagination cap, so these figures may undercount. Narrow the date range for exact numbers.",
    );
  }
  return lines.join("\n");
}

export function formatTopCustomers(summary: TopCustomersSummary): string {
  const c = summary.currency;
  const lines = [
    `# Top customers by net spend: ${shortDate(summary.start)} to ${shortDate(summary.end)}`,
    "",
  ];
  if (summary.customers.length === 0) {
    lines.push("No customer orders in this period.");
  } else {
    lines.push(
      "| # | Customer | Email | Orders | Net spent | Last order |",
      "|---|---|---|---|---|---|",
    );
    summary.customers.forEach((cust, i) => {
      lines.push(
        `| ${i + 1} | ${cust.name} | ${cust.email} | ${cust.orderCount} | ${money(cust.netSpent, c)} | ${shortDate(cust.lastOrderAt)} |`,
      );
    });
    lines.push("", "Use get_customer with an email for the full profile and order history.");
  }
  if (summary.guestOrderCount > 0) {
    lines.push(
      "",
      `${summary.guestOrderCount} guest checkout order(s) in this period could not be attributed to a customer.`,
    );
  }
  if (summary.truncated) {
    lines.push(
      "",
      "Note: the order window hit the API pagination cap, so these figures may undercount. Narrow the date range for exact numbers.",
    );
  }
  return lines.join("\n");
}
