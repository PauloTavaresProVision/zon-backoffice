import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { clientState, parseClientFilter, type ClientFilter } from "@/lib/client-state";
import { db, schema } from "@/lib/db";
import { date, initials, int, isoDay, kz, phoneFmt, rel } from "@/lib/format";
import { clientCounts, listClients } from "@/lib/queries";
import { UrlSearch, UrlSelect } from "@/components/controls";
import { CLIENT_STATE, Pill } from "@/components/status";
import { Empty, flatParams, Pager, pageParam, withParams, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Clientes" };

const PAGE = 25;
const CHIPS: { id: ClientFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Ativos" },
  { id: "expiring", label: "A expirar" },
  { id: "late", label: "Em atraso" },
  { id: "inactive", label: "Inativos" },
];
const shortPlan = (name: string) => name.replace(/^ZON\s/, "");

export default async function ClientesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = flatParams(await searchParams);
  const filter = parseClientFilter(sp.estado);
  const q = (sp.q ?? "").slice(0, 80);
  const planId = Number(sp.plano) || null;
  const page = pageParam(sp.pagina);
  const today = isoDay();

  const [counts, { rows, total }, plans] = await Promise.all([
    clientCounts(today),
    listClients({ filter, q, planId, page, pageSize: PAGE }),
    db().select({ id: schema.plans.id, name: schema.plans.name }).from(schema.plans).orderBy(schema.plans.priceKz),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const from = total ? (page - 1) * PAGE + 1 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Clientes</p>
          <h1>Clientes</h1>
          <p className="sub"><span className="dot" />{int(counts.all)} clientes · os dados de contrato vêm do IXC</p>
        </div>
      </div>

      <div className="chips scroll-x" role="group" aria-label="Filtrar por estado">
        {CHIPS.map((c) => (
          <Link key={c.id} className={`chip${filter === c.id ? " on" : ""}`} href={withParams("/clientes", sp, { estado: c.id, pagina: null })} scroll={false}>
            {c.label} <b>{int(counts[c.id])}</b>
          </Link>
        ))}
      </div>

      <article className="card mt">
        <div className="toolbar">
          <UrlSearch params={sp} placeholder="Nome, telefone, NIF, n.º IXC ou zona" label="Pesquisar clientes" />
          <UrlSelect params={sp} param="plano" label="Filtrar por plano"
            options={[{ value: "", label: "Todos os planos" }, ...plans.map((p) => ({ value: String(p.id), label: shortPlan(p.name) }))]} />
        </div>
        <div className="table-wrap">
          <table className="data responsive">
            <thead><tr><th>Cliente</th><th>Plano</th><th>Zona</th><th>Estado</th><th>Validade</th><th>Último pagamento</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(({ customer: c, plan }) => {
                const st = CLIENT_STATE[clientState(c, today)];
                return (
                  <tr key={c.id}>
                    <td className="o1">
                      <Link className="cell-main row-link" href={`/clientes/${c.id}`}>
                        <span className="avatar">{initials(c.name)}</span>
                        <div><strong>{c.name}</strong><small>IXC {c.ixcId} · {phoneFmt(c.phone)}</small></div>
                      </Link>
                    </td>
                    <td className="o3"><div><span>{plan ? shortPlan(plan.name) : "Sem plano"}</span>{plan ? <span className="cell-sub">{kz(plan.priceKz)} / mês</span> : null}</div></td>
                    <td className="hide-sm">{c.zone ?? "—"}</td>
                    <td className="o2 right"><Pill s={st} /></td>
                    <td className="o4 right"><div><span className="tnum">{date(c.dueDate)}</span><span className="cell-sub">{rel(c.dueDate, today)}</span></div></td>
                    <td className="hide-sm"><span className="tnum">{date(c.lastPaymentAt)}</span>{c.lastPaymentAt ? <span className="cell-sub">Multicaixa</span> : null}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6}><Empty Icon={Users}>Nenhum cliente corresponde aos filtros.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{total ? `A mostrar ${int(from)}–${int(from + rows.length - 1)} de ${int(total)}` : "Sem resultados"}</span>
          <Pager page={page} pages={pages} href={(p) => withParams("/clientes", sp, { pagina: p })} />
        </div>
      </article>
    </>
  );
}
