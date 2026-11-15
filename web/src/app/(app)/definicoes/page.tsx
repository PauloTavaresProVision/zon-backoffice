import { CircleCheck, CircleDashed, CircleX, Database, Lock, Play, Plug, Shield, Timer, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { canEdit, requireUser } from "@/lib/auth/session";
import { gridSnapshot, resolveGrid, versionLabel } from "@/lib/boxes/grid";
import { boxStats } from "@/lib/boxes/queries";
import { appypayConfig, cycleMode, env, ixcConfig, officegestConfig, smsConfig } from "@/lib/env";
import { TEST_AMOUNT_KZ, TEST_DAYS, recentTestReferences, testStatusLabel } from "@/lib/cycle/test-reference";
import { ago, date, dateTime, int, kz, phoneFmt, refFmt } from "@/lib/format";
import { JOBS } from "@/lib/jobs";
import { typeLabel } from "@/lib/officegest";
import { jobStatus, officegestLinkStats } from "@/lib/queries";
import { ActionButton } from "@/components/action-button";
import { Pill } from "@/components/status";
import { createAppypayTest, lookupAppypayTest, runJobNow, simulateAppypayTest, testAppypay, testIxc, testOfficegest, testWesender } from "./actions";

export const metadata: Metadata = { title: "Definições" };

const OK = { label: "Ligado", tone: "good", Icon: CircleCheck } as const;
const WARN = { label: "Atenção", tone: "warning", Icon: TriangleAlert } as const;
const OFF = { label: "Por ligar", tone: "", Icon: CircleDashed } as const;

const MODE_LABEL = { desligado: "desligado", simulacao: "simulação (não envia nada)", ativo: "ativo" } as const;

export default async function DefinicoesPage() {
  const user = await requireUser();
  const admin = canEdit(user, "admin");
  const og = officegestConfig();
  const ix = ixcConfig();
  const ap = appypayConfig();
  const sms = smsConfig();
  const mode = cycleMode();
  const [jobs, link, boxes, snap, tests] = await Promise.all([
    jobStatus(),
    og ? officegestLinkStats(og.consumerNif) : Promise.resolve(null),
    boxStats(),
    gridSnapshot(),
    ap ? recentTestReferences() : Promise.resolve([]),
  ]);
  const devMocks = !!env().DEV_MOCKS_URL;
  const grid = resolveGrid(snap, null);
  const appUrl = new URL(env().APP_URL);
  const https = appUrl.protocol === "https:";
  const sync = jobs.last.get(JOBS.sync.name);
  const ixSync = jobs.last.get(JOBS.ixcSync.name);
  const apCheck = jobs.last.get(JOBS.confirm.name);
  const on = mode !== "desligado";
  const every: Record<string, string> = {
    [JOBS.ixcSync.name]: ix && on ? `a cada ${ix.syncMinutes} min` : "—",
    [JOBS.cycle.name]: on ? "a cada 15 min" : "—",
    [JOBS.confirm.name]: ap ? "a cada 10 min" : "—",
    [JOBS.settle.name]: mode === "ativo" ? "a cada minuto" : "—",
    [JOBS.issue.name]: "a cada minuto",
    [JOBS.sync.name]: og ? `a cada ${og.syncMinutes} min` : "—",
    [JOBS.expire.name]: "a cada 10 min",
  };
  const status = (configured: boolean, failed: boolean | undefined) => (!configured ? OFF : failed ? WARN : OK);

  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Sistema</p><h1>Definições</h1><p className="sub"><Lock className="ico xs" aria-hidden />As chaves das integrações ficam no servidor (.env), nunca no código nem nesta página</p></div>
      </div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Secções das definições">
          <a href="#integracoes" className="on"><Plug className="ico sm" aria-hidden />Integrações</a>
          {ap ? <a href="#teste-appypay"><CircleCheck className="ico sm" aria-hidden />Teste da AppyPay</a> : null}
          <a href="#agendamentos"><Timer className="ico sm" aria-hidden />Agendamentos</a>
          <a href="#seguranca"><Shield className="ico sm" aria-hidden />Segurança</a>
        </nav>
        <div className="grid">
          <article className="card" id="integracoes">
            <div className="card-head"><div><h2>Integrações</h2><p className="sub">Os sistemas que o backoffice junta num só sítio</p></div></div>
            <div className="card-body">
              <div className="int-grid">
                <div className="int-card">
                  <div className="int-card-head">
                    <span className="int-logo">OG</span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>OfficeGest</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>Faturas e PDF na conta do cliente</small></div>
                  </div>
                  <div className="int-status">
                    <Pill s={!og ? OFF : sync?.ok === false ? WARN : OK} label={!og ? "Por configurar" : undefined} />
                    {og && admin ? <ActionButton action={testOfficegest} className="btn xs">Testar ligação</ActionButton> : null}
                  </div>
                  {og ? (
                    <div className="kv-list">
                      <div className="kv-row"><span>Conta</span><strong className="mono">{new URL(og.url).host}</strong></div>
                      <div className="kv-row"><span>Documentos trazidos</span><strong>{og.docTypes.map((t) => t.toUpperCase()).join(", ")}</strong></div>
                      <div className="kv-row"><span>Emite após pagamento</span><strong>{typeLabel(og.issueType)}</strong></div>
                      <div className="kv-row"><span>Emissão automática</span><strong>{og.issueFrom ? `desde ${date(og.issueFrom)}` : "desligada"}</strong></div>
                      <div className="kv-row"><span>Artigo da mensalidade</span><strong>{og.articleId ? "configurado" : <span className="sms-fail">em falta</span>}</strong></div>
                      <div className="kv-row"><span>Clientes ligados</span><strong>{link ? `${int(link.linked)} · ${int(link.withNif)} com NIF próprio` : "—"}</strong></div>
                    </div>
                  ) : <small className="text-2" style={{ fontSize: 12 }}>Preencher OFFICEGEST_URL, OFFICEGEST_USER e OFFICEGEST_KEY no .env do servidor.</small>}
                </div>
                <div className="int-card">
                  <div className="int-card-head">
                    <span className="int-logo">IX</span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>IXC Zon</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>Clientes, contratos e títulos a cobrar</small></div>
                  </div>
                  <div className="int-status">
                    <Pill s={status(!!ix, ixSync?.ok === false)} label={!ix ? "Por configurar" : undefined} />
                    {ix && admin ? <ActionButton action={testIxc} className="btn xs">Testar ligação</ActionButton> : null}
                  </div>
                  {ix ? (
                    <div className="kv-list">
                      <div className="kv-row"><span>Servidor</span><strong className="mono">{new URL(ix.url).host}</strong></div>
                      <div className="kv-row"><span>Ciclo de cobrança</span><strong>{MODE_LABEL[mode]}</strong></div>
                      <div className="kv-row"><span>Sincronização</span><strong>{on ? `a cada ${ix.syncMinutes} min` : "parada"}</strong></div>
                      <div className="kv-row"><span>Última</span><strong>{jobs.lastOk.get(JOBS.ixcSync.name) ? ago(jobs.lastOk.get(JOBS.ixcSync.name)!.startedAt) : "nunca"}</strong></div>
                      <div className="kv-row"><span>Escreve no IXC</span><strong>{mode === "ativo" ? "baixas e título seguinte" : "não"}</strong></div>
                    </div>
                  ) : <small className="text-2" style={{ fontSize: 12 }}>Preencher IXC_URL e IXC_TOKEN no .env do servidor.</small>}
                </div>
                <div className="int-card">
                  <div className="int-card-head">
                    <span className="int-logo">AP</span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>AppyPay</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>Referências Multicaixa e pagamentos</small></div>
                  </div>
                  <div className="int-status">
                    <Pill s={status(!!ap, apCheck?.ok === false)} label={!ap ? "Por configurar" : undefined} />
                    {ap && admin ? <ActionButton action={testAppypay} className="btn xs">Testar ligação</ActionButton> : null}
                  </div>
                  {ap ? (
                    <div className="kv-list">
                      <div className="kv-row"><span>Serviço</span><strong className="mono">{new URL(ap.url).host}</strong></div>
                      <div className="kv-row"><span>Entidade</span><strong className="mono">{ap.entity}</strong></div>
                      <div className="kv-row"><span>Webhook</span><strong>{ap.webhookSecret && ap.webhookSecret.length >= 24 ? "configurado" : <span className="sms-fail">sem segredo</span>}</strong></div>
                      <div className="kv-row"><span>Confirmação</span><strong>webhook + a cada 10 min</strong></div>
                    </div>
                  ) : <small className="text-2" style={{ fontSize: 12 }}>Preencher as variáveis APPYPAY_* no .env do servidor.</small>}
                  {ap?.webhookSecret ? (
                    <small className="text-2" style={{ fontSize: 12 }}>URL a dar à AppyPay: <span className="mono">{env().APP_URL.replace(/\/+$/, "")}/api/appypay/webhook/••••</span> (o segredo está no .env)</small>
                  ) : null}
                </div>
                <div className="int-card">
                  <div className="int-card-head">
                    <span className="int-logo">WS</span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>WeSender</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>SMS com a referência e lembretes</small></div>
                  </div>
                  <div className="int-status">
                    <Pill s={sms ? (sms.testPhone ? WARN : OK) : OFF} label={!sms ? "Por configurar" : sms.testPhone ? "Modo de teste" : undefined} />
                    {sms && admin ? (
                      <ActionButton action={testWesender} className="btn xs" title={sms.testPhone ? undefined : "Defina SMS_TEST_PHONE para enviar uma SMS de teste"}>Enviar SMS de teste</ActionButton>
                    ) : null}
                  </div>
                  {sms ? (
                    <div className="kv-list">
                      <div className="kv-row"><span>Serviço</span><strong className="mono">{new URL(sms.url).host}</strong></div>
                      <div className="kv-row"><span>Horário</span><strong>das 8h às 20h (Luanda)</strong></div>
                      <div className="kv-row"><span>Destino</span><strong>{sms.testPhone ? `só ${phoneFmt(sms.testPhone)} (testes)` : "telemóvel do cliente"}</strong></div>
                      <div className="kv-row"><span>Linha “Dúvidas”</span><strong>{env().SMS_SUPPORT_PHONE?.trim() || "sem"}</strong></div>
                    </div>
                  ) : <small className="text-2" style={{ fontSize: 12 }}>Preencher WESENDER_URL e WESENDER_KEY no .env do servidor.</small>}
                </div>
                <div className="int-card">
                  <div className="int-card-head">
                    <span className="int-logo"><Database className="ico sm" aria-hidden /></span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>Base de dados</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>PostgreSQL 17 no Docker do Zon Backoffice</small></div>
                  </div>
                  <div><Pill s={OK} /></div>
                  <small className="text-2" style={{ fontSize: 12 }}>Base de dados própria, separada de qualquer outro sistema. Os PDF das faturas ficam num volume do Docker.</small>
                </div>
                <div className="int-card">
                  <div className="int-card-head">
                    <span className="int-logo">TV</span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>Boxes ZON TV</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>Ativação das boxes, grelha e conta do cliente na TV</small></div>
                  </div>
                  <div className="int-status">
                    <Pill s={!https ? WARN : boxes.total ? OK : OFF} label={!https ? "Precisa de HTTPS" : boxes.total ? undefined : "À espera de boxes"} />
                    <Link className="btn xs" href="/boxes">Ver boxes</Link>
                  </div>
                  <div className="kv-list">
                    <div className="kv-row"><span>Servidor a pôr na box</span><strong className="mono">{appUrl.origin}</strong></div>
                    <div className="kv-row"><span>Boxes</span><strong>{int(boxes.online)} ligadas · {int(boxes.total)} aprovadas</strong></div>
                    <div className="kv-row"><span>Por aprovar</span><strong>{boxes.pending ? <Link href="/boxes">{int(boxes.pending)} pedidos</Link> : "nenhum"}</strong></div>
                    <div className="kv-row"><span>Grelhas</span><strong><Link href="/canais">{int(snap.byGrid.size)} publicada{snap.byGrid.size === 1 ? "" : "s"}</Link> · predefinida {versionLabel(snap, grid.version) ?? grid.name} ({int(grid.channels.length)} canais)</strong></div>
                    <div className="kv-row"><span>Na TV (Definições)</span><strong>nome, referência por pagar, próximo pagamento</strong></div>
                  </div>
                  {!https ? <small className="sms-fail" style={{ fontSize: 12 }}>A app só aceita servidores HTTPS: o APP_URL tem de ser o endereço público com certificado.</small> : null}
                </div>
              </div>
            </div>
          </article>

          {ap ? (
            <article className="card" id="teste-appypay">
              <div className="card-head">
                <div>
                  <h2>Teste da AppyPay</h2>
                  <p className="sub">Referência de {kz(TEST_AMOUNT_KZ)} sem cliente, válida {TEST_DAYS} dias: pague-a no Multicaixa e veja aqui se a notificação chega. Não toca em clientes, no IXC, em SMS nem em faturas.</p>
                </div>
                {admin ? (
                  <ActionButton action={createAppypayTest} className="btn sm" confirm={`Criar na AppyPay uma referência de teste de ${kz(TEST_AMOUNT_KZ)}?`}>Criar referência de teste</ActionButton>
                ) : null}
              </div>
              {!ap.webhookSecret || ap.webhookSecret.length < 24 ? (
                <p className="sms-fail" style={{ fontSize: 13, margin: "8px 0 0" }}>Sem APPYPAY_WEBHOOK_SECRET no .env: a notificação da AppyPay não entra. Só a verificação de 10 em 10 min confirma o pagamento.</p>
              ) : null}
              {tests.length ? (
                <div className="jobs mt">
                  {tests.map((t) => {
                    const paid = t.status === "paid";
                    const expired = !paid && (t.status === "expired" || t.expiresAt.getTime() < Date.now());
                    return (
                      <div className={`job${admin ? " act" : ""}`} key={t.id}>
                        <div>
                          <strong>Entidade <span className="mono">{t.entity}</span> · Referência <span className="mono">{refFmt(t.reference)}</span> · {kz(t.amountKz)}</strong>
                          <small>{testStatusLabel(t)}{paid && t.confirmedBy ? ` · confirmada ${t.confirmedBy === "webhook" ? "pela notificação" : "pela verificação"}` : ""}</small>
                          <span className="job-sum">
                            Notificação da AppyPay: {t.noticeCount ? `recebida ${dateTime(t.lastNoticeAt)}${t.noticeCount > 1 ? ` (${int(t.noticeCount)} vezes)` : ""}` : "ainda não chegou"}
                            {t.checkedAt ? ` · verificada na AppyPay ${ago(t.checkedAt)}` : ""}
                          </span>
                        </div>
                        {paid ? <span className="pill good"><CircleCheck className="ico" aria-hidden />Paga</span>
                          : expired ? <span className="pill plain">Expirada</span>
                            : <span className="pill warning"><Timer className="ico" aria-hidden />Por pagar</span>}
                        {admin ? (
                          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <ActionButton action={lookupAppypayTest.bind(null, t.id)} className="btn xs">Perguntar à AppyPay</ActionButton>
                            {devMocks && !paid && !expired ? <ActionButton action={simulateAppypayTest.bind(null, t.id)} className="btn xs">Simular pagamento</ActionButton> : null}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-2" style={{ fontSize: 13, margin: "8px 0 0" }}>Ainda não há referências de teste.</p>}
            </article>
          ) : null}

          <article className="card" id="agendamentos">
            <div className="card-head"><div><h2>Agendamentos</h2><p className="sub">Tarefas automáticas, corridas pelo worker</p></div></div>
            <div className="jobs mt">
              {Object.entries(JOBS).map(([key, j]) => {
                const last = jobs.last.get(j.name);
                return (
                  <div className={`job${admin ? " act" : ""}`} key={j.name}>
                    <div>
                      <strong>{j.label}</strong>
                      <small>{j.desc}</small>
                      {last?.summary ? <span className="job-sum">{dateTime(last.startedAt)} · {last.summary}</span> : null}
                    </div>
                    <span className="tag desktop-only"><Timer className="ico xs" aria-hidden />{every[j.name]}</span>
                    {!last ? <span className="pill plain">Ainda não correu</span>
                      : last.ok === null ? <span className="pill warning"><Timer className="ico" aria-hidden />A correr</span>
                        : last.ok ? <span className="pill good"><CircleCheck className="ico" aria-hidden />{ago(last.startedAt)}</span>
                          : <span className="pill critical"><CircleX className="ico" aria-hidden />Falhou {ago(last.startedAt)}</span>}
                    {admin ? (
                      <ActionButton action={runJobNow.bind(null, key)} className="icon-btn sm bordered" title="Executar agora" ariaLabel={`Executar agora: ${j.label}`}>
                        <Play className="ico sm" aria-hidden />
                      </ActionButton>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </article>

          <article className="card" id="seguranca">
            <div className="card-head"><div><h2>Segurança</h2></div></div>
            <div className="card-body">
              <div className="kv-list">
                <div className="kv-row"><span>Sessões</span><strong>Cookie seguro, 12 h (30 dias com “Manter sessão”)</strong></div>
                <div className="kv-row"><span>Palavras-passe</span><strong>scrypt, mínimo 12 caracteres</strong></div>
                <div className="kv-row"><span>Tentativas de entrada</span><strong>8 falhadas bloqueiam 15 min</strong></div>
                <div className="kv-row"><span>Links públicos de faturas</span><strong>Assinados, expiram em 30 dias</strong></div>
                <div className="kv-row"><span>Webhook da AppyPay</span><strong>Segredo no URL; o pagamento é confirmado de novo na AppyPay</strong></div>
                <div className="kv-row"><span>Boxes</span><strong>Chave RSA própria de cada box; aprovação com o código da TV; cada sincronização assinada sobre um desafio de 60 s</strong></div>
                <div className="kv-row"><span>Perfis</span><strong>Administrador · Operador · Consulta</strong></div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
