// Applies db/migrations/*.sql in name order, each once, each in its own transaction.
// Runs after the site build on Vercel (see vercel.json) and by hand: `npm run migrate`.
// Without a database URL it does nothing: the domains built from this repo that have no
// database still deploy.
//
// Several Vercel projects build this repo against the same database at the same time, so each
// migration takes a transaction-level advisory lock and re-checks whether it was applied. It
// connects directly (DATABASE_URL_UNPOOLED, set by the Neon integration) when it can: Neon's
// pooled address is PgBouncer in transaction mode, where session-level locks are not reliable.
//
// Migrations only ever add. Never edit one that has been applied; add the next number.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDotEnv } from "../api/_lib/env.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, "db", "migrations");
const LOCK_KEY = 727275;

loadDotEnv(ROOT);
const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
  || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!url) {
  console.log("[migrate] no DATABASE_URL: skipped");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await client.connect();
try {
  await client.query("SET lock_timeout = '120s'");
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`).catch((err) => {
    // two builds creating it at once: the other one won
    if (err.code !== "23505" && err.code !== "42P07") throw err;
  });
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const name of files) {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const done = await client.query("SELECT 1 FROM public.schema_migrations WHERE name = $1", [name]);
      if (done.rowCount) {
        await client.query("COMMIT");
        continue;
      }
      await client.query(fs.readFileSync(path.join(DIR, name), "utf8"));
      await client.query("INSERT INTO public.schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`[migrate] applied ${name}`);
      applied++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`${name}: ${err.message}`);
    }
  }
  console.log(`[migrate] ${applied ? `${applied} applied` : "up to date"} (${files.length} total)`);
} finally {
  await client.end();
}
