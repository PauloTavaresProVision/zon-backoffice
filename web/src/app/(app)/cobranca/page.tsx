import {
  BookCheck, CircleCheck, CirclePause, CircleX, FlaskConical, Landmark, MessageSquare, Play, RefreshCw, Smartphone, Timer, TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { canEdit, requireUser } from "@/lib/auth/session";
import { appypayConfig, cycleFromDue, cycleMode, ixcConfig, smsConfig } from "@/lib/env";
import { ago, date, dateTime, int, kz, phoneFmt, refFmt } from "@/lib/format";
import { JOBS } from "@/lib/jobs";
import { cycleOverview, cyclePreviewRows, jobStatus, recentSms, settleFailures } from "@/lib/queries";
import { ActionButton } from "@/components/action-button";
import { Pill, SMS_KIND, SMS_STATE } from "@/components/status";
import { Empty } from "@/components/ui";
import { runJobNow } from "../definicoes/actions";
import { retrySettle } from "./actions";

export const metadata: Metadata = { title: "Cobrança" };

const STEPS = ["ixcSync", "cycle", "confirm", "settle"] as const;

const PREVIEW_KIND = {
  reference: { label: "Referência", tone: "gold", Icon: Landmark },
  sms: { label: "SMS", tone: "good", Icon: MessageSquare },
  skip: { label: "Sem SMS", tone: "", Icon: CirclePause },
} as const;

export default async function CobrancaPage() {
  const user = await requireUser();
  const admin = canEdit(user, "admin");
  const mode = cycleMode();
  const from = cycleFromDue();
  const sms = smsConfig();
  const missing = [!ixcConfig() && "IXC", !appypayConfig() && "AppyPay", !sms && "WeSender"].filter((x): x is string => !!x);
  const [o, jobs, preview, outbox, failures] = await Promise.all([
    cycleOverview(),
    jobStatus(),
    mode === "simulacao" ? cyclePreviewRows() : Promise.resolve([]),
    recentSms({ limit: 12 }),
    settleFailures(),
  ]);
  const previewRefs = preview.filter((r) => r.row.kind === "reference").length;
  const previewSms = preview.filter((r) => r.row.kind === "sms").length;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h1>Cobrança</h1>
          <p className="sub">Título no IXC → referência na AppyPay → SMS ao cliente → pagamento → baixa no IXC</p>
        </div>
        {admin && mode !== "desligado" ? (
          <div className="btn-row">
            <ActionButton action={runJobNow.bind(null, "ixcSync")} className="btn"><RefreshCw className="ico sm" aria-hidden />Sincronizar IXC</ActionButton>
            <ActionButton action={runJobNow.bind(null, "cycle")} className="btn primary"><Play className="ico sm" aria-hidden />Correr o ciclo</ActionButton>
          </div>
        ) : null}
      </div>

      {mode === "desligado" ? (
        <div className="notice" role="status">
          <span className="notice-ico"><CirclePause className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>Ciclo de cobrança desligado</strong>
            <span>Não se criam referências, não se enviam SMS e não há baixas no IXC. Liga-se com CYCLE_MODE no servidor: primeiro em simulacao, depois em ativo.</span>
          </div>
        </div>
      ) : mode === "simulacao" ? (
        <div className="notice info" role="status">
          <span className="notice-ico"><FlaskConical className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>Modo simulação</strong>
            <span>O backoffice lê o IXC e mostra abaixo o que faria. Não cria referências, não envia SMS e não escreve no IXC.</span>
          </div>
        </div>
      ) : null}
      {mode !== "desligado" && missing.length ? (
        <div className="notice error" role="status">
          <span className="notice-ico"><TriangleAlert className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>Falta configurar: {missing.join(", ")}</strong>
            <span>Preencher as variáveis no .env do servidor (ver Definições). Sem isto o ciclo não consegue {missing.includes("WeSender") && missing.length === 1 ? "enviar SMS" : "correr"}.</span>
          </div>
        </div>
      ) : null}
      {mode === "ativo" && sms?.testPhone ? (
        <div className="notice info" role="status">
          <span className="notice-ico"><Smartphone className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>SMS em modo de teste</strong>
            <span>Todas as SMS vão para {phoneFmt(sms.testPhone)} em vez do cliente (SMS_TEST_PHONE). Esvaziar no servidor para enviar aos clientes.</span>
          </div>
        </div>
      ) : null}
      {failures.length ? (
        <div className="notice error" role="status">
          <span className="notice-ico"><BookCheck className="ico" aria-hidden /></span>
          <div className="grow">
            <strong>{int(failures.length)} pagamento{failures.length === 1 ? "" : "s"} sem baixa no IXC</strong>
            <span>O cliente já pagou e a referência está confirmada; falta liquidar o título no IXC. Repete-se sozinho.{o.settle.lastError ? ` Último erro: ${o.settle.lastError}` : ""}</span>
          </div>
          {canEdit(user) ? (
            <ActionButton action={retrySettle} className="btn sm primary"><RefreshCw className="ico sm" aria-hidden />Repetir agora</ActionButton>
          ) : null}
        </div>
      ) : null}

      <article className="card">
        <div className="pay-kpis stat-strip">
          <div className="stat-cell"><small><Landmark className="ico sm" aria-hidden />Títulos a cobrar</small><strong>{int(o.titles.inWindow)}</strong><span>{int(o.titles.overdue)} em atraso · {int(o.titles.open)} em aberto</span></div>
          <div className="stat-cell"><small><span className="dot warn" />Por pagar</small><strong>{kz(o.refs.pendingKz)}</strong><span>{int(o.refs.pending)} referências vivas</span></div>
          <div className="stat-cell"><small><span className="dot" />Recebido hoje</small><strong>{kz(o.refs.paidTodayKz)}</strong><span>{int(o.refs.paidToday)} pagamento{o.refs.paidToday === 1 ? "" : "s"}</span></div>
          <div className="stat-cell"><small><MessageSquare className="ico sm" aria-hidden />SMS hoje</small><strong>{int(o.sms.sent)}</strong><span>{o.sms.failed ? `${int(o.sms.failed)} falharam` : "nenhuma falhou"}{o.sms.test ? ` · ${int(o.sms.test)} de teste` : ""}</span></div>
          <div className="stat-cell">
            <small><BookCheck className="ico sm" aria-hidden />Baixas no IXC</small>
            <strong>{int(o.settle.waiting + o.settle.failed)}</strong>
            <span>{o.settle.failed ? `${int(o.settle.failed)} com erro` : o.settle.waiting ? "na fila" : "em dia"}</span>
          </div>
        </div>
      </article>

      <div className="detail-grid mt">
        <div className="grid">
          {failures.length ? (
            <article className="card">
              <div className="card-head"><div><h2>Baixas por fazer</h2><p className="sub">Pagos, mas o título continua aberto no IXC</p></div></div>
              <div className="card-body">
                <div className="kv-list">
                  {failures.map(({ payment: x, customerName }) => (
                    <div className="kv-row settle-row" key={x.id}>
                      <div>
                        <Link href={`/clientes/${x.customerId}`}><strong>{customerName}</strong></Link>
                        <small>Título {x.ixcReceivableId} · pago {date(x.paidAt)} · {int(x.ixcSettleAttempts)} tentativa{x.ixcSettleAttempts === 1 ? "" : "s"}</small>
                        {x.ixcSettleError ? <small className="sms-fail">{x.ixcSettleError}</small> : null}
                      </div>
                      <strong>{kz(x.paidAmountKz ?? x.amountKz)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ) : null}

          <article className="card">
            <div className="card-head"><div><h2>Como corre</h2><p className="sub">Tarefas do worker, por esta ordem</p></div></div>
            <div className="jobs mt">
              {STEPS.map((key, i) => {
                const j = JOBS[key];
                const last = jobs.last.get(j.name);
                return (
                  <div className="job" key={key}>
                    <div>
                      <strong>{i + 1}. {j.label}</strong>
                      <small>{j.desc}</small>
                      {last?.summary ? <span className="job-sum">{last.summary}</span> : null}
                    </div>
                    <span />
                    {!last ? <span className="pill plain">Ainda não correu</span>
                      : last.ok === null ? <span className="pill warning"><Timer className="ico" aria-hidden />A correr</span>
                        : last.ok ? <span className="pill good"><CircleCheck className="ico" aria-hidden />{ago(last.startedAt)}</span>
                          : <span className="pill critical"><CircleX className="ico" aria-hidden />Falhou {ago(last.startedAt)}</span>}
                  </div>
                );
              })}
            </div>
          </article>
        </div>

        <div className="grid">
          <article className="card">
            <div className="card-head"><div><h2>Regras</h2></div></div>
            <div className="card-body">
              <div className="kv-list">
                <div className="kv-row"><span>Referência</span><strong>Uma por título do IXC, até 7 dias antes do vencimento</strong></div>
                <div className="kv-row"><span>Validade</span><strong>Vencimento + 3 dias · em atraso: 7 dias</strong></div>
                <div className="kv-row"><span>Avisos por SMS</span><strong>7, 3 e 1 dia antes · em atraso, 1 por semana</strong></div>
                <div className="kv-row"><span>Pagamento</span><strong>Webhook e verificação a cada 10 min</strong></div>
                <div className="kv-row"><span>Baixa no IXC</span><strong>Com a data do pagamento, e o título seguinte</strong></div>
                <div className="kv-row"><span>Cliente desativado</span><strong>Sai do ciclo (sem referências nem SMS)</strong></div>
                {from ? <div className="kv-row"><span>Passagem do sistema antigo</span><strong>Só títulos a vencer desde {date(from)}</strong></div> : null}
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="grid mt">
        {mode === "simulacao" ? (
          <article className="card">
            <div className="card-head">
              <div><h2>O que o ciclo faria</h2><p className="sub">{int(previewRefs)} referências e {int(previewSms)} SMS · última simulação {ago(jobs.last.get(JOBS.cycle.name)?.startedAt)}</p></div>
            </div>
            {preview.length ? (
              <div className="table-wrap mt">
                <table className="data responsive">
                  <thead><tr><th>Cliente</th><th>Vencimento</th><th className="num">Valor</th><th>O que faria</th></tr></thead>
                  <tbody>
                    {preview.map(({ row, customerName }) => {
                      const k = PREVIEW_KIND[row.kind as keyof typeof PREVIEW_KIND] ?? PREVIEW_KIND.skip;
                      return (
                        <tr key={row.id}>
                          <td className="o1">
                            <div>
                              {row.customerId ? <Link href={`/clientes/${row.customerId}`}>{customerName ?? "Cliente"}</Link> : <span>—</span>}
                              <span className="cell-sub">Título {row.receivableIxcId} · contrato {row.contractIxcId}</span>
                            </div>
                          </td>
                          <td className="hide-sm tnum">{date(row.dueDate)}</td>
                          <td className="num o3">{row.amountKz ? kz(row.amountKz) : "—"}</td>
                          <td className="o2 span"><div><Pill s={k} /><span className="cell-sub preview-detail">{row.detail}</span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Empty Icon={FlaskConical}>Ainda sem simulação. Corre a cada 15 minutos depois de sincronizar o IXC.</Empty>}
          </article>
        ) : null}

        <article className="card">
          <div className="card-head"><div><h2>Últimas SMS</h2><p className="sub">{sms ? "Pela WeSender, das 8h às 20h" : "WeSender por configurar"}</p></div></div>
          {outbox.length ? (
            <div className="table-wrap mt">
              <table className="data responsive">
                <thead><tr><th>Cliente</th><th>Mensagem</th><th>Para</th><th>Quando</th><th>Estado</th></tr></thead>
                <tbody>
                  {outbox.map(({ sms: s, customerName, reference }) => (
                    <tr key={s.id}>
                      <td className="o1">
                        <div>
                          {s.customerId ? <Link href={`/clientes/${s.customerId}`}>{customerName ?? "Cliente"}</Link> : <span>—</span>}
                          <span className="cell-sub">{SMS_KIND[s.kind] ?? s.kind}{reference ? ` · ref. ${refFmt(reference)}` : ""}</span>
                        </div>
                      </td>
                      <td className="hide-sm sms-cell"><span className="sms-body" title={s.body}>{s.error ?? s.body.replace(/\s*\n+\s*/g, " ")}</span></td>
                      <td className="hide-sm tnum">{phoneFmt(s.phone)}{s.test ? <span className="tag" style={{ marginLeft: 6 }}>teste</span> : null}</td>
                      <td className="o4 tnum">{dateTime(s.at)}</td>
                      <td className="o2 right"><Pill s={SMS_STATE[s.status] ?? SMS_STATE.failed!} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty Icon={MessageSquare}>Ainda não saiu nenhuma SMS.</Empty>}
        </article>
      </div>
    </>
  );
}
