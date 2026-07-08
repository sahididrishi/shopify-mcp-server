// Copies the demo store fixtures into dist/ after tsc runs, so the compiled
// server can resolve them with the same relative path it uses in src/.
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
cpSync(join(root, "src", "fixtures"), join(root, "dist", "fixtures"), { recursive: true });
console.log("Copied src/fixtures -> dist/fixtures");
