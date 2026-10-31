"use client";

import { ChevronDown, ChevronUp, CircleCheck, GripVertical, Pencil, Plus, Search, Send, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { LogoTile } from "@/components/channels";
import { toast } from "@/components/toast";
import type { Logo } from "@/lib/channels/logos";
import { buildLineup, CATEGORIES, diffLineup, diffSummary, MAX_GRID, normName, sameIds, type CatalogChannel } from "@/lib/channels/rules";
import type { GridChannel } from "@/lib/db/schema";
import { discardDraft, publishGrid, saveDraft } from "./actions";

export type EditorChannel = CatalogChannel & { logo: Logo };
export type EditorGrid = {
  id: number; name: string; isDefault: boolean; rev: number;
  published: { number: number; version: number; ids: number[]; channels: GridChannel[] } | null;
  // Rascunho, se houver; senão a versão publicada
  initial: number[];
  boxes: { total: number; current: number };
  plans: string[];
};
export type PickerGrid = { id: number; name: string; pending: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Editor da grelha: biblioteca à esquerda, ordem da TV à direita. Cada alteração fica gravada no rascunho
 * (as boxes não veem nada) até alguém publicar.
 */
export function GridEditor({ grid, grids, channels, canEdit, canPublish, settings, newGrid }: {
  grid: EditorGrid; grids: PickerGrid[]; channels: EditorChannel[]; canEdit: boolean; canPublish: boolean; settings: ReactNode; newGrid: ReactNode;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const [ids, setIds] = useState(() => grid.initial.filter((id) => byId.get(id)?.active));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [flash, setFlash] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, start] = useTransition();
  const rev = useRef(grid.rev);
  const queued = useRef<number[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const pub = grid.published;
  const built = useMemo(() => buildLineup(ids, byId), [ids, byId]);
  const diff = useMemo(() => diffLineup(pub ? { ids: pub.ids, channels: pub.channels } : null, built), [pub, built]);
  const inPub = useMemo(() => new Set(pub?.ids ?? []), [pub]);
  const edited = useMemo(() => new Set(diff.edited), [diff]);
  const pending = pub ? diff.total > 0 : built.ids.length > 0;
  const hasDraft = !sameIds(ids, pub?.ids ?? []);
  const next = (pub?.number ?? 0) + 1;

  // Gravação do rascunho: uma de cada vez, a última alteração ganha
  function kick() {
    timer.current = undefined;
    const n = queued.current;
    queued.current = null;
    if (!n) return;
    chain.current = chain.current.then(async () => {
      try {
        const r = await saveDraft(grid.id, n, rev.current);
        if (r.ok) {
          rev.current = Number(r.value);
          if (!queued.current) setSave("saved");
          return;
        }
        toast(r.message, "error");
      } catch {
        toast("Sem ligação ao servidor: a última alteração não ficou gravada.", "error");
      }
      queued.current = null;
      setSave("idle");
      router.refresh();
    });
  }
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    kick();
    await chain.current;
  }
  function change(nextIds: number[]) {
    if (!canEdit) return;
    setIds(nextIds);
    setSave("saving");
    queued.current = nextIds;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(kick, 600);
  }

  useEffect(() => {
    if (save !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  useEffect(() => {
    if (flash === null) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${flash}"]`);
    el?.scrollIntoView({ block: "nearest" });
    const t = setTimeout(() => setFlash(null), 1300);
    return () => clearTimeout(t);
  }, [flash]);

  const move = (id: number, to: number) => {
    const rest = ids.filter((x) => x !== id);
    rest.splice(Math.max(0, Math.min(to, rest.length)), 0, id);
    if (!sameIds(rest, ids)) change(rest);
  };
  const add = (id: number) => {
    if (ids.length >= MAX_GRID) return toast(`A box aceita no máximo ${MAX_GRID} canais.`, "error");
    change([...ids, id]);
    setFlash(id);
  };

  const inGrid = new Set(ids);
  const term = normName(q);
  const library = channels.filter((c) => c.active && !inGrid.has(c.id) && (!cat || c.category === cat)
    && (!term || normName(`${c.name} ${c.category} ${c.ip}`).includes(term)));

  const publish = () => {
    const boxes = grid.boxes.total;
    const msg = [
      `Publicar ${grid.name} v${next}?`,
      `${plural(built.ids.length, "canal", "canais")}${pub ? ` · ${diffSummary(diff)}` : ""}${pub && diff.renumbered ? `\n${plural(diff.renumbered, "canal muda", "canais mudam")} de número na TV.` : ""}`,
      boxes ? `${plural(boxes, "box recebe", "boxes recebem")} esta grelha no próximo minuto.` : "Nenhuma box recebe esta grelha por agora.",
    ].join("\n\n");
    if (!window.confirm(msg)) return;
    start(async () => {
      await flush();
      const r = await publishGrid(grid.id, ids, rev.current);
      toast(r.message, r.ok ? "ok" : "error");
      if (!r.ok) router.refresh();
    });
  };

  const discard = () => {
    if (!window.confirm(pub ? `Descartar o rascunho e voltar à v${pub.number} publicada?` : "Descartar o rascunho? A grelha fica vazia.")) return;
    start(async () => {
      await flush();
      const r = await discardDraft(grid.id, rev.current);
      toast(r.message, r.ok ? "ok" : "error");
      if (!r.ok) router.refresh();
    });
  };

  const pill = pending
    ? <span className="pill gold"><Pencil className="ico" aria-hidden />Rascunho v{next} · {pub ? plural(diff.total, "alteração", "alterações") : plural(built.ids.length, "canal", "canais")}</span>
    : pub
      ? <span className="pill good"><CircleCheck className="ico" aria-hidden />Publicada v{pub.number}</span>
      : <span className="pill plain">Grelha vazia</span>;

  return (
    <>
      <div className="editor-head">
        <div className="seg grid-picker" role="group" aria-label="Escolher grelha">
          {grids.map((x) => (
            <Link key={x.id} href={`/canais?grelha=${x.id}`} className={x.id === grid.id ? "on" : ""} aria-current={x.id === grid.id ? "page" : undefined}>
              {x.name}{x.pending ? <span className="dot-pending" title="Com alterações por publicar" /> : null}
            </Link>
          ))}
        </div>
        {newGrid}
        <div className="grow" />
        {pill}
        {canEdit ? (
          <div className="btn-row">
            <button type="button" className="btn" onClick={discard} disabled={!hasDraft || busy}><Undo2 className="ico sm" aria-hidden />Descartar</button>
            <button type="button" className={`btn primary${busy ? " busy" : ""}`} onClick={publish} disabled={!pending || !canPublish || busy}
              title={canPublish ? undefined : "Só um administrador pode publicar"}>
              <Send className="ico sm" aria-hidden />Publicar v{next}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid-editor">
        <article className="card">
          <div className="card-head"><div><h2>Biblioteca</h2><p className="sub">{plural(library.length, "canal", "canais")} fora desta grelha</p></div></div>
          <div className="toolbar lib-tools">
            <div className="input-icon">
              <Search className="ico sm" aria-hidden />
              <input className="input" type="search" placeholder="Procurar canal" aria-label="Procurar canal na biblioteca" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="select" aria-label="Categoria" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="ch-list">
            {library.map((c) => (
              <div className="ch-row" key={c.id}>
                <LogoTile name={c.name} logo={c.logo} />
                <div className="grow"><strong>{c.name}</strong><small>{c.category} · <span className="mono">{c.ip}:{c.port}</span></small></div>
                {canEdit ? <button type="button" className="btn xs" onClick={() => add(c.id)} aria-label={`Adicionar ${c.name} à grelha`}><Plus className="ico xs" aria-hidden />Adicionar</button> : null}
              </div>
            ))}
            {!library.length ? <div className="sr-empty">{q || cat ? "Nenhum canal encontrado." : "Todos os canais ativos estão nesta grelha."}</div> : null}
          </div>
        </article>

        <article className="card">
          <div className="lineup-bar">
            <span>
              <b style={{ color: "var(--text)" }}>{grid.name}</b> · {plural(built.ids.length, "canal", "canais")} · {pub
                ? <>publicada v{pub.number} em {plural(grid.boxes.total, "box", "boxes")}{grid.boxes.total && grid.boxes.current < grid.boxes.total ? ` (${grid.boxes.current} já com a v${pub.number})` : ""}</>
                : "ainda não publicada"}
            </span>
            <span className="lineup-meta">
              {save === "saving" ? <span className="muted">A guardar…</span> : save === "saved" ? <span className="muted">Rascunho guardado</span> : null}
              {settings}
            </span>
          </div>
          <div className="lineup-sub">
            <span>{grid.plans.length ? <>Planos: {grid.plans.join(", ")}</> : "Nenhum plano escolheu esta grelha"}{grid.isDefault ? " · predefinida (planos sem grelha)" : ""}</span>
            {pending && pub ? <span className="lineup-diff">Por publicar: {diffSummary(diff)}{diff.renumbered ? ` · ${plural(diff.renumbered, "canal muda", "canais mudam")} de número` : ""}</span> : null}
          </div>
          <div className="ch-list" ref={list} aria-label="Ordem dos canais na grelha" onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}>
            {ids.map((id, i) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <div
                  key={id}
                  data-id={id}
                  className={`ch-row${flash === id ? " added" : ""}${over === id && dragging !== id ? " drop-above" : ""}${dragging === id ? " dragging" : ""}`}
                  draggable={canEdit}
                  onDragStart={(e) => { drag.current = id; setDragging(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(id)); }}
                  onDragOver={(e) => { if (drag.current === null) return; e.preventDefault(); if (over !== id) setOver(id); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const d = drag.current;
                    drag.current = null;
                    setDragging(null);
                    setOver(null);
                    if (d === null || d === id) return;
                    const rest = ids.filter((x) => x !== d);
                    rest.splice(rest.indexOf(id), 0, d);
                    change(rest);
                  }}
                  onDragEnd={() => { drag.current = null; setDragging(null); setOver(null); }}
                >
                  {canEdit ? <span className="handle" aria-hidden><GripVertical className="ico sm" /></span> : null}
                  {canEdit ? (
                    <input
                      key={`${id}:${i}`}
                      className="pos"
                      type="number"
                      min={1}
                      max={ids.length}
                      defaultValue={i + 1}
                      aria-label={`Número de ${c.name} na TV`}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
                      onBlur={(e) => {
                        const n = Number(e.currentTarget.value);
                        if (Number.isInteger(n) && n >= 1 && n !== i + 1) move(id, n - 1);
                        else e.currentTarget.value = String(i + 1);
                      }}
                    />
                  ) : <span className="pos pos-ro">{i + 1}</span>}
                  <LogoTile name={c.name} logo={c.logo} />
                  <div className="grow">
                    <strong>{c.name}</strong>
                    <small>
                      {c.category}
                      {pub && !inPub.has(id) ? <span className="row-flag">novo</span> : null}
                      {edited.has(id) ? <span className="row-flag">editado</span> : null}
                    </small>
                  </div>
                  {canEdit ? (
                    <div className="row-acts">
                      <button type="button" className="icon-btn sm" onClick={() => move(id, i - 1)} disabled={i === 0} aria-label={`Subir ${c.name}`}><ChevronUp className="ico sm" aria-hidden /></button>
                      <button type="button" className="icon-btn sm" onClick={() => move(id, i + 1)} disabled={i === ids.length - 1} aria-label={`Descer ${c.name}`}><ChevronDown className="ico sm" aria-hidden /></button>
                      <button type="button" className="icon-btn sm" onClick={() => change(ids.filter((x) => x !== id))} aria-label={`Tirar ${c.name} da grelha`}><X className="ico sm" aria-hidden /></button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!ids.length ? <div className="sr-empty">Grelha vazia. Adicione canais a partir da biblioteca.</div> : null}
          </div>
        </article>
      </div>
    </>
  );
}
