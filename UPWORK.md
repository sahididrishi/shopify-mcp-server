# Upwork Portfolio Assets

## Portfolio title

**Shopify MCP Server — Let Claude Run Your Store: Orders, Inventory & Sales Analytics via AI**

## Portfolio description (first person)

I built a production-grade Model Context Protocol (MCP) server that connects Claude — Anthropic's AI assistant — directly to a Shopify store. Instead of clicking through the Shopify admin, a store owner can simply ask: "Which orders from last week are still unfulfilled?", "Who is my top customer this quarter?", or "Set the medium leggings back to 40 units" — and Claude answers with live store data, or safely performs the change. The server exposes seven tools covering product search, order lookup with shipment tracking, customer profiles with purchase history, inventory updates, and a full sales analytics engine that computes revenue, refunds, average order value and top products for any date range.

The architecture is what makes it reliable. Every tool is written against a single backend interface with two interchangeable implementations: a live client for the Shopify Admin REST API — with automatic rate-limit retries, cursor pagination and precise error reporting — and a bundled demo store with 30 products, 60 orders and 25 customers, so anyone can evaluate the full experience in under a minute without credentials. Inputs are validated with zod schemas, the only write operation is explicitly flagged so the AI treats it with care, and API errors come back as readable tool errors the model can react to instead of crashing on.

Quality was non-negotiable: the project is fully typed TypeScript on the official MCP SDK, with 44 automated tests that drive the real server through an in-memory MCP client — including exact assertions on the analytics math — plus a standalone integration script that spawns the compiled server over stdio and exercises it end to end. If you need your product, SaaS or internal data connected to Claude, ChatGPT or any MCP-compatible AI agent, this is the standard of work I deliver.

## Skills tags

`MCP` · `Model Context Protocol` · `Claude API` · `AI Agent Development` · `LLM Integration` · `Shopify API` · `Shopify Development` · `TypeScript` · `Node.js` · `REST API Integration` · `API Development` · `Chatbot Integration` · `E-commerce Automation` · `Test-Driven Development` · `Zod`

## 60-second Loom script (demo in Claude Code)

> Screen: terminal with Claude Code open in the project; store is in demo mode.

- **0:00–0:08** — "Hi, I'm Sahid. This is an MCP server I built that lets Claude operate a Shopify store — products, orders, customers, inventory and analytics. Let me show you it live inside Claude Code."
- **0:08–0:18** — Type: *"Search the store for leggings and show me what's low on stock."* As results stream: "Claude calls my `search_products` tool — real inventory numbers, straight from the store backend."
- **0:18–0:32** — Type: *"Look up order #1042 — has it shipped?"* "One tool call later: full line items, the totals breakdown, and the actual FedEx tracking number. This is the kind of question support teams answer fifty times a day."
- **0:32–0:44** — Type: *"Give me a sales summary for the last 30 days."* "Revenue, refunds, average order value, best day, top products — computed by the server, not guessed by the AI, so the numbers are exact."
- **0:44–0:54** — Type: *"Set the M Summit Leggings stock to 40."* "And it acts, too — this is the one write operation, and it reports the previous quantity so every change is reversible."
- **0:54–1:00** — "Everything you saw runs on the bundled demo store — point it at a real Shopify store with two environment variables. Link's below; happy to build something like this for your stack."

## Suggested screenshots

1. **Claude Code answering "give me a sales summary for the last 30 days"** — shows the rendered analytics table (revenue, AOV, top products) beneath the visible `sales_summary` tool call. This is the money shot: AI + exact numbers.
2. **The `npm run try-it` terminal output** — four pretty-printed tool calls ending in "All tool calls succeeded." Proves engineering rigor without needing Claude in frame.
3. **The README architecture section** — the mermaid diagram plus the tools table, cropped together. Communicates system design skill to non-technical clients at a glance.
