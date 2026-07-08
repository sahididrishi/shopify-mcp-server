#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { StoreBackend } from "./backend.js";
import { DemoBackend } from "./backends/demo.js";
import { DEFAULT_API_VERSION, ShopifyBackend } from "./backends/shopify.js";
import { createServer } from "./server.js";

/**
 * Backend selection:
 * - SHOPIFY_STORE_DOMAIN + SHOPIFY_ACCESS_TOKEN set -> live Shopify Admin API
 * - otherwise -> bundled demo store (Aurora Athletics), fully functional
 *
 * Setting exactly one of the two variables is treated as a configuration
 * mistake and reported instead of silently falling back to demo data.
 */
function selectBackend(env: NodeJS.ProcessEnv): StoreBackend {
  const domain = env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = env.SHOPIFY_ACCESS_TOKEN?.trim();

  if (domain && token) {
    return new ShopifyBackend({
      storeDomain: domain,
      accessToken: token,
      apiVersion: env.SHOPIFY_API_VERSION?.trim() || DEFAULT_API_VERSION,
    });
  }
  if (domain || token) {
    const missing = domain ? "SHOPIFY_ACCESS_TOKEN" : "SHOPIFY_STORE_DOMAIN";
    console.error(
      `shopify-mcp-server: ${missing} is not set. Set both SHOPIFY_STORE_DOMAIN and ` +
        "SHOPIFY_ACCESS_TOKEN to connect a real store, or unset both for demo mode.",
    );
    process.exit(1);
  }
  return new DemoBackend();
}

async function main(): Promise<void> {
  const backend = selectBackend(process.env);
  const server = createServer(backend);

  // stdout is reserved for the MCP protocol; all logging goes to stderr.
  console.error(`shopify-mcp-server: connected to ${backend.label}`);

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error("shopify-mcp-server: fatal:", error);
  process.exit(1);
});
