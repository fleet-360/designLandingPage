// Fails when a module under api/_routes is not listed in api/router.js ROUTES (it would be
// unreachable in production), or when ROUTES points at a file that does not exist.
// Runs in the Vercel build (vercel.json) and in `npm run check`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, "api", "_routes");
const router = fs.readFileSync(path.join(ROOT, "api", "router.js"), "utf8");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(path.relative(DIR, p).replace(/\\/g, "/").replace(/\.js$/, ""));
  }
})(DIR);

const listed = [...router.matchAll(/"([^"]+)": \(\) => import\("\.\/_routes\/([^"]+)\.js"\)/g)];
const problems = [];
for (const f of files) if (!listed.some(([, , file]) => file === f)) problems.push(`not routed: api/_routes/${f}.js`);
for (const [, key, file] of listed) {
  if (!files.includes(file)) problems.push(`missing file for "${key}": api/_routes/${file}.js`);
  if (key !== file) problems.push(`route "${key}" points at ${file}.js`);
}
if (problems.length) {
  console.error(`[check-api-routes]\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`[check-api-routes] ${files.length} routes ok`);
