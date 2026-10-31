import { ArrowRight, CircleAlert, Clock, Receipt, TrendingDown, TrendingUp, Users, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { officegestConfig } from "@/lib/env";
import { addDays, ago, date, daysFrom, dec, greeting, initials, int, isoDay, kz, longToday, millions, mkz, MONTHS, MONTHS_LONG, monthLabel, pct, rel, shiftMonth } from "@/lib/format";
import { JOBS } from "@/lib/jobs";
import {
  activityFeed, cashReceived, clientCounts, currentMonth, expiringSoon, invoiceBacklog, invoicingOfMonth, jobStatus, monthlySeries,
  officegestLinkStats, plansWithClients, refStats,
} from "@/lib/queries";
import { ChartCard } from "@/components/column-chart";
import { Feed } from "@/components/feed";
import { KpiTile, StackBar } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

const shortPlan = (name: string) => name.replace(/^ZON\s/, "");

export default async function DashboardPage() {
  const user = await requireUser();
  const og = officegestConfig();
  const today = isoDay();
  const month = currentMonth();
  const prev = shiftMonth(month, -1);
  const dayOfMonth = +today.slice(8, 10);

  const [counts, stats, cash, cashPrev, series, expiring, plans, feed, invoicing, backlog, links, jobs] = await Promise.all([
    clientCounts(today),
    refStats(month),
    cashReceived(`${month}-01`, addDays(today, 1)),
    // Mesmos dias do mês anterior, para comparar o que é comparável
    cashReceived(`${prev}-01`, addDays(`${prev}-01`, dayOfMonth)),
    monthlySeries(month, 12),
    expiringSoon(6, today),
    plansWithClients(),
    activityFeed({ limit: 7 }),
    invoicingOfMonth(month, og?.issueFrom ?? null),
    invoiceBacklog(og?.issueFrom ?? null),
    og ? officegestLinkStats(og.consumerNif) : Promise.resolve(null),
    jobStatus(),
  ]);

  const firstData = series.findIndex((s) => s.issued > 0);
  const shown = series.slice(Math.max(0, Math.min(firstData < 0 ? 6 : firstData, series.length - 6)));
  const delta = cashPrev > 0 ? (cash / cashPrev - 1) * 100 : null;
  const rate = stats.issued ? (stats.paid / stats.issued) * 100 : 0;
  const monthName = MONTHS_LONG[+month.slice(5, 7) - 1]!;
  const prevName = MONTHS_LONG[+prev.slice(5, 7) - 1]!;
  const maxPlan = Math.max(1, ...plans.map((p) => p.clients));
  const activeClients = plans.reduce((a, p) => a + p.clients, 0);
  const lastSync = jobs.lastOk.get(JOBS.sync.name);
  const missing = Math.max(0, invoicing.paid - invoicing.withInvoice - invoicing.beforeIssueFrom);

  const integrations = [
    { name: "OfficeGest", state: og ? "ok" : "warn", desc: "Faturas e PDF", meta: og ? `${int(links?.invoices ?? 0)} faturas · ${lastSync ? `sincronizado ${ago(lastSync.startedAt)}` : "por sincronizar"}` : "Por configurar no servidor" },
    { name: "Base de dados", state: "ok", desc: "PostgreSQL 17 próprio", meta: "Só do Zon Backoffice" },
    { name: "IXC Zon", state: "off", desc: "Clientes e contratos", meta: "Próxima fase" },
    { name: "AppyPay", state: "off", desc: "Referências Multicaixa", meta: "Próxima fase" },
    { name: "WeSender", state: "off", desc: "SMS aos clientes", meta: "Próxima fase" },
    { name: "TvBox API", state: "off", desc: "Boxes, grelhas e canais", meta: "Próxima fase" },
  ];

  return (
    <>
      <section className="hello">
        <div><p className="eyebrow">{longToday()}</p><h1>{greeting()}, {user.name.split(/\s+/)[0]}</h1></div>
        <div className="btn-row">
          <Link className="btn" href="/pagamentos"><Receipt className="ico sm" aria-hidden />Pagamentos de {monthName}</Link>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="card hero">
          <div className="hero-label">
            <span>Recebido em {monthName}</span>
            {delta !== null ? (
              <span className={`pill ${delta >= 0 ? "good" : "plain"}`} title={`Comparado com os primeiros ${dayOfMonth} dias de ${prevName}`}>
                {delta >= 0 ? <TrendingUp className="ico" aria-hidden /> : <TrendingDown className="ico" aria-hidden />}
                {delta >= 0 ? "+" : "−"}{dec(Math.abs(delta))}% vs {prevName}
              </span>
            ) : null}
          </div>
          <div className="hero-num">{millions(cash)}<span>M Kz</span></div>
          <p className="hero-sub">Referências de {monthName}: <b>{mkz(stats.issuedKz)}</b> em {int(stats.issued)} · taxa de cobrança <b>{pct(rate)}</b></p>
          <div className="meter">
            <StackBar label={`Estado das referências de ${monthName}`} parts={[
              { label: "Pagas", value: stats.paid, color: "var(--good)" },
              { label: "Pendentes", value: stats.pending, color: "var(--warning)" },
              { label: "Expiradas", value: stats.expired, color: "var(--critical)" },
            ]} />
          </div>
        </article>
        <KpiTile label="Clientes ativos" Icon={Users} value={int(counts.active)} href="/clientes?estado=active"
          foot={counts.newThisMonth ? <><span className="delta up">+{int(counts.newThisMonth)}</span> novos este mês</> : "Sem novos clientes este mês"} />
        <KpiTile label="Clientes inativos" Icon={UserX} value={int(counts.inactive)} href="/clientes?estado=inactive"
          foot={`${pct(counts.all ? (counts.inactive / counts.all) * 100 : 0)} da base`} />
        <KpiTile label="Em atraso" Icon={CircleAlert} value={int(counts.late)} href="/clientes?estado=late" foot="Com a referência expirada" />
        <KpiTile label="A expirar em 7 dias" Icon={Clock} value={int(counts.expiring)} href="/clientes?estado=expiring" attention
          foot={<span className="link">Ver lista <ArrowRight className="ico xs" aria-hidden /></span>} />
      </section>

      <section className="row-2">
        <ChartCard
          title="Emitido vs recebido"
          sub={`Referências Multicaixa por mês · últimos ${shown.length} meses`}
          foot="Valores em Kwanzas, pelo mês a que a referência respeita"
          chart={{
            aria: `Emitido e recebido por mês nos últimos ${shown.length} meses`,
            labels: shown.map((s) => MONTHS[+s.ym.slice(5, 7) - 1]!),
            titles: shown.map((s) => monthLabel(s.ym)),
            values: shown.map((s) => s.received),
            ghost: shown.map((s) => s.issued),
            valueLabel: "Recebido",
            ghostLabel: "Emitido",
            height: 250,
            showRate: true,
          }}
          table={{
            head: ["Mês", "Emitido", "Recebido", "Taxa"],
            rows: shown.map((s) => [monthLabel(s.ym), kz(s.issued), kz(s.received), pct(s.issued ? (s.received / s.issued) * 100 : 0)]),
          }}
        />

        <article className="card">
          <div className="card-head"><div><h2>A expirar esta semana</h2><p className="sub">{int(counts.expiring)} contratos nos próximos 7 dias</p></div></div>
          <div className="list mt">
            {expiring.length ? expiring.map((c) => (
              <div className="list-item" key={c.id}>
                <span className="avatar">{initials(c.name)}</span>
                <Link className="grow" href={`/clientes/${c.id}`}>
                  <strong>{c.name}</strong>
                  <small>{c.planName ? `${shortPlan(c.planName)} · ${kz(c.priceKz ?? 0)}` : "Sem plano"}</small>
                </Link>
                <span className={`pill ${c.dueDate && daysFrom(c.dueDate, today) <= 1 ? "serious" : "warning"}`} title={date(c.dueDate)}>
                  <Clock className="ico" aria-hidden />{rel(c.dueDate, today)}
                </span>
              </div>
            )) : <div className="empty">Nenhum contrato a expirar nos próximos 7 dias.</div>}
          </div>
          <div className="card-foot">
            <span>Lembretes por SMS quando a WeSender estiver ligada</span>
            <Link className="link" href="/clientes?estado=expiring">Ver todos <ArrowRight className="ico xs" aria-hidden /></Link>
          </div>
        </article>
      </section>

      <section className="row-3">
        <article className="card">
          <div className="card-head"><div><h2>Clientes por plano</h2><p className="sub">{int(activeClients)} clientes com serviço</p></div><Link className="link" href="/planos">Planos <ArrowRight className="ico xs" aria-hidden /></Link></div>
          <div className="card-body">
            <div className="hbar-list">
              {plans.map(({ plan, clients }) => (
                <div className="hbar-row" key={plan.id}>
                  <span className="name">{shortPlan(plan.name)}</span>
                  <span className="val"><b>{int(clients)}</b> · {pct(activeClients ? (clients / activeClients) * 100 : 0, 0)}</span>
                  <div className="hbar-track"><span style={{ width: `${(clients / maxPlan) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <div><h2>Faturação</h2><p className="sub">{og ? `OfficeGest · pagamentos de ${monthName}` : "OfficeGest por configurar"}</p></div>
            <Link className="link" href="/pagamentos">Pagamentos <ArrowRight className="ico xs" aria-hidden /></Link>
          </div>
          <div className="card-body">
            <StackBar label={`Faturas dos pagamentos de ${monthName}`} parts={[
              { label: "Com fatura", value: invoicing.withInvoice, color: "var(--good)" },
              { label: "Por emitir", value: missing, color: "var(--warning)" },
              ...(invoicing.beforeIssueFrom ? [{ label: "Sistema antigo", value: invoicing.beforeIssueFrom, color: "var(--muted)" }] : []),
            ]} />
            <div className="kv-list mt">
              <div className="kv-row"><span>Faturas nas contas dos clientes</span><strong>{int(links?.invoices ?? 0)}</strong></div>
              <div className="kv-row"><span>Clientes ligados ao OfficeGest</span><strong>{links ? `${int(links.linked)} · ${int(links.withNif)} com NIF próprio` : "—"}</strong></div>
              <div className="kv-row"><span>Emissão automática</span><strong>{og?.issueFrom ? `desde ${date(og.issueFrom)}` : <span className="pill plain">Desligada</span>}</strong></div>
              <div className="kv-row"><span>Última sincronização</span><strong>{lastSync ? ago(lastSync.startedAt) : "—"}</strong></div>
            </div>
          </div>
          <div className="card-foot">
            <span>{backlog.failed ? `${int(backlog.failed)} faturas falharam e vão ser repetidas` : backlog.waiting ? `${int(backlog.waiting)} na fila para emitir` : "Sem faturas em atraso"}</span>
          </div>
        </article>

        <article className="card">
          <div className="card-head"><div><h2>Atividade recente</h2><p className="sub">Pagamentos, faturas e alterações</p></div></div>
          <Feed items={feed} showCustomer empty="Ainda sem atividade." />
        </article>
      </section>

      <article className="card mt">
        <div className="card-head"><div><h2>Integrações</h2><p className="sub">Um único backoffice ligado a todos os sistemas</p></div><Link className="link" href="/definicoes">Definições <ArrowRight className="ico xs" aria-hidden /></Link></div>
        <div className="integrations mt">
          {integrations.map((i) => (
            <div className="integration" key={i.name}>
              <div className="integration-head"><span className={`dot ${i.state === "warn" ? "warn" : i.state === "off" ? "off" : ""}`} />{i.name}</div>
              <small>{i.desc}</small>
              <small className="text-2">{i.meta}</small>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
