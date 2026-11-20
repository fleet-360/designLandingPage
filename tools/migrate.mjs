// Applies db/migrations/*.sql in name order, each once, each in its own transaction.
// Runs after the site build on Vercel (see vercel.json) and by hand: `npm run migrate`.
// Without DATABASE_URL / POSTGRES_URL it does nothing: the domains built from this repo
// that have no database still deploy.
//
// Migrations only ever add. Never edit one that has been applied; add the next number.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../api/_lib/env.js";
import { connectionString, newClient } from "../api/_lib/db.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, "db", "migrations");

loadDotEnv(ROOT);

if (!connectionString()) {
  console.log("[migrate] no DATABASE_URL: skipped");
  process.exit(0);
}

const client = newClient();
await client.connect();
try {
  // one migration run at a time, even when two deployments build together
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await client.query("SELECT name FROM public.schema_migrations")).rows.map(r => r.name));
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const name of files) {
    if (done.has(name)) continue;
    await client.query("BEGIN");
    try {
      await client.query(fs.readFileSync(path.join(DIR, name), "utf8"));
      await client.query("INSERT INTO public.schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`${name}: ${err.message}`);
    }
    console.log(`[migrate] applied ${name}`);
    applied++;
  }
  console.log(`[migrate] ${applied ? `${applied} applied` : "up to date"} (${files.length} total)`);
} finally {
  await client.end();
}
