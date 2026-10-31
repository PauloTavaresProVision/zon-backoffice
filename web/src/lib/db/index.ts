import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// Uma só pool por processo, também com o recarregamento do `next dev`.
const g = globalThis as unknown as { __zonPool?: Pool; __zonDb?: Db };

export function pool(): Pool {
  if (!g.__zonPool) {
    g.__zonPool = new Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  }
  return g.__zonPool;
}

export function db(): Db {
  if (!g.__zonDb) g.__zonDb = drizzle(pool(), { schema });
  return g.__zonDb;
}

export { schema };
