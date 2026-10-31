import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { GridChannel } from "@/lib/db/schema";
import BASE_GRID from "./base-grid.json";

export type Grid = { version: number; name: string; channels: GridChannel[] };

const BASE: GridChannel[] = BASE_GRID;
const BASE_NAME = "Grelha base";

/** Publica a grelha base se ainda não houver nenhuma. Corre na migração, antes de a app arrancar. */
export async function ensureBaseGrid(): Promise<boolean> {
  const rows = await db().execute(sql`
    insert into ${schema.gridReleases} (name, channels)
    select ${BASE_NAME}, ${JSON.stringify(BASE)}::jsonb
    where not exists (select 1 from ${schema.gridReleases})
    returning version`);
  return rows.rowCount === 1;
}

// As boxes sincronizam a cada minuto: a grelha fica 30 s em memória.
let cache: { at: number; grid: Grid } | null = null;

export async function currentGrid(): Promise<Grid> {
  if (cache && Date.now() - cache.at < 30_000) return cache.grid;
  const [g] = await db().select().from(schema.gridReleases).orderBy(desc(schema.gridReleases.version)).limit(1);
  const grid = g ? { version: g.version, name: g.name, channels: g.channels } : { version: 0, name: BASE_NAME, channels: BASE };
  cache = { at: Date.now(), grid };
  return grid;
}
