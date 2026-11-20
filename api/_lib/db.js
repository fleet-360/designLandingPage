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
  }
  return globalThis.__proAlgoPool;
}

export async function query(text, params = []) {
  return pool().query(text, params);
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
