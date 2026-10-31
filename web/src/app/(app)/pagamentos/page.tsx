import { ArrowDownRight, ArrowUpRight, CheckCheck, ChevronLeft, ChevronRight, CircleX, Clock, Download, FileExclamationPoint, Percent, Receipt, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { canEdit, requireUser } from "@/lib/auth/session";
import { officegestConfig } from "@/lib/env";
import { date, dec, int, kz, mkz, MONTHS, monthLabel, pct, refFmt, shiftMonth } from "@/lib/format";
import { typeLabel } from "@/lib/officegest";
import { currentMonth, dailyReceived, invoiceBacklog, listPayments, paymentMonthRange, PAY_FILTERS, refStats, type PayFilter } from "@/lib/queries";
import { ActionButton } from "@/components/action-button";
import { ChartCard } from "@/components/column-chart";
import { UrlSearch } from "@/components/controls";
import { PdfButton } from "@/components/pdf-viewer";
import { PAY_STATE, Pill } from "@/components/status";
import { Empty, flatParams, Pager, pageParam, withParams, type SearchParams } from "@/components/ui";
import { retryInvoices } from "./actions";

export const metadata: Metadata = { title: "Pagamentos" };

const PAGE = 25;
const FILTER_LABEL: Record<PayFilter, string> = {
  all: "Todas", paid: "Pagas", pending: "Pendentes", expired: "Expiradas", smsfail: "SMS falhado", noinvoice: "Sem fatura",
};

export default async function PagamentosPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = flatParams(await searchParams);
  const og = officegestConfig();
  const issueFrom = og?.issueFrom ?? null;
  const range = await paymentMonthRange();
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && sp.mes! >= range.first && sp.mes! <= range.last ? sp.mes! : currentMonth();
  const filters = PAY_FILTERS.filter((f) => f !== "noinvoice" || issueFrom);
  const filter = filters.includes(sp.f as PayFilter) ? (sp.f as PayFilter) : "all";
  const q = (sp.q ?? "").slice(0, 80);
  const page = pageParam(sp.pagina);
  const isCurrent = month === currentMonth();

  const [stats, prevStats, daily, backlog, { rows, total }] = await Promise.all([
    refStats(month),
    refStats(shiftMonth(month, -1)),
    dailyReceived(month),
    invoiceBacklog(issueFrom),
    listPayments({ month, filter, q, page, pageSize: PAGE, issueFrom }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const delta = !isCurrent && prevStats.paidKz ? (stats.paidKz / prevStats.paidKz - 1) * 100 : null;
  const monthName = monthLabel(month);
  const mShort = MONTHS[+month.slice(5, 7) - 1]!;
  const peak = daily.indexOf(Math.max(...daily));
  const href = (patch: Record<string, string | number | null>) => withParams("/pagamentos", sp, patch);

  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Financeiro</p><h1>Pagamentos</h1><p className="sub">Referências Multicaixa · faturas-recibo no OfficeGest</p></div>
        <div className="btn-row">
          <a className="btn" href={`/api/pagamentos/exportar?mes=${month}`}><Download className="ico sm" aria-hidden />Exportar CSV</a>
        </div>
      </div>

      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div className="month-nav">
          {month > range.first
            ? <Link className="icon-btn sm" href={withParams("/pagamentos", {}, { mes: shiftMonth(month, -1) })} aria-label="Mês anterior"><ChevronLeft className="ico sm" aria-hidden /></Link>
            : <span className="icon-btn sm" aria-hidden style={{ opacity: 0.4 }}><ChevronLeft className="ico sm" /></span>}
          <strong style={{ textTransform: "capitalize" }}>{monthName}</strong>
          {month < range.last
            ? <Link className="icon-btn sm" href={withParams("/pagamentos", {}, { mes: shiftMonth(month, 1) })} aria-label="Mês seguinte"><ChevronRight className="ico sm" aria-hidden /></Link>
            : <span className="icon-btn sm" aria-hidden style={{ opacity: 0.4 }}><ChevronRight className="ico sm" /></span>}
        </div>
      </div>

      {backlog.failed ? (
        <div className="notice" role="status">
          <span className="notice-ico"><FileExclamationPoint className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>{int(backlog.failed)} pagamento{backlog.failed === 1 ? "" : "s"} sem fatura</strong>
            <span>O OfficeGest não respondeu. Os clientes já pagaram e a fatura-recibo é repetida automaticamente.{backlog.lastError ? ` Último erro: ${backlog.lastError}` : ""}</span>
          </div>
          <div className="btn-row">
            <Link className="btn sm" href={href({ f: "noinvoice", pagina: null })}>Ver</Link>
            {canEdit(user) ? (
              <ActionButton action={retryInvoices} className="btn sm primary"><RefreshCw className="ico sm" aria-hidden />Repetir agora</ActionButton>
            ) : null}
          </div>
        </div>
      ) : null}
      {og && !issueFrom ? (
        <div className="notice info" role="status">
          <span className="notice-ico"><Receipt className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>Emissão automática de faturas desligada</strong>
            <span>Enquanto o sistema antigo emitir as faturas-recibo, o backoffice só as traz do OfficeGest. Liga-se com OFFICEGEST_ISSUE_FROM no servidor.</span>
          </div>
        </div>
      ) : null}

      <article className="card">
        <div className="pay-kpis stat-strip">
          <div className="stat-cell"><small><Receipt className="ico sm" aria-hidden />Emitido</small><strong>{mkz(stats.issuedKz)}</strong><span>{int(stats.issued)} referências</span></div>
          <div className="stat-cell">
            <small><span className="dot" />Recebido</small><strong>{mkz(stats.paidKz)}</strong>
            {delta !== null
              ? <span className={`delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? <ArrowUpRight className="ico xs" aria-hidden /> : <ArrowDownRight className="ico xs" aria-hidden />}{delta >= 0 ? "+" : "−"}{dec(Math.abs(delta))}% vs {MONTHS[+shiftMonth(month, -1).slice(5, 7) - 1]}.</span>
              : <span>{isCurrent ? "mês em curso" : `${int(stats.paid)} pagas`}</span>}
          </div>
          <div className="stat-cell"><small><Percent className="ico sm" aria-hidden />Taxa de cobrança</small><strong>{pct(stats.issued ? (stats.paid / stats.issued) * 100 : 0)}</strong><span>{int(stats.paid)} pagas</span></div>
          <div className="stat-cell"><small><span className="dot warn" />Pendente</small><strong>{mkz(stats.pendingKz)}</strong><span>{int(stats.pending)} referências</span></div>
          <div className="stat-cell"><small><span className="dot crit" />Expirado</small><strong>{mkz(stats.expiredKz)}</strong><span>{int(stats.expired)} referências</span></div>
        </div>
      </article>

      <div className="mt">
        <ChartCard
          title="Recebido por dia"
          sub={`Pagamentos confirmados em ${monthName}${daily[peak] ? ` · pico a ${peak + 1} de ${mShort}.` : ""}`}
          foot="Valores em Kwanzas, pelo dia em que o cliente pagou"
          chart={{
            aria: `Valor recebido por dia em ${monthName}`,
            labels: daily.map((_, i) => String(i + 1)),
            titles: daily.map((_, i) => `${i + 1} de ${monthName}`),
            values: daily,
            valueLabel: "Recebido",
            height: 220,
            fill: 0.62,
            labelEvery: 5,
            markMax: true,
          }}
          table={{ head: ["Dia", "Recebido"], rows: daily.map((v, i) => [`${i + 1} ${mShort}.`, kz(v)]) }}
        />
      </div>

      <article className="card mt">
        <div className="toolbar">
          <div className="chips scroll-x">
            {filters.map((f) => (
              <Link key={f} className={`chip${filter === f ? " on" : ""}`} href={href({ f, pagina: null })} scroll={false}>{FILTER_LABEL[f]}</Link>
            ))}
          </div>
          <UrlSearch params={sp} placeholder="Referência ou cliente" label="Pesquisar pagamentos" narrow />
        </div>
        <div className="table-wrap">
          <table className="data responsive">
            <thead><tr><th>Referência</th><th>Cliente</th><th className="num">Valor</th><th>Emitida</th><th>SMS</th><th>Paga em</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(({ payment: x, customer: c, invoice }) => {
                // Luanda é sempre UTC+1
                const shouldInvoice = !!issueFrom && x.status === "paid" && !!x.paidAt && x.paidAt >= new Date(`${issueFrom}T00:00:00+01:00`);
                return (
                  <tr key={x.id}>
                    <td className="o1"><div><strong className="mono">{refFmt(x.reference)}</strong><span className="cell-sub">Entidade {x.entity}</span></div></td>
                    <td className="o3"><div><Link href={`/clientes/${c.id}`}>{c.name}</Link><span className="cell-sub">IXC {c.ixcId}</span></div></td>
                    <td className="num o4 right"><strong>{kz(x.amountKz)}</strong></td>
                    <td className="hide-sm tnum">{date(x.issuedAt)}</td>
                    <td className="hide-sm">
                      {x.sms === "sent" ? <span className="sms-ok"><CheckCheck className="ico xs" aria-hidden />Entregue</span>
                        : x.sms === "failed" ? <span className="sms-fail"><CircleX className="ico xs" aria-hidden />Falhou</span>
                          : <span className="muted">—</span>}
                    </td>
                    <td className="hide-sm tnum">
                      {x.paidAt ? (
                        <div>
                          <span>{date(x.paidAt)}</span>
                          {invoice?.id
                            ? <PdfButton variant="link" invoiceId={invoice.id} number={invoice.documentNumber} subtitle={`${typeLabel(invoice.ogType)} · ${c.name}`} canShare={canEdit(user)} />
                            : shouldInvoice
                              ? x.invoiceAttempts > 0
                                ? <span className="sms-fail doc-link" title={x.invoiceError ?? undefined}><CircleX className="ico xs" aria-hidden />Fatura por emitir</span>
                                : <span className="muted doc-link"><Clock className="ico xs" aria-hidden />Fatura na fila</span>
                              : null}
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="o2 right"><Pill s={PAY_STATE[x.status]} /></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7}><Empty Icon={Receipt}>Nenhuma referência neste filtro.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{total ? `A mostrar ${int(rows.length)} de ${int(total)} referências` : "Sem resultados"}</span>
          <Pager page={page} pages={pages} href={(p) => href({ pagina: p })} />
        </div>
      </article>
    </>
  );
}
