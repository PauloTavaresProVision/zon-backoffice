import { KeyRound, Tv } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { canEdit, requireUser } from "@/lib/auth/session";
import { currentGrid } from "@/lib/boxes/grid";
import { boxStats, listBoxes, pendingEnrollments } from "@/lib/boxes/queries";
import { boxView, parseBoxFilter, type BoxFilter } from "@/lib/boxes/view";
import { env } from "@/lib/env";
import { ago, int } from "@/lib/format";
import { ApproveBox } from "@/components/approve-box";
import { UrlSearch } from "@/components/controls";
import { BOX_STATE, Pill } from "@/components/status";
import { Empty, flatParams, Pager, pageParam, withParams, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Boxes" };

const PAGE = 25;
const CHIPS: { id: BoxFilter; label: string; key: "total" | "online" | "offline" | "blocked" }[] = [
  { id: "all", label: "Todas", key: "total" },
  { id: "online", label: "Ligadas", key: "online" },
  { id: "offline", label: "Sem contacto", key: "offline" },
  { id: "blocked", label: "Bloqueadas", key: "blocked" },
];

export default async function BoxesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = flatParams(await searchParams);
  const filter = parseBoxFilter(sp.estado);
  const q = (sp.q ?? "").slice(0, 80);
  const page = pageParam(sp.pagina);
  const editor = canEdit(user);
  const [stats, { rows, total }, pending, grid] = await Promise.all([
    boxStats(),
    listBoxes({ filter, q, page, pageSize: PAGE }),
    pendingEnrollments(20),
    currentGrid(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const from = total ? (page - 1) * PAGE + 1 : 0;
  const host = new URL(env().APP_URL).host;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Clientes</p>
          <h1>Boxes</h1>
          <p className="sub"><span className={`dot${stats.online ? "" : " off"}`} />{int(stats.total)} registada{stats.total === 1 ? "" : "s"} · {int(stats.online)} ligada{stats.online === 1 ? "" : "s"} agora</p>
        </div>
      </div>

      <article className="card">
        <div className="stat-strip">
          <div className="stat-cell"><small><Tv className="ico sm" aria-hidden />Total</small><strong>{int(stats.total)}</strong><span>aprovadas</span></div>
          <div className="stat-cell"><small><span className="dot" />Ligadas</small><strong>{int(stats.online)}</strong><span>app aberta agora</span></div>
          <div className="stat-cell"><small><span className="dot off" />Sem contacto</small><strong>{int(stats.offline)}</strong><span>há mais de 3 min</span></div>
          <div className="stat-cell"><small><span className="dot crit" />Bloqueadas</small><strong>{int(stats.blocked)}</strong><span>à mão ou cliente desativado</span></div>
          <div className="stat-cell"><small><span className="dot warn" />Por aprovar</small><strong>{int(stats.pending)}</strong><span>pedidos de ativação</span></div>
        </div>
      </article>

      {pending.total ? (
        <article className="card approval mt">
          <div className="approval-head">
            <span className="kpi-icon"><KeyRound className="ico sm" aria-hidden /></span>
            <div className="grow" style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ fontSize: 14.5 }}>Pedidos de ativação</h2>
              <p className="muted" style={{ fontSize: 12.5 }}>Escolha o cliente e escreva o código da instalação que aparece no ecrã da box. Cada chave só serve para a box que a gerou.</p>
            </div>
            {pending.total > pending.rows.length ? <span className="tag">{int(pending.rows.length)} de {int(pending.total)}</span> : null}
          </div>
          {pending.rows.map(({ enrollment: x, existingCustomer }) => (
            <div className="approval-item wide" key={x.id}>
              <div><strong className="mono">{x.serial}</strong><small>{x.model ?? "Modelo desconhecido"}</small></div>
              <div className="hide-sm">
                <strong>{ago(x.lastSeenAt)}</strong>
                <small>{x.serialSource === "android" ? "Serial lido do Android" : "Serial escrito da etiqueta"}{existingCustomer ? ` · reinstalação (era de ${existingCustomer})` : ""}</small>
              </div>
              {editor ? <ApproveBox enrollmentId={x.id} serial={x.serial} /> : <span className="muted" style={{ fontSize: 12.5 }}>Só operadores aprovam</span>}
            </div>
          ))}
        </article>
      ) : null}

      <div className="chips scroll-x mt" role="group" aria-label="Filtrar por estado">
        {CHIPS.map((c) => (
          <Link key={c.id} className={`chip${filter === c.id ? " on" : ""}`} href={withParams("/boxes", sp, { estado: c.id, pagina: null })} scroll={false}>
            {c.label} <b>{int(stats[c.key])}</b>
          </Link>
        ))}
      </div>

      <article className="card mt">
        <div className="toolbar">
          <UrlSearch params={sp} placeholder="Serial, modelo, cliente ou n.º IXC" label="Pesquisar boxes" />
        </div>
        <div className="table-wrap">
          <table className="data responsive">
            <thead><tr><th>Box</th><th>Cliente</th><th>Grelha</th><th>Estado</th><th>App</th><th>Último contacto</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(({ box: x, customer: c }) => {
                const v = boxView(x, c);
                const device = v === "online" ? "" : v === "blocked" || v === "disabled" ? " blocked" : " off";
                const cell = (
                  <>
                    <span className={`box-device sm${device}`}><Tv className="ico sm" aria-hidden /></span>
                    <div><strong className="mono">{x.serial}</strong><small>{x.model ?? "—"}</small></div>
                  </>
                );
                return (
                  <tr key={x.id}>
                    <td className="o1">
                      {c ? <Link className="cell-main row-link" href={`/clientes/${c.id}`}>{cell}</Link> : <div className="cell-main">{cell}</div>}
                    </td>
                    <td className="o3"><div><span>{c?.name ?? "Sem cliente"}</span>{c ? <span className="cell-sub">IXC {c.ixcId}</span> : null}</div></td>
                    <td className="hide-sm">
                      {x.gridVersion ? <div><span>v{x.gridVersion}</span><span className="cell-sub">{x.gridVersion === grid.version ? "atualizada" : `a passar para v${grid.version}`}</span></div> : <span className="muted">—</span>}
                    </td>
                    <td className="o2 right"><Pill s={BOX_STATE[v]} /></td>
                    <td className="hide-sm">{x.appVersion ? <div><span className="mono">{x.appVersion}</span>{x.osVersion ? <span className="cell-sub">Android {x.osVersion}</span> : null}</div> : <span className="muted">—</span>}</td>
                    <td className="o4 right"><span className="muted">{x.lastSeenAt ? ago(x.lastSeenAt) : "nunca"}</span></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6}>
                  <Empty Icon={Tv}>
                    {stats.total ? "Nenhuma box corresponde aos filtros." : <>Ainda não há boxes. Na box, a app ZON TV pede o servidor de gestão (<span className="mono">https://{host}</span>) e o serial; o pedido aparece aqui para aprovar.</>}
                  </Empty>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{total ? `A mostrar ${int(from)}–${int(from + rows.length - 1)} de ${int(total)}` : "Sem resultados"} · {grid.name.toLowerCase()} v{grid.version} ({int(grid.channels.length)} canais)</span>
          <Pager page={page} pages={pages} href={(p) => withParams("/boxes", sp, { pagina: p })} />
        </div>
      </article>
    </>
  );
}
