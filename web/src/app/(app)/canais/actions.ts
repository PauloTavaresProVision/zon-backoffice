"use server";

import { and, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { attempt, positiveId, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/session";
import { clearGridCache } from "@/lib/boxes/grid";
import { catalog, channelInGrids, releaseIds } from "@/lib/channels/queries";
import {
  address, buildLineup, channelInput, diffLineup, diffSummary, guessCategory, lineupProblem, MAX_GRID, MAX_XML_BYTES, parseSdns, sameIds,
  type CatalogChannel,
} from "@/lib/channels/rules";
import { db, schema } from "@/lib/db";

const ch = schema.channels;
const g = schema.grids;
const r = schema.gridReleases;

const STALE = "Esta grelha foi alterada noutra janela ou por outra pessoa. A página foi atualizada: repita a última alteração.";

function refresh(all = false) {
  revalidatePath("/canais");
  if (!all) return;
  revalidatePath("/boxes");
  revalidatePath("/planos");
  revalidatePath("/definicoes");
  revalidatePath("/clientes/[id]", "page");
}

/** Para os formulários com useActionState: a mensagem de erro fica no estado, não num toast. */
async function guard<T extends { error?: string }>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Erro inesperado." };
  }
}

const gridName = (v: unknown) => {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) throw new Error("O nome da grelha tem de ter entre 2 e 60 caracteres.");
  return name;
};

/** Ids vindos do editor: inteiros, sem repetidos, de canais ativos do catálogo. */
function checkIds(raw: unknown, byId: Map<number, CatalogChannel>): number[] {
  if (!Array.isArray(raw) || raw.length > MAX_GRID) throw new Error(`Uma grelha tem no máximo ${MAX_GRID} canais.`);
  const ids = raw.map(Number);
  if (!ids.every((id) => Number.isInteger(id) && id > 0) || new Set(ids).size !== ids.length) throw new Error("Lista de canais inválida.");
  const gone = ids.filter((id) => !byId.get(id)?.active);
  if (gone.length) throw new Error("Um dos canais foi desativado entretanto. A página foi atualizada.");
  return ids;
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function lockGrid(tx: Tx, gridId: number, rev: unknown) {
  const [grid] = await tx.select().from(g).where(eq(g.id, positiveId(gridId))).for("update");
  if (!grid) throw new Error("Grelha não encontrada.");
  if (rev !== undefined && grid.rev !== Number(rev)) throw new Error(STALE);
  return grid;
}

async function latestRelease(tx: Tx, gridId: number) {
  const [x] = await tx.select().from(r).where(eq(r.gridId, gridId)).orderBy(desc(r.version)).limit(1);
  return x ?? null;
}

const byAddressOf = (list: CatalogChannel[]) => new Map(list.map((c) => [address(c), c.id]));

/* ---------- Catálogo ---------- */

export type ChannelFormState = { error?: string; done?: string; at?: number };

export async function saveChannel(_prev: ChannelFormState, form: FormData): Promise<ChannelFormState> {
  return guard(async () => {
    const user = await requireRole("operador");
    const id = form.get("id") ? positiveId(form.get("id")) : null;
    const input = channelInput({ name: form.get("name"), ip: form.get("ip"), port: form.get("port"), category: form.get("category") });
    const active = id ? form.get("active") === "on" : true;
    const [clash] = await db().select({ id: ch.id, name: ch.name }).from(ch)
      .where(and(eq(ch.ip, input.ip), eq(ch.port, input.port), id ? ne(ch.id, id) : undefined)).limit(1);
    if (clash) return { error: `O endereço ${input.ip}:${input.port} já é do canal ${clash.name}.` };

    if (!id) {
      await db().insert(ch).values({ ...input, active: true });
      await logActivity({ kind: "channel.created", userId: user.id, message: `Canal **${input.name}** criado por **${user.name}** (${input.ip}:${input.port})` });
      refresh();
      return { done: `${input.name} criado. Adicione-o às grelhas que o devem ter.`, at: Date.now() };
    }
    const [old] = await db().select().from(ch).where(eq(ch.id, id)).limit(1);
    if (!old) return { error: "Canal não encontrado." };
    const grids = await channelInGrids(id);
    if (!active && old.active && grids.length) {
      return { error: `Tire primeiro o canal das grelhas: ${grids.join(", ")}. Depois publique-as e volte a desativá-lo.` };
    }
    const changed = (["name", "ip", "port", "category"] as const).filter((k) => old[k] !== input[k]);
    if (!changed.length && old.active === active) return { done: "Sem alterações.", at: Date.now() };
    await db().update(ch).set({ ...input, active, updatedAt: new Date() }).where(eq(ch.id, id));
    const what = [
      ...(changed.length ? [changed.map((k) => ({ name: "nome", ip: "endereço", port: "porta", category: "categoria" })[k]).join(", ")] : []),
      ...(old.active !== active ? [active ? "reativado" : "desativado"] : []),
    ].join("; ");
    await logActivity({ kind: "channel.updated", userId: user.id, message: `Canal **${input.name}** alterado por **${user.name}**: ${what}`, meta: { channelId: id, before: old, after: { ...input, active } } });
    refresh();
    const tail = changed.length && grids.length ? ` Publique ${grids.length === 1 ? "a grelha" : "as grelhas"} ${grids.join(", ")} para chegar às boxes.` : "";
    return { done: `${input.name} guardado.${tail}`, at: Date.now() };
  });
}

export type ImportPreview = {
  file: string; total: number;
  added: string[]; renamed: { from: string; to: string }[]; reactivated: string[]; same: number; missing: string[];
};
export type ImportState = { error?: string; preview?: ImportPreview; done?: string; at?: number };

/** Lê o XML do headend: primeiro mostra o que muda; com apply=1 grava no catálogo (e, se pedido, no rascunho de uma grelha). */
export async function importChannels(_prev: ImportState, form: FormData): Promise<ImportState> {
  return guard(async () => {
    const user = await requireRole("operador");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Escolha o ficheiro XML do headend." };
    if (file.size > MAX_XML_BYTES) return { error: "O XML excede 900 KB." };
    const services = parseSdns(await file.text());
    const list = await catalog();
    const byAddress = new Map(list.map((c) => [address(c), c]));
    const inXml = new Set(services.map(address));
    const preview: ImportPreview = { file: file.name, total: services.length, added: [], renamed: [], reactivated: [], same: 0, missing: [] };
    for (const s of services) {
      const c = byAddress.get(address(s));
      if (!c) preview.added.push(s.name);
      else {
        if (c.name !== s.name) preview.renamed.push({ from: c.name, to: s.name });
        if (!c.active) preview.reactivated.push(s.name);
        if (c.name === s.name && c.active) preview.same++;
      }
    }
    preview.missing = list.filter((c) => c.active && !inXml.has(address(c))).map((c) => c.name);
    if (form.get("apply") !== "1") return { preview };

    const gridId = form.get("grid") ? positiveId(form.get("grid")) : null;
    const gridNameUsed = await db().transaction(async (tx) => {
      for (const s of services) {
        const c = byAddress.get(address(s));
        if (!c) await tx.insert(ch).values({ name: s.name, ip: s.ip, port: s.port, category: guessCategory(s.name) }).onConflictDoNothing();
        else if (c.name !== s.name || !c.active) await tx.update(ch).set({ name: s.name, active: true, updatedAt: new Date() }).where(eq(ch.id, c.id));
      }
      if (!gridId) return null;
      const grid = await lockGrid(tx, gridId, undefined);
      const ids = new Map((await tx.select({ id: ch.id, ip: ch.ip, port: ch.port }).from(ch)).map((c) => [address(c), c.id]));
      const draft = services.map((s) => ids.get(address(s))).filter((id): id is number => id !== undefined);
      await tx.update(g).set({ draft, rev: grid.rev + 1, draftUpdatedAt: new Date(), draftUpdatedBy: user.id }).where(eq(g.id, grid.id));
      return grid.name;
    });
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const parts = [
      count(preview.added.length, "novo", "novos"),
      `${preview.renamed.length} com nome novo`,
      ...(preview.reactivated.length ? [count(preview.reactivated.length, "reativado", "reativados")] : []),
    ];
    await logActivity({
      kind: "channel.imported",
      userId: user.id,
      message: `XML **${file.name.slice(0, 80)}** importado por **${user.name}**: ${parts.join(", ")}${gridNameUsed ? `; rascunho de **${gridNameUsed}** com a ordem do XML` : ""}`,
      meta: { total: services.length, added: preview.added.length, renamed: preview.renamed.length, gridId },
    });
    refresh();
    return { done: `Catálogo atualizado: ${parts.join(", ")}.${gridNameUsed ? ` O rascunho de ${gridNameUsed} tem agora a ordem do XML: reveja e publique.` : ""}`, at: Date.now() };
  });
}

/* ---------- Grelhas ---------- */

export type GridFormState = { error?: string; id?: number; at?: number };

export async function createGrid(_prev: GridFormState, form: FormData): Promise<GridFormState> {
  return guard(async () => {
    const user = await requireRole("operador");
    const name = gridName(form.get("name"));
    const [clash] = await db().select({ id: g.id }).from(g).where(sql`lower(${g.name}) = lower(${name})`).limit(1);
    if (clash) return { error: "Já existe uma grelha com este nome." };
    let draft: number[] | null = null;
    if (form.get("copy")) {
      const from = positiveId(form.get("copy"));
      const [src] = await db().select().from(g).where(eq(g.id, from)).limit(1);
      if (!src) return { error: "A grelha a copiar já não existe." };
      const [pub] = await db().select().from(r).where(eq(r.gridId, src.id)).orderBy(desc(r.version)).limit(1);
      draft = src.draft ?? (pub ? releaseIds(pub, byAddressOf(await catalog())).filter((id) => id > 0) : null);
    }
    const [grid] = await db().insert(g).values({ name, draft: draft?.length ? draft : null, draftUpdatedAt: new Date(), draftUpdatedBy: user.id }).returning({ id: g.id });
    if (!grid) throw new Error("Não foi possível criar a grelha.");
    await logActivity({ kind: "grid.created", userId: user.id, message: `Grelha **${name}** criada por **${user.name}**` });
    refresh();
    return { id: grid.id, at: Date.now() };
  });
}

export async function renameGrid(gridId: number, name: string): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const id = positiveId(gridId);
    const next = gridName(name);
    const [clash] = await db().select({ id: g.id }).from(g).where(and(sql`lower(${g.name}) = lower(${next})`, ne(g.id, id))).limit(1);
    if (clash) throw new Error("Já existe uma grelha com este nome.");
    const [old] = await db().select({ name: g.name }).from(g).where(eq(g.id, id)).limit(1);
    if (!old) throw new Error("Grelha não encontrada.");
    if (old.name === next) return "Sem alterações";
    await db().update(g).set({ name: next }).where(eq(g.id, id));
    await logActivity({ kind: "grid.updated", userId: user.id, message: `Grelha **${old.name}** passou a chamar-se **${next}** (${user.name})` });
    clearGridCache();
    refresh(true);
    return `Grelha renomeada para ${next}`;
  });
}

/** Grava o rascunho do editor. Devolve a nova revisão. Igual ao publicado, o rascunho deixa de existir. */
export async function saveDraft(gridId: number, ids: number[], rev: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const list = await catalog();
    const clean = checkIds(ids, new Map(list.map((c) => [c.id, c])));
    const next = await db().transaction(async (tx) => {
      const grid = await lockGrid(tx, gridId, rev);
      const pub = await latestRelease(tx, grid.id);
      const same = pub ? sameIds(clean, releaseIds(pub, byAddressOf(list))) : !clean.length;
      await tx.update(g).set({ draft: same ? null : clean, rev: grid.rev + 1, draftUpdatedAt: new Date(), draftUpdatedBy: user.id }).where(eq(g.id, grid.id));
      return grid.rev + 1;
    });
    return { message: "Rascunho guardado", value: String(next) };
  });
}

export async function discardDraft(gridId: number, rev: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const name = await db().transaction(async (tx) => {
      const grid = await lockGrid(tx, gridId, rev);
      await tx.update(g).set({ draft: null, rev: grid.rev + 1, draftUpdatedAt: new Date(), draftUpdatedBy: user.id }).where(eq(g.id, grid.id));
      return grid.name;
    });
    refresh();
    return `Rascunho de ${name} descartado`;
  });
}

/** Põe no rascunho os canais de uma versão anterior, para a voltar a publicar. */
export async function restoreRelease(gridId: number, version: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const list = await catalog();
    const active = new Set(list.filter((c) => c.active).map((c) => c.id));
    const msg = await db().transaction(async (tx) => {
      // Substitui o rascunho de propósito (o editor aberto recarrega): não confere a revisão
      const grid = await lockGrid(tx, gridId, undefined);
      const [old] = await tx.select().from(r).where(and(eq(r.version, positiveId(version)), eq(r.gridId, grid.id))).limit(1);
      if (!old) throw new Error("Versão não encontrada.");
      const ids = releaseIds(old, byAddressOf(list)).filter((id) => active.has(id));
      await tx.update(g).set({ draft: ids, rev: grid.rev + 1, draftUpdatedAt: new Date(), draftUpdatedBy: user.id }).where(eq(g.id, grid.id));
      const lost = old.channels.length - ids.length;
      return `Rascunho com os canais da v${old.number}${lost ? ` (${lost} já não estão no catálogo)` : ""}. Reveja e publique.`;
    });
    refresh();
    return msg;
  });
}

/** Publica a grelha: as boxes dos planos com esta grelha recebem-na na sincronização seguinte (até 1 minuto). */
export async function publishGrid(gridId: number, ids: number[], rev: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("admin");
    const list = await catalog();
    const byId = new Map(list.map((c) => [c.id, c]));
    const clean = checkIds(ids, byId);
    const lineup = buildLineup(clean, byId);
    const problem = lineupProblem(lineup.channels);
    if (problem) throw new Error(problem);
    const out = await db().transaction(async (tx) => {
      const grid = await lockGrid(tx, gridId, rev);
      const pub = await latestRelease(tx, grid.id);
      const before = pub ? { ids: releaseIds(pub, byAddressOf(list)), channels: pub.channels } : null;
      const diff = diffLineup(before, lineup);
      if (pub && !diff.total) throw new Error("Não há alterações para publicar.");
      const number = (pub?.number ?? 0) + 1;
      const [rel] = await tx.insert(r).values({
        gridId: grid.id, number, name: grid.name, channels: lineup.channels, channelIds: lineup.ids, publishedBy: user.id,
      }).returning({ version: r.version });
      await tx.update(g).set({ draft: null, rev: grid.rev + 1, draftUpdatedAt: new Date(), draftUpdatedBy: user.id }).where(eq(g.id, grid.id));
      return { grid, number, version: rel?.version ?? 0, diff };
    });
    clearGridCache();
    await logActivity({
      kind: "grid.published",
      userId: user.id,
      message: `Grelha **${out.grid.name} v${out.number}** publicada por **${user.name}**: ${lineup.channels.length} canais (${diffSummary(out.diff)})`,
      meta: {
        gridId: out.grid.id, version: out.version, number: out.number, channels: lineup.channels.length,
        added: out.diff.added.length, removed: out.diff.removed.length, moved: out.diff.moved, edited: out.diff.edited.length,
      },
    });
    refresh(true);
    return { message: `${out.grid.name} v${out.number} publicada: as boxes recebem-na no próximo minuto`, value: String(out.number) };
  });
}

/** Planos cujas boxes recebem esta grelha. Os que saem passam para a predefinida. */
export async function setGridPlans(gridId: number, planIds: number[]): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("admin");
    const p = schema.plans;
    const ids = Array.isArray(planIds) ? [...new Set(planIds.map(positiveId))] : [];
    const [grid] = await db().select().from(g).where(eq(g.id, positiveId(gridId))).limit(1);
    if (!grid) throw new Error("Grelha não encontrada.");
    const tv = ids.length ? await db().select({ id: p.id }).from(p).where(and(inArray(p.id, ids), inArray(p.kind, ["tv", "internet_tv"]))) : [];
    if (tv.length !== ids.length) throw new Error("Só os planos com TV têm grelha.");
    const names = await db().transaction(async (tx) => {
      await tx.update(p).set({ gridId: null }).where(and(eq(p.gridId, grid.id), ids.length ? notInArray(p.id, ids) : undefined));
      if (ids.length) await tx.update(p).set({ gridId: grid.id }).where(inArray(p.id, ids));
      return ids.length ? (await tx.select({ name: p.name }).from(p).where(inArray(p.id, ids))).map((x) => x.name) : [];
    });
    clearGridCache();
    await logActivity({
      kind: "grid.updated",
      userId: user.id,
      message: names.length ? `Grelha **${grid.name}** atribuída a ${names.map((n) => `**${n}**`).join(", ")} por **${user.name}**` : `Grelha **${grid.name}** sem planos (${user.name})`,
      meta: { gridId: grid.id, planIds: ids },
    });
    refresh(true);
    return names.length ? `${grid.name}: ${names.length} plano${names.length === 1 ? "" : "s"}` : `${grid.name} sem planos: essas boxes recebem a predefinida`;
  });
}

export async function setDefaultGrid(gridId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("admin");
    const name = await db().transaction(async (tx) => {
      const grid = await lockGrid(tx, gridId, undefined);
      if (!(await latestRelease(tx, grid.id))) throw new Error("Publique a grelha antes de a tornar predefinida.");
      await tx.update(g).set({ isDefault: false }).where(eq(g.isDefault, true));
      await tx.update(g).set({ isDefault: true }).where(eq(g.id, grid.id));
      return grid.name;
    });
    clearGridCache();
    await logActivity({ kind: "grid.updated", userId: user.id, message: `**${name}** passou a ser a grelha predefinida (${user.name})` });
    refresh(true);
    return `${name} é agora a grelha predefinida`;
  });
}

export async function deleteGrid(gridId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("admin");
    const [grid] = await db().select().from(g).where(eq(g.id, positiveId(gridId))).limit(1);
    if (!grid) throw new Error("Grelha não encontrada.");
    if (grid.isDefault) throw new Error("A grelha predefinida não pode ser apagada. Escolha outra predefinida primeiro.");
    const [plan] = await db().select({ name: schema.plans.name }).from(schema.plans).where(eq(schema.plans.gridId, grid.id)).limit(1);
    if (plan) throw new Error(`O plano ${plan.name} usa esta grelha. Tire-lhe a grelha primeiro.`);
    await db().delete(g).where(eq(g.id, grid.id));
    clearGridCache();
    await logActivity({ kind: "grid.deleted", userId: user.id, message: `Grelha **${grid.name}** apagada por **${user.name}**` });
    refresh(true);
    return `Grelha ${grid.name} apagada`;
  });
}

