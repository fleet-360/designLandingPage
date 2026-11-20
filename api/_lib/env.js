// Local development only: Vercel injects the environment itself.
import fs from "node:fs";
import path from "node:path";

// Fills missing variables from .env.local, then .env. The process environment always wins.
export function loadDotEnv(root) {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let value = m[2];
      if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}
