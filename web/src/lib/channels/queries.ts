import "server-only";
import { asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { resolveGrid, type GridSnapshot } from "@/lib/boxes/grid";
import { db, schema } from "@/lib/db";
import type { GridChannel } from "@/lib/db/schema";
import { address, type CatalogChannel } from "./rules";

const ch = schema.channels;
const g = schema.grids;
const r = schema.gridReleases;

export async function catalog(): Promise<CatalogChannel[]> {
  return db().select({ id: ch.id, name: ch.name, ip: ch.ip, port: ch.port, category: ch.category, active: ch.active }).from(ch).orderBy(asc(ch.id));
}

export type Published = { version: number; number: number; ids: number[]; channels: GridChannel[]; at: Date; by: string | null };

export type GridInfo = {
  id: number; name: string; isDefault: boolean; rev: number;
  draft: number[] | null; draftAt: Date | null; draftBy: string | null;
  published: Published | null;
  plans: { id: number; name: string }[];
};

/** Ids da versão publicada; as versões de antes do editor não os têm e vão-se buscar pelo endereço. */
export function releaseIds(x: { channelIds: number[] | null; channels: GridChannel[] }, byAddress: Map<string, number>): number[] {
  if (x.channelIds && x.channelIds.length === x.channels.length) return x.channelIds;
  return x.channels.map((c) => byAddress.get(address(c)) ?? -1);
}

export async function gridsInfo(list: CatalogChannel[]): Promise<GridInfo[]> {
  const draftUser = alias(schema.users, "draft_user");
  const [rows, latest, plans] = await Promise.all([
    db().select({ grid: g, draftBy: draftUser.name }).from(g).leftJoin(draftUser, eq(draftUser.id, g.draftUpdatedBy)).orderBy(desc(g.isDefault), asc(g.name)),
    db().selectDistinctOn([r.gridId], { release: r, by: schema.users.name }).from(r)
      .leftJoin(schema.users, eq(schema.users.id, r.publishedBy))
      .where(isNotNull(r.gridId)).orderBy(r.gridId, desc(r.version)),
    db().select({ id: schema.plans.id, name: schema.plans.name, gridId: schema.plans.gridId }).from(schema.plans).where(isNotNull(schema.plans.gridId)).orderBy(asc(schema.plans.name)),
  ]);
  const byAddress = new Map(list.map((c) => [address(c), c.id]));
  const pub = new Map(latest.map(({ release: x, by }) => [x.gridId, {
    version: x.version, number: x.number, ids: releaseIds(x, byAddress), channels: x.channels, at: x.createdAt, by,
  } satisfies Published]));
  return rows.map(({ grid: x, draftBy }) => ({
    id: x.id, name: x.name, isDefault: x.isDefault, rev: x.rev,
    draft: x.draft, draftAt: x.draftUpdatedAt, draftBy,
    published: pub.get(x.id) ?? null,
    plans: plans.filter((p) => p.gridId === x.id).map(({ id, name }) => ({ id, name })),
  }));
}

/** Versões publicadas de uma grelha, as mais recentes primeiro. */
export async function gridHistory(gridId: number, limit = 12) {
  return db().select({ version: r.version, number: r.number, size: sql<number>`jsonb_array_length(${r.channels})`, at: r.createdAt, by: schema.users.name })
    .from(r)
    .leftJoin(schema.users, eq(schema.users.id, r.publishedBy))
    .where(eq(r.gridId, gridId))
    .orderBy(desc(r.version))
    .limit(limit);
}

/** Boxes associadas a clientes, pela grelha que recebem; current = as que já têm a última versão. */
export async function boxesPerGrid(snap: GridSnapshot): Promise<Map<number | null, { total: number; current: number }>> {
  const rows = await db()
    .select({ planGrid: schema.plans.gridId, version: schema.boxes.gridVersion, n: count() })
    .from(schema.boxes)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.boxes.customerId))
    .leftJoin(schema.plans, eq(schema.plans.id, schema.customers.planId))
    .groupBy(schema.plans.gridId, schema.boxes.gridVersion);
  const out = new Map<number | null, { total: number; current: number }>();
  for (const x of rows) {
    const grid = resolveGrid(snap, x.planGrid);
    const t = out.get(grid.gridId) ?? { total: 0, current: 0 };
    t.total += x.n;
    if (x.version === grid.version) t.current += x.n;
    out.set(grid.gridId, t);
  }
  return out;
}

export async function planGridId(planId: number | null | undefined): Promise<number | null> {
  if (!planId) return null;
  const [p] = await db().select({ gridId: schema.plans.gridId }).from(schema.plans).where(eq(schema.plans.id, planId)).limit(1);
  return p?.gridId ?? null;
}

/** Planos com TV e a grelha de cada um, para escolher no editor. */
export async function tvPlans() {
  return db().select({ id: schema.plans.id, name: schema.plans.name, gridId: schema.plans.gridId, active: schema.plans.active })
    .from(schema.plans)
    .where(inArray(schema.plans.kind, ["tv", "internet_tv"]))
    .orderBy(asc(schema.plans.priceKz), asc(schema.plans.name));
}

/** Grelhas (rascunho ou publicada) que têm cada canal, para o catálogo. */
export function gridsByChannel(grids: GridInfo[]): Map<number, { id: number; name: string }[]> {
  const out = new Map<number, { id: number; name: string }[]>();
  for (const x of grids) {
    const ids = new Set([...(x.draft ?? []), ...(x.published?.ids ?? [])]);
    for (const id of ids) out.set(id, [...(out.get(id) ?? []), { id: x.id, name: x.name }]);
  }
  return out;
}

/** Nomes das grelhas onde o canal está (no rascunho ou na versão publicada). */
export async function channelInGrids(channelId: number): Promise<string[]> {
  const list = await gridsInfo(await catalog());
  return (gridsByChannel(list).get(channelId) ?? []).map((x) => x.name);
}
