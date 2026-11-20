// Local preview of the whole site: dist/ the way tools/serve.py serves it (extensionless .html,
// _redirects, 404), plus the API under /api/ (api/**/*.js, the files Vercel deploys as functions).
// Reads .env for DATABASE_URL and the PAY_* variables. Rebuild dist/ with tools/build.py first.
//
// Run: npm run dev   (http://localhost:5173, or PORT=...)

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDotEnv } from "../api/_lib/env.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 5173);
loadDotEnv(ROOT);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain",
  ".woff2": "font/woff2", ".pdf": "application/pdf", ".mp4": "video/mp4",
};

function rules() {
  const out = [];
  for (const line of fs.readFileSync(path.join(DIST, "_redirects"), "utf8").split("\n")) {
    const p = line.trim().split(/\s+/);
    if (!p[0] || p[0].startsWith("#")) continue;
    if (p.length === 4 && p[1].includes("=")) {
      const [k, v] = p[1].split("=");
      out.push({ src: p[0], cond: [k, decodeURIComponent(v)], target: p[2], status: p[3] });
    } else if (p.length === 3) {
      out.push({ src: p[0], cond: null, target: p[1], status: p[2] });
    }
  }
  return out;
}

// All of /api goes through api/router.js, as on Vercel. Restart after editing API code:
// modules are cached once loaded.
const apiRouter = import(pathToFileURL(path.join(ROOT, "api", "router.js")).href);
async function api(req, res) {
  return (await apiRouter).default(req, res);
}

function serveFile(res, file, status = 200) {
  res.writeHead(status, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api/")) return api(req, res, pathname);

  for (const r of rules()) {
    if (r.src !== pathname) continue;
    if (r.cond && url.searchParams.get(r.cond[0]) !== r.cond[1]) continue;
    if (r.status.startsWith("30")) {
      res.writeHead(Number(r.status), { Location: r.target });
      return res.end();
    }
    pathname = r.target;
    break;
  }

  let file = path.join(DIST, pathname);
  if (!file.startsWith(DIST)) return res.writeHead(400).end();
  // the contracts app routes in the browser: any /contracts/... that is not a file gets its index.html
  // (vercel.json does the same with a rewrite)
  if ((pathname === "/contracts" || pathname.startsWith("/contracts/")) && !(fs.existsSync(file) && fs.statSync(file).isFile())) {
    file = path.join(DIST, "contracts", "index.html");
  }
  if (pathname.endsWith("/") && fs.existsSync(path.join(file, "index.html"))) file = path.join(file, "index.html");
  else if (!path.extname(pathname) && fs.existsSync(`${file}.html`)) file += ".html";
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return serveFile(res, path.join(DIST, "404.html"), 404);
  serveFile(res, file);
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
