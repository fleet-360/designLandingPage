// Postgres (Neon in production, attached through Vercel → Storage, which sets DATABASE_URL).
// One database for every module; each module keeps its tables in its own schema (pay, sign, ...).
import pg from "pg";

// DATE columns as "YYYY-MM-DD" strings: the driver would otherwise make them a Date at local
// midnight, which is the previous day in UTC for Israel.
pg.types.setTypeParser(1082, (v) => v);

export function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

export function newClient() {
  return new pg.Client({ connectionString: connectionString() });
}

// One small pool per function instance, kept across invocations while the instance is warm.
function pool() {
  if (!globalThis.__proAlgoPool) {
    globalThis.__proAlgoPool = new pg.Pool({
      connectionString: connectionString(),
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // An idle connection the database closed: the pool drops it. Without a listener the error would end the instance.
    globalThis.__proAlgoPool.on("error", (err) => console.warn("[db] idle connection dropped:", err.message));
  }
  return globalThis.__proAlgoPool;
}

// Neon closes idle connections, and a frozen function instance finds out only when it next uses one, so the
// first query after a quiet spell can fail on a dead connection. The pool throws that connection away; the query
// is tried again on another one. A connect that never got through is safe to repeat for any statement; a dead
// connection mid-query only for a read, since a write may already have gone through.
const CONNECT_FAILED = /timeout exceeded when trying to connect|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i;
const CONNECTION_LOST = /Connection terminated|Connection ended|ECONNRESET|EPIPE|terminating connection|connection error/i;

export function retryable(err, text) {
  const msg = `${err?.message || ""} ${err?.code || ""}`;
  return CONNECT_FAILED.test(msg) || (CONNECTION_LOST.test(msg) && /^\s*SELECT\b/i.test(text));
}

export async function query(text, params = []) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await pool().query(text, params);
    } catch (err) {
      if (attempt >= 4 || !retryable(err, text)) throw err;
      console.warn(`[db] retrying after: ${err.message}`);
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }
}

// Runs fn(client) in one transaction: everything it wrote is kept, or nothing is.
export async function transaction(fn) {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
