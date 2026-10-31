"use client";

import { CircleAlert, History, ListPlus, Settings2, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import type { ActionResult } from "@/lib/action";
import { dateTime } from "@/lib/format";
import { createGrid, deleteGrid, renameGrid, restoreRelease, setDefaultGrid, setGridPlans } from "./actions";

export type TvPlan = { id: number; name: string; active: boolean; gridId: number | null; gridName: string | null };
export type Release = { version: number; number: number; size: number; at: string; by: string | null };

/** Corre uma ação e mostra o resultado; devolve se correu bem. */
function useRun() {
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult>, after?: (r: ActionResult) => void) => start(async () => {
    const r = await action();
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) after?.(r);
  });
  return [pending, run] as const;
}

export function NewGridButton({ grids, from }: { grids: { id: number; name: string }[]; from: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const close = () => { setOpen(false); setError(undefined); };
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}><ListPlus className="ico sm" aria-hidden />Nova grelha</button>
      {open ? (
        <Modal title="Nova grelha" sub="Fica em rascunho até ser publicada; depois escolha os planos que a recebem" onClose={close} width={480}>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              start(async () => {
                const r = await createGrid({}, form);
                if (r.error || !r.id) return setError(r.error ?? "Não foi possível criar a grelha.");
                toast("Grelha criada", "ok");
                close();
                router.push(`/canais?grelha=${r.id}`);
              });
            }}
          >
            <div className="field span-2">
              <label htmlFor="g-name">Nome</label>
              <input className="input" id="g-name" name="name" required minLength={2} maxLength={60} placeholder="Ex.: TV Essencial" autoFocus />
            </div>
            <div className="field span-2">
              <label htmlFor="g-copy">Começar com</label>
              <select className="select" id="g-copy" name="copy" defaultValue={from ?? ""}>
                {grids.map((x) => <option key={x.id} value={x.id}>Os canais de {x.name}</option>)}
                <option value="">Grelha vazia</option>
              </select>
            </div>
            {error ? <div className="span-2 form-error" role="alert"><CircleAlert className="ico sm" aria-hidden />{error}</div> : null}
            <div className="span-2 btn-row end">
              <button type="button" className="btn" onClick={close}>Cancelar</button>
              <button type="submit" className={`btn primary${pending ? " busy" : ""}`} disabled={pending}>Criar</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** Nome, planos, predefinida, versões e apagar. Publicar e escolher planos mudam as boxes: só administradores. */
export function GridSettingsButton({ grid, plans, history, canEdit, isAdmin }: {
  grid: { id: number; name: string; isDefault: boolean; published: boolean };
  plans: TvPlan[]; history: Release[]; canEdit: boolean; isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(grid.name);
  const [picked, setPicked] = useState(() => new Set(plans.filter((p) => p.gridId === grid.id).map((p) => p.id)));
  const [pending, run] = useRun();
  const mine = plans.filter((p) => p.gridId === grid.id).map((p) => p.id);
  const plansChanged = mine.length !== picked.size || mine.some((id) => !picked.has(id));
  return (
    <>
      <button type="button" className="link" onClick={() => setOpen(true)}><Settings2 className="ico xs" aria-hidden />Definições</button>
      {open ? (
        <Modal title={grid.name} sub="Definições da grelha" onClose={() => setOpen(false)} width={620}>
          <div className="settings-stack">
            <section>
              <h3>Nome</h3>
              <div className="inline-form">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Nome da grelha" disabled={!canEdit} />
                {canEdit ? <button type="button" className="btn" disabled={pending || name.trim() === grid.name} onClick={() => run(() => renameGrid(grid.id, name))}>Guardar</button> : null}
              </div>
            </section>

            <section>
              <h3>Planos que recebem esta grelha</h3>
              {plans.length ? (
                <div className="check-list">
                  {plans.map((p) => (
                    <label key={p.id} className="check-row">
                      <input type="checkbox" className="checkbox" checked={picked.has(p.id)} disabled={!isAdmin}
                        onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                      <span>{p.name}{!p.active ? " (inativo)" : ""}</span>
                      <small className="muted">{p.gridId === grid.id ? "esta grelha" : p.gridName ? `usa ${p.gridName}` : "usa a predefinida"}</small>
                    </label>
                  ))}
                </div>
              ) : <p className="muted">Não há planos com TV.</p>}
              <p className="muted form-note">
                {grid.published
                  ? "As boxes dos clientes destes planos passam a receber esta grelha no minuto seguinte. Os planos que tirar passam para a predefinida."
                  : "Ainda não publicada: até publicar, as boxes destes planos continuam com a grelha predefinida."}
              </p>
              {isAdmin ? <div className="btn-row end"><button type="button" className="btn" disabled={pending || !plansChanged} onClick={() => run(() => setGridPlans(grid.id, [...picked]))}>Guardar planos</button></div> : null}
            </section>

            <section>
              <h3>Predefinida</h3>
              {grid.isDefault
                ? <p className="muted"><Star className="ico xs" aria-hidden /> É a grelha das boxes cujo plano não tem grelha escolhida.</p>
                : (
                  <div className="inline-form">
                    <p className="muted grow">Recebem a predefinida as boxes cujo plano não tem grelha.</p>
                    {isAdmin ? <button type="button" className="btn" disabled={pending || !grid.published} title={grid.published ? undefined : "Publique primeiro"} onClick={() => run(() => setDefaultGrid(grid.id))}>Tornar predefinida</button> : null}
                  </div>
                )}
            </section>

            <section>
              <h3><History className="ico sm" aria-hidden />Versões publicadas</h3>
              {history.length ? (
                <div className="history">
                  {history.map((h, i) => (
                    <div className="history-row" key={h.version}>
                      <strong>v{h.number}</strong>
                      <span className="grow">{dateTime(new Date(h.at))}{h.by ? ` · ${h.by}` : ""} · {h.size} canais</span>
                      {i === 0 ? <span className="tag">atual</span> : canEdit ? (
                        <button type="button" className="btn xs" disabled={pending}
                          onClick={() => { if (window.confirm(`Pôr os canais da v${h.number} no rascunho? O rascunho atual é substituído.`)) run(() => restoreRelease(grid.id, h.version), () => setOpen(false)); }}>
                          Repor no rascunho
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : <p className="muted">Ainda não foi publicada.</p>}
            </section>

            {isAdmin && !grid.isDefault ? (
              <section>
                <h3>Apagar</h3>
                <div className="inline-form">
                  <p className="muted grow">{mine.length ? "Tire primeiro os planos desta grelha." : "Apaga a grelha e as versões publicadas."}</p>
                  <button type="button" className="btn danger" disabled={pending || mine.length > 0}
                    onClick={() => { if (window.confirm(`Apagar a grelha ${grid.name}?`)) run(() => deleteGrid(grid.id), () => { setOpen(false); router.push("/canais"); }); }}>
                    <Trash2 className="ico sm" aria-hidden />Apagar grelha
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
