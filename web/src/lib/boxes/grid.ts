import { asc, count, desc, eq, isNull } from "drizzle-orm";
import { address } from "@/lib/channels/rules";
import { db, schema } from "@/lib/db";
import type { GridChannel } from "@/lib/db/schema";
import BASE_GRID from "./base-grid.json";

/** O que uma box recebe: version é o número global da versão publicada, number a versão dentro da grelha. */
export type Grid = { version: number; number: number; gridId: number | null; name: string; channels: GridChannel[] };

const BASE: GridChannel[] = BASE_GRID;
const BASE_NAME = "Grelha base";
const FALLBACK: Grid = { version: 0, number: 0, gridId: null, name: BASE_NAME, channels: BASE };

/**
 * Cria o catálogo e a grelha base na primeira vez. Corre na migração, antes de a app arrancar.
 * Uma versão publicada antes do editor passa a ser a v1 da grelha base.
 */
export async function ensureCatalog(): Promise<string[]> {
  const done: string[] = [];
  const r = schema.gridReleases;
  await db().transaction(async (tx) => {
    const legacy = await tx.select().from(r).where(isNull(r.gridId)).orderBy(asc(r.version));
    const [{ n: channels } = { n: 0 }] = await tx.select({ n: count() }).from(schema.channels);
    if (!channels) {
      const seen = new Set<string>();
      const rows = [...BASE, ...legacy.flatMap((x) => x.channels)].filter((c) => !seen.has(address(c)) && seen.add(address(c)));
      await tx.insert(schema.channels).values(rows.map((c) => ({ name: c.name, ip: c.ip, port: c.port, category: c.category }))).onConflictDoNothing();
      done.push(`catálogo criado com ${rows.length} canais`);
    }
    const [{ n: grids } = { n: 0 }] = await tx.select({ n: count() }).from(schema.grids);
    if (grids) return;
    const byAddress = new Map((await tx.select().from(schema.channels)).map((c) => [address(c), c.id]));
    const idsOf = (list: GridChannel[]) => list.map((c) => byAddress.get(address(c))).filter((id): id is number => id !== undefined);
    const [grid] = await tx.insert(schema.grids).values({ name: BASE_NAME, isDefault: true }).returning({ id: schema.grids.id });
    if (!grid) throw new Error("Não foi possível criar a grelha base.");
    if (legacy.length) {
      for (const [i, x] of legacy.entries()) {
        await tx.update(r).set({ gridId: grid.id, number: i + 1, channelIds: idsOf(x.channels) }).where(eq(r.version, x.version));
      }
    } else {
      await tx.insert(r).values({ gridId: grid.id, number: 1, name: BASE_NAME, channels: BASE, channelIds: idsOf(BASE) });
    }
    done.push(!legacy.length ? "grelha base publicada para as boxes"
      : legacy.length === 1 ? "grelha base criada com a versão já publicada" : `grelha base criada com as ${legacy.length} versões já publicadas`);
  });
  return done;
}

/* ---------- Que grelha recebe cada box ---------- */

export type GridSnapshot = {
  // Última versão publicada de cada grelha
  byGrid: Map<number, Grid>;
  defaultId: number | null;
  latest: Grid | null;
  // Todas as versões, para mostrar a que cada box tem
  labels: Map<number, { gridId: number | null; name: string; number: number }>;
};

// As boxes sincronizam a cada minuto: as grelhas ficam 30 s em memória (ou até à próxima publicação).
let cache: { at: number; snap: Promise<GridSnapshot> } | null = null;

export function clearGridCache() {
  cache = null;
}

async function load(): Promise<GridSnapshot> {
  const r = schema.gridReleases;
  const g = schema.grids;
  const [latestRows, all, [def]] = await Promise.all([
    db().selectDistinctOn([r.gridId]).from(r).orderBy(r.gridId, desc(r.version)),
    db().select({ version: r.version, gridId: r.gridId, number: r.number, grid: g.name, name: r.name }).from(r).leftJoin(g, eq(g.id, r.gridId)),
    db().select({ id: g.id }).from(g).where(eq(g.isDefault, true)).limit(1),
  ]);
  const byGrid = new Map<number, Grid>();
  let latest: Grid | null = null;
  for (const x of latestRows) {
    const grid: Grid = { version: x.version, number: x.number, gridId: x.gridId, name: x.name, channels: x.channels };
    if (x.gridId !== null) byGrid.set(x.gridId, grid);
    if (!latest || grid.version > latest.version) latest = grid;
  }
  const labels = new Map(all.map((x) => [x.version, { gridId: x.gridId, name: x.grid ?? x.name, number: x.number }]));
  return { byGrid, defaultId: def?.id ?? null, latest, labels };
}

export function gridSnapshot(): Promise<GridSnapshot> {
  if (cache && Date.now() - cache.at < 30_000) return cache.snap;
  const snap = load();
  cache = { at: Date.now(), snap };
  snap.catch(() => { if (cache?.snap === snap) cache = null; });
  return snap;
}

/** A grelha do plano; se não tiver (ou nunca foi publicada), a predefinida; senão a última publicada; senão a base. */
export function resolveGrid(s: GridSnapshot, gridId: number | null | undefined): Grid {
  return (gridId != null ? s.byGrid.get(gridId) : undefined)
    ?? (s.defaultId !== null ? s.byGrid.get(s.defaultId) : undefined)
    ?? s.latest
    ?? FALLBACK;
}

export async function gridFor(gridId: number | null | undefined): Promise<Grid> {
  return resolveGrid(await gridSnapshot(), gridId);
}

/** Nome curto de uma versão que uma box diz ter: "Grelha base v3". */
export function versionLabel(s: GridSnapshot, version: number | null | undefined): string | null {
  if (!version) return null;
  const l = s.labels.get(version);
  return l ? `${l.name} v${l.number}` : `versão ${version}`;
}
