import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Compressed-size limits, in KiB (1,024 bytes), for everything a customer downloads on the first visit. The first
// storefront slice measured about 125 KiB of gzip JavaScript and 1 KiB of CSS, so these limits leave room for small
// additions while failing CI when a change, such as a large chart library or the future admin screens, would slow
// every visit. Vite prints slightly different numbers because it uses 1,000-byte kilobytes and its own compression.
const budgets = { ".js": 150 * 1024, ".css": 20 * 1024 };

const assetsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets");
let files;

try {
  files = await readdir(assetsDirectory);
} catch {
  throw new Error("dist/assets was not found. Run npm run build before npm run size.");
}

const totals = { ".js": 0, ".css": 0 };

for (const file of files) {
  const extension = path.extname(file);
  if (!(extension in totals)) continue;
  totals[extension] += gzipSync(await readFile(path.join(assetsDirectory, file))).length;
}

let failed = false;
for (const [extension, limit] of Object.entries(budgets)) {
  const kilobytes = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
  const within = totals[extension] <= limit;
  failed ||= !within;
  console.log(`${within ? "ok" : "over"} ${extension}: ${kilobytes(totals[extension])} of ${kilobytes(limit)} gzip`);
}
if (failed) process.exitCode = 1;
