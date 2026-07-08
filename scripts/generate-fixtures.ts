/**
 * Regenerates the bundled "Aurora Athletics" demo store fixtures in
 * src/fixtures/. Fully deterministic (seeded PRNG), so reruns are
 * reproducible: `npm run generate-fixtures`.
 *
 * All dates are anchored to FIXTURE_BASE_DATE; DemoBackend rebases them to
 * "now" at load time so the store always looks freshly active.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_BASE_DATE } from "../src/backends/demo.js";
import type {
  Customer,
  FinancialStatus,
  Fulfillment,
  FulfillmentStatus,
  LineItem,
  Order,
  Product,
  ProductVariant,
} from "../src/types.js";

// --------------------------------------------------------------------------
// Seeded PRNG (mulberry32) so the fixtures are stable across runs.
// --------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260708);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const BASE = new Date(FIXTURE_BASE_DATE).getTime();
const DAY = 24 * 60 * 60 * 1000;
const iso = (msBeforeBase: number) => new Date(BASE - msBeforeBase).toISOString();

// --------------------------------------------------------------------------
// Catalog: 30 products
// --------------------------------------------------------------------------

interface CatalogEntry {
  title: string;
  type: string;
  price: number;
  compareAt?: number;
  tags: string[];
  options: string[]; // variant titles, e.g. sizes or colors
  description: string;
  skuPrefix: string;
}

const SIZES = ["XS", "S", "M", "L", "XL"];
const BOTTLE_SIZES = ["18 oz", "26 oz"];
const ONE_SIZE = ["One Size"];

const CATALOG: CatalogEntry[] = [
  { title: "Summit Seamless Leggings", type: "Leggings", price: 68, compareAt: 84, tags: ["womens", "leggings", "seamless", "bestseller"], options: SIZES, skuPrefix: "AA-LEG-SUM", description: "High-rise seamless leggings with four-way stretch and a no-slip waistband. Squat-proof fabric that wicks sweat through the longest sessions." },
  { title: "Horizon High-Rise Leggings", type: "Leggings", price: 74, tags: ["womens", "leggings", "high-rise"], options: SIZES, skuPrefix: "AA-LEG-HOR", description: "Buttery-soft high-rise leggings with two side pockets sized for a phone. Flat-locked seams prevent chafing on long runs." },
  { title: "Pulse 7/8 Leggings", type: "Leggings", price: 62, tags: ["womens", "leggings", "7-8-length"], options: SIZES, skuPrefix: "AA-LEG-PUL", description: "A 7/8-length legging in our quick-dry Pulse knit. Compressive through the thigh with a breathable mesh calf panel." },
  { title: "Tempo Running Shorts", type: "Shorts", price: 42, tags: ["womens", "shorts", "running"], options: SIZES, skuPrefix: "AA-SHO-TEM", description: "Featherweight 3-inch running shorts with a built-in liner and zip back pocket. Reflective logo for low-light miles." },
  { title: "Circuit Training Shorts", type: "Shorts", price: 48, tags: ["mens", "shorts", "training"], options: SIZES, skuPrefix: "AA-SHO-CIR", description: "7-inch training shorts in a durable stretch-woven shell. Gusseted crotch and deep pockets that hold keys through burpees." },
  { title: "Coastal 2-in-1 Shorts", type: "Shorts", price: 54, tags: ["mens", "shorts", "running", "2-in-1"], options: SIZES, skuPrefix: "AA-SHO-COA", description: "2-in-1 running shorts pairing a breezy outer shell with a supportive compression liner. Anti-odor finish keeps them fresh." },
  { title: "Apex Sports Bra", type: "Sports Bras", price: 52, compareAt: 64, tags: ["womens", "sports-bras", "high-impact", "bestseller"], options: SIZES, skuPrefix: "AA-BRA-APX", description: "High-impact sports bra with molded cups and adjustable straps. Locked-in support tested for running and HIIT." },
  { title: "Flow Strappy Bra", type: "Sports Bras", price: 44, tags: ["womens", "sports-bras", "low-impact", "yoga"], options: SIZES, skuPrefix: "AA-BRA-FLW", description: "Low-impact strappy bra designed for yoga and studio work. Removable pads and a soft elastic underband." },
  { title: "Stride Racerback Bra", type: "Sports Bras", price: 46, tags: ["womens", "sports-bras", "medium-impact"], options: SIZES, skuPrefix: "AA-BRA-STR", description: "Medium-impact racerback with bonded seams and perforated back panel for airflow during tempo sessions." },
  { title: "Ridge Performance Tee", type: "Tops", price: 36, tags: ["mens", "tops", "training"], options: SIZES, skuPrefix: "AA-TOP-RDG", description: "A training tee in sweat-wicking micro-pique that never clings. Drop-tail hem stays tucked through lifts." },
  { title: "Ember Long Sleeve", type: "Tops", price: 48, tags: ["womens", "tops", "long-sleeve"], options: SIZES, skuPrefix: "AA-TOP-EMB", description: "Cloud-soft long sleeve with thumbholes and a cropped boxy fit. Layers cleanly over any bra in the range." },
  { title: "Drift Muscle Tank", type: "Tops", price: 32, tags: ["mens", "tops", "tanks"], options: SIZES, skuPrefix: "AA-TOP-DRF", description: "Relaxed muscle tank cut low at the arm for full range of motion. Midweight cotton-blend jersey that holds its shape." },
  { title: "Lift Crop Tank", type: "Tops", price: 34, tags: ["womens", "tops", "tanks", "crop"], options: SIZES, skuPrefix: "AA-TOP-LFT", description: "Cropped tank in ribbed stretch jersey with a scooped neckline. Pairs with high-rise leggings for a clean line." },
  { title: "Basecamp Hoodie", type: "Hoodies", price: 78, compareAt: 92, tags: ["unisex", "hoodies", "bestseller"], options: SIZES, skuPrefix: "AA-HOD-BSC", description: "Heavyweight fleece hoodie with a double-lined hood and ribbed side panels. The warm-up layer that lives on repeat." },
  { title: "Alpine Zip Hoodie", type: "Hoodies", price: 84, tags: ["unisex", "hoodies", "full-zip"], options: SIZES, skuPrefix: "AA-HOD-ALP", description: "Full-zip hoodie in brushed tech fleece with zippered hand pockets and a media loop. Travels from gym to street." },
  { title: "Glide Joggers", type: "Joggers", price: 72, tags: ["mens", "joggers", "tapered"], options: SIZES, skuPrefix: "AA-JOG-GLD", description: "Tapered joggers in a four-way stretch French terry. Zip ankle gussets fit over trainers without bunching." },
  { title: "Restore Joggers", type: "Joggers", price: 68, tags: ["womens", "joggers", "lounge"], options: SIZES, skuPrefix: "AA-JOG-RST", description: "Relaxed recovery joggers in a modal blend so soft they double as sleepwear. Elastic waist with a flat drawcord." },
  { title: "Windrunner Jacket", type: "Jackets", price: 96, compareAt: 118, tags: ["unisex", "jackets", "running", "windproof"], options: SIZES, skuPrefix: "AA-JKT-WND", description: "Packable windproof shell weighing under 120 grams. Stows into its own chest pocket and clips onto any bag." },
  { title: "Thermo Trail Vest", type: "Jackets", price: 88, tags: ["unisex", "jackets", "vests", "insulated"], options: SIZES, skuPrefix: "AA-JKT-THV", description: "Lightly insulated vest with a DWR finish for damp trailheads. Core warmth without restricting the arms." },
  { title: "Momentum Track Pants", type: "Joggers", price: 76, tags: ["mens", "joggers", "track"], options: SIZES, skuPrefix: "AA-JOG-MOM", description: "Retro track pants in recycled ripstop with snap ankles and a mesh lining. Warm-up official, podium optional." },
  { title: "Aurora Water Bottle", type: "Accessories", price: 28, tags: ["accessories", "hydration", "bestseller"], options: BOTTLE_SIZES, skuPrefix: "AA-ACC-BTL", description: "Double-wall insulated steel bottle that keeps drinks cold for 24 hours. Leakproof flip lid with a carry loop." },
  { title: "Eclipse Yoga Mat", type: "Accessories", price: 58, tags: ["accessories", "yoga", "mats"], options: ["Standard", "Long"], skuPrefix: "AA-ACC-MAT", description: "5 mm natural rubber mat with a moisture-grip top layer. Alignment lines guide hands and feet through every flow." },
  { title: "Grip Training Gloves", type: "Accessories", price: 26, tags: ["accessories", "gloves", "training"], options: ["S", "M", "L"], skuPrefix: "AA-ACC-GLV", description: "Padded training gloves with wrist wraps and silicone palm grip. Machine washable, smell-resistant." },
  { title: "Velocity Running Cap", type: "Accessories", price: 24, tags: ["accessories", "caps", "running"], options: ONE_SIZE, skuPrefix: "AA-ACC-CAP", description: "Five-panel running cap in quick-dry ripstop with a reflective brim and adjustable strap. Folds into a pocket." },
  { title: "Flux Headband Set", type: "Accessories", price: 18, tags: ["accessories", "headbands"], options: ONE_SIZE, skuPrefix: "AA-ACC-HBD", description: "Three-pack of no-slip headbands in mixed widths. Silicone backing stays put through sprints and inversions." },
  { title: "Charge Crew Socks", type: "Accessories", price: 16, tags: ["accessories", "socks"], options: ["S/M", "L/XL"], skuPrefix: "AA-ACC-SCK", description: "Cushioned crew socks with arch compression and a seamless toe. Sold as a two-pack." },
  { title: "Meridian Duffel Bag", type: "Accessories", price: 92, tags: ["accessories", "bags", "duffel"], options: ONE_SIZE, skuPrefix: "AA-ACC-DUF", description: "40 L gym duffel with a ventilated shoe tunnel, laptop sleeve and water-resistant base. Carry-on friendly." },
  { title: "Kinetic Resistance Bands", type: "Accessories", price: 32, tags: ["accessories", "bands", "training"], options: ["Light Set", "Heavy Set"], skuPrefix: "AA-ACC-BND", description: "Fabric resistance band set in three tensions with a carry pouch. Non-rolling weave rated for 150k stretches." },
  { title: "Recovery Foam Roller", type: "Accessories", price: 38, tags: ["accessories", "recovery"], options: ONE_SIZE, skuPrefix: "AA-ACC-ROL", description: "Medium-density foam roller with a textured surface for targeted release. Hollow core keeps it under 700 grams." },
  { title: "Trailhead Gaiter", type: "Accessories", price: 20, tags: ["accessories", "gaiters", "trail"], options: ONE_SIZE, skuPrefix: "AA-ACC-GTR", description: "Multi-use neck gaiter in UPF 50 stretch knit. Wear it as a headband, mask or wristband on dusty trails." },
];

let variantIdCounter = 90001;
const products: Product[] = CATALOG.map((entry, index) => {
  const id = String(8001 + index);
  const handle = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const variants: ProductVariant[] = entry.options.map((option, vi) => ({
    id: String(variantIdCounter++),
    title: option,
    sku: `${entry.skuPrefix}-${option.replace(/[^A-Za-z0-9]+/g, "").toUpperCase()}`,
    price: entry.price + (vi >= 4 ? 2 : 0), // XL sizes carry a small upcharge
    compareAtPrice: entry.compareAt !== undefined ? entry.compareAt + (vi >= 4 ? 2 : 0) : null,
    inventoryQuantity: randInt(0, 120),
  }));
  return {
    id,
    title: entry.title,
    handle,
    description: entry.description,
    productType: entry.type,
    vendor: "Aurora Athletics",
    status: "active",
    tags: entry.tags,
    createdAt: iso(randInt(120, 700) * DAY),
    variants,
  };
});

// Guarantee a couple of interesting inventory states for demos.
products[0].variants[2].inventoryQuantity = 3; // bestseller size M nearly out
products[6].variants[1].inventoryQuantity = 0; // Apex bra size S sold out

// --------------------------------------------------------------------------
// Customers: 25
// --------------------------------------------------------------------------

const PEOPLE: [string, string, string, string][] = [
  ["Maya", "Thompson", "Denver", "United States"],
  ["Liam", "Carter", "Austin", "United States"],
  ["Sofia", "Ramirez", "San Diego", "United States"],
  ["Ethan", "Brooks", "Seattle", "United States"],
  ["Ava", "Nguyen", "Portland", "United States"],
  ["Noah", "Patel", "Chicago", "United States"],
  ["Isla", "Morrison", "Vancouver", "Canada"],
  ["Lucas", "Bennett", "Toronto", "Canada"],
  ["Emma", "Kowalski", "Minneapolis", "United States"],
  ["Oliver", "Hayes", "Nashville", "United States"],
  ["Chloe", "Fitzgerald", "Boston", "United States"],
  ["Mason", "Delgado", "Phoenix", "United States"],
  ["Harper", "Lindqvist", "Salt Lake City", "United States"],
  ["Aiden", "O'Connell", "Dublin", "Ireland"],
  ["Zoe", "Marchetti", "Brooklyn", "United States"],
  ["Elijah", "Sandoval", "Albuquerque", "United States"],
  ["Ruby", "Ashworth", "London", "United Kingdom"],
  ["Jackson", "Beaumont", "New Orleans", "United States"],
  ["Lily", "Vasquez", "Miami", "United States"],
  ["Henry", "Okafor", "Houston", "United States"],
  ["Grace", "Steiner", "Madison", "United States"],
  ["Caleb", "Whitfield", "Raleigh", "United States"],
  ["Nora", "Espinoza", "Sacramento", "United States"],
  ["Owen", "Gallagher", "Pittsburgh", "United States"],
  ["Stella", "Baptiste", "Montreal", "Canada"],
];

const CUSTOMER_TAG_POOL = [["vip"], ["newsletter"], ["wholesale-inquiry"], ["newsletter", "vip"], [], [], []];

const customers: Customer[] = PEOPLE.map(([firstName, lastName, city, country], index) => ({
  id: String(6001 + index),
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
  firstName,
  lastName,
  createdAt: iso(randInt(95, 800) * DAY),
  ordersCount: 0, // reconciled after order generation
  totalSpent: 0,
  currency: "USD",
  tags: pick(CUSTOMER_TAG_POOL),
  city,
  country,
}));

// --------------------------------------------------------------------------
// Orders: 60 across the trailing 90 days
// --------------------------------------------------------------------------

const TAX_RATE = 0.08;
const FREE_SHIPPING_THRESHOLD = 75;
const SHIPPING_FLAT = 6.95;
const CARRIERS = ["USPS", "UPS", "FedEx"] as const;

function makeLineItems(): LineItem[] {
  const count = pick([1, 1, 1, 2, 2, 2, 3, 3, 4]);
  const chosen = new Set<string>();
  const items: LineItem[] = [];
  while (items.length < count) {
    const product = pick(products);
    const variant = pick(product.variants);
    if (chosen.has(variant.id)) continue;
    chosen.add(variant.id);
    items.push({
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title,
      sku: variant.sku,
      quantity: pick([1, 1, 1, 1, 2, 2, 3]),
      price: variant.price,
    });
  }
  return items;
}

function trackingNumber(carrier: (typeof CARRIERS)[number]): string {
  const digits = () => String(randInt(0, 9));
  if (carrier === "UPS") return `1Z999AA${Array.from({ length: 10 }, digits).join("")}`;
  if (carrier === "FedEx") return Array.from({ length: 12 }, digits).join("");
  return `94001169990${Array.from({ length: 11 }, digits).join("")}`;
}

const orders: Order[] = [];
for (let i = 0; i < 60; i++) {
  const orderNumber = 1001 + i;
  // Spread newest-first: order 60 is ~1 day old, order 1 is ~90 days old.
  const ageDays = 1 + ((60 - 1 - i) * 89) / 59 + rand() * 0.8;
  const ageMs = Math.round(ageDays * DAY) - randInt(0, 12) * 60 * 60 * 1000;
  const createdAt = iso(Math.max(ageMs, 6 * 60 * 60 * 1000));

  const lineItems = makeLineItems();
  const subtotal = round2(lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0));
  const hasDiscount = rand() < 0.25;
  const totalDiscounts = hasDiscount ? round2(subtotal * 0.1) : 0;
  const discounted = round2(subtotal - totalDiscounts);
  const totalShipping = discounted >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
  const totalTax = round2(discounted * TAX_RATE);
  const total = round2(discounted + totalShipping + totalTax);

  const customer = customers[randInt(0, customers.length - 1)];

  // Status model: older orders are overwhelmingly settled; the newest ones
  // are still moving through payment and fulfillment.
  const roll = rand();
  let financialStatus: FinancialStatus = "paid";
  let fulfillmentStatus: FulfillmentStatus = "fulfilled";
  let cancelledAt: string | null = null;
  let totalRefunded = 0;

  if (roll < 0.06) {
    // Cancelled shortly after purchase, fully voided.
    cancelledAt = new Date(new Date(createdAt).getTime() + randInt(2, 40) * 60 * 60 * 1000).toISOString();
    financialStatus = "voided";
    fulfillmentStatus = "unfulfilled";
  } else if (roll < 0.11 && ageDays > 10) {
    financialStatus = "refunded";
    totalRefunded = total;
  } else if (roll < 0.16 && ageDays > 10) {
    financialStatus = "partially_refunded";
    totalRefunded = round2(lineItems[0].price * TAX_RATE + lineItems[0].price); // one item + its tax
  } else if (ageDays < 2) {
    financialStatus = rand() < 0.5 ? "pending" : "paid";
    fulfillmentStatus = "unfulfilled";
  } else if (ageDays < 5) {
    fulfillmentStatus = pick(["unfulfilled", "partial", "fulfilled"] as const);
  } else if (rand() < 0.06) {
    fulfillmentStatus = "partial";
  }

  const fulfillments: Fulfillment[] = [];
  if (cancelledAt === null && fulfillmentStatus !== "unfulfilled") {
    const carrier = pick(CARRIERS);
    const number = trackingNumber(carrier);
    fulfillments.push({
      status: "success",
      trackingCompany: carrier,
      trackingNumber: number,
      trackingUrl:
        carrier === "UPS"
          ? `https://www.ups.com/track?tracknum=${number}`
          : carrier === "FedEx"
            ? `https://www.fedex.com/fedextrack/?trknbr=${number}`
            : `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`,
      createdAt: new Date(new Date(createdAt).getTime() + randInt(18, 72) * 60 * 60 * 1000).toISOString(),
    });
  }

  orders.push({
    id: String(450001 + i),
    name: `#${orderNumber}`,
    orderNumber,
    createdAt,
    cancelledAt,
    currency: "USD",
    financialStatus,
    fulfillmentStatus,
    subtotal,
    totalDiscounts,
    totalShipping,
    totalTax,
    total,
    totalRefunded,
    customer: { id: customer.id, name: `${customer.firstName} ${customer.lastName}`, email: customer.email },
    lineItems,
    fulfillments,
  });
}

// Guarantee that every interesting status appears at least once, so demos
// always have a pending payment and a partial refund to point at.
const newest = orders[orders.length - 1];
newest.financialStatus = "pending";
newest.fulfillmentStatus = "unfulfilled";
newest.fulfillments = [];
const partialRefundTarget = orders.find(
  (o, idx) => idx >= 20 && idx <= 40 && o.cancelledAt === null && o.financialStatus === "paid",
);
if (partialRefundTarget !== undefined) {
  partialRefundTarget.financialStatus = "partially_refunded";
  partialRefundTarget.totalRefunded = round2(
    partialRefundTarget.lineItems[0].price * (1 + TAX_RATE),
  );
}

// Reconcile customer lifetime stats with the orders that were generated
// (cancelled orders count toward ordersCount but not totalSpent).
for (const order of orders) {
  const customer = customers.find((c) => c.id === order.customer?.id);
  if (customer === undefined) continue;
  customer.ordersCount += 1;
  if (order.cancelledAt === null) {
    customer.totalSpent = round2(customer.totalSpent + order.total - order.totalRefunded);
  }
}

// --------------------------------------------------------------------------
// Validate + write
// --------------------------------------------------------------------------

const variantIds = new Set(products.flatMap((p) => p.variants.map((v) => v.id)));
for (const order of orders) {
  for (const li of order.lineItems) {
    if (!variantIds.has(li.variantId)) throw new Error(`Dangling variant ${li.variantId} in ${order.name}`);
  }
  const expectedSubtotal = round2(order.lineItems.reduce((s, li) => s + li.price * li.quantity, 0));
  if (expectedSubtotal !== order.subtotal) throw new Error(`Subtotal mismatch in ${order.name}`);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "fixtures");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "products.json"), JSON.stringify(products, null, 2) + "\n");
writeFileSync(join(outDir, "orders.json"), JSON.stringify(orders, null, 2) + "\n");
writeFileSync(join(outDir, "customers.json"), JSON.stringify(customers, null, 2) + "\n");

const gross = round2(orders.filter((o) => o.cancelledAt === null).reduce((s, o) => s + o.total, 0));
console.log(`Wrote ${products.length} products, ${orders.length} orders, ${customers.length} customers to ${outDir}`);
console.log(`Non-cancelled gross revenue across 90 days: $${gross}`);
