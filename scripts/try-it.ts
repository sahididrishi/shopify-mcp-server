/**
 * Smoke-tests the built server end-to-end without Claude: spawns
 * `node dist/index.js` as a child process, connects a real MCP client over
 * stdio, and exercises a handful of tools against the demo store.
 *
 *   npm run build && npm run try-it
 *
 * Exits non-zero if any tool call fails, so it doubles as an integration test.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, "dist", "index.js");

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function banner(step: number, title: string, args: Record<string, unknown>): void {
  console.log(`\n${BOLD}${CYAN}[${step}] ${title}${RESET} ${DIM}${JSON.stringify(args)}${RESET}`);
  console.log(`${DIM}${"-".repeat(72)}${RESET}`);
}

async function main(): Promise<void> {
  if (!existsSync(serverEntry)) {
    console.error(`${RED}dist/index.js not found - run "npm run build" first.${RESET}`);
    process.exit(1);
  }

  const client = new Client({ name: "try-it", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, SHOPIFY_STORE_DOMAIN: "", SHOPIFY_ACCESS_TOKEN: "" }, // force demo mode
    stderr: "pipe",
  });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`${BOLD}Connected.${RESET} Server exposes ${tools.length} tools:`);
  for (const tool of tools) {
    console.log(`  ${GREEN}*${RESET} ${tool.name}${DIM} - ${tool.description?.split(". ")[0]}${RESET}`);
  }

  let failures = 0;
  const call = async (step: number, name: string, args: Record<string, unknown>) => {
    banner(step, name, args);
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text?: string }[])
      .map((c) => c.text ?? "")
      .join("\n");
    if (result.isError === true) {
      failures += 1;
      console.log(`${RED}TOOL ERROR:${RESET} ${text}`);
    } else {
      console.log(text);
    }
  };

  await call(1, "search_products", { query: "leggings", limit: 3 });
  await call(2, "get_order", { order_number: "#1042" });
  await call(3, "get_customer", { email: "liam.carter@example.com" });
  await call(4, "sales_summary", {});

  await client.close();

  console.log(`\n${"-".repeat(72)}`);
  if (failures > 0) {
    console.log(`${RED}${BOLD}${failures} tool call(s) failed.${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}${BOLD}All tool calls succeeded.${RESET} The server is ready for Claude.`);
}

main().catch((error: unknown) => {
  console.error(`${RED}try-it failed:${RESET}`, error);
  process.exit(1);
});
