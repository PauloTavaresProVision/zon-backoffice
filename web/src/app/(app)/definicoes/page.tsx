import { CircleCheck, CircleDashed, CircleX, Database, Lock, Play, Plug, Shield, Timer, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { canEdit, requireUser } from "@/lib/auth/session";
import { officegestConfig } from "@/lib/env";
import { ago, date, dateTime, int } from "@/lib/format";
import { JOBS } from "@/lib/jobs";
import { typeLabel } from "@/lib/officegest";
import { jobStatus, officegestLinkStats } from "@/lib/queries";
import { ActionButton } from "@/components/action-button";
import { Pill } from "@/components/status";
import { runJobNow, testOfficegest } from "./actions";

export const metadata: Metadata = { title: "Definições" };

const NEXT = [
  { code: "IX", name: "IXC Zon", desc: "Clientes, contratos e planos", meta: "Sincronização de clientes e estado do contrato" },
  { code: "AP", name: "AppyPay", desc: "Referências Multicaixa", meta: "Gerar referências e confirmar pagamentos" },
  { code: "WS", name: "WeSender", desc: "SMS aos clientes", meta: "Referência, lembretes e link da fatura" },
  { code: "TV", name: "TvBox API", desc: "Boxes, grelhas e canais", meta: "Aprovar chaves, bloquear boxes, publicar grelhas" },
];

const OK = { label: "Ligado", tone: "good", Icon: CircleCheck } as const;
const WARN = { label: "Atenção", tone: "warning", Icon: TriangleAlert } as const;
const OFF = { label: "Por ligar", tone: "", Icon: CircleDashed } as const;

export default async function DefinicoesPage() {
  const user = await requireUser();
  const admin = canEdit(user, "admin");
  const og = officegestConfig();
  const [jobs, link] = await Promise.all([jobStatus(), og ? officegestLinkStats(og.consumerNif) : Promise.resolve(null)]);
  const sync = jobs.last.get(JOBS.sync.name);
  const every: Record<string, string> = {
    [JOBS.issue.name]: "a cada minuto",
    [JOBS.sync.name]: og ? `a cada ${og.syncMinutes} min` : "—",
    [JOBS.expire.name]: "a cada 10 min",
  };

  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Sistema</p><h1>Definições</h1><p className="sub"><Lock className="ico xs" aria-hidden />As chaves das integrações ficam no servidor (.env), nunca no código nem nesta página</p></div>
      </div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Secções das definições">
          <a href="#integracoes" className="on"><Plug className="ico sm" aria-hidden />Integrações</a>
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
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
                    <span className="int-logo"><Database className="ico sm" aria-hidden /></span>
                    <div style={{ flex: 1, minWidth: 0 }}><strong>Base de dados</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>PostgreSQL 17 no Docker do Zon Backoffice</small></div>
                  </div>
                  <div><Pill s={OK} /></div>
                  <small className="text-2" style={{ fontSize: 12 }}>Base de dados própria, separada de qualquer outro sistema. Os PDF das faturas ficam num volume do Docker.</small>
                </div>
                {NEXT.map((i) => (
                  <div className="int-card" key={i.name}>
                    <div className="int-card-head">
                      <span className="int-logo">{i.code}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><strong>{i.name}</strong><small className="muted" style={{ display: "block", fontSize: 12 }}>{i.desc}</small></div>
                    </div>
                    <div><Pill s={OFF} /></div>
                    <small className="text-2" style={{ fontSize: 12 }}>{i.meta}</small>
                  </div>
                ))}
              </div>
            </div>
          </article>

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
                <div className="kv-row"><span>Perfis</span><strong>Administrador · Operador · Consulta</strong></div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
