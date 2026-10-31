import {
  ArrowLeft, Calendar, CheckCheck, CircleCheck, CirclePause, CircleX, FileText, FlaskConical, Hash, Landmark, Lock, LockOpen, Mail, MapPin,
  MessageSquare, Phone, RefreshCw, Send, Tv, Unlink, WifiOff, type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, currentUser, requireUser } from "@/lib/auth/session";
import { clientState } from "@/lib/client-state";
import { cycleMode, env, officegestConfig } from "@/lib/env";
import { ago, date, dateTime, initials, int, isoDay, kz, monthLabel, MONTHS, phoneFmt, refFmt, rel } from "@/lib/format";
import { BLOCKED_INTERNET, CONTRACT_STATUS, INTERNET_STATUS } from "@/lib/ixc";
import { typeLabel } from "@/lib/officegest";
import { activityFeed, clientContracts, clientInvoices, clientPayments, getClient, openReference, recentSms } from "@/lib/queries";
import { billingFor } from "@/lib/boxes/device";
import { currentGrid } from "@/lib/boxes/grid";
import { customerBoxes, pendingEnrollments } from "@/lib/boxes/queries";
import { boxView } from "@/lib/boxes/view";
import { ActionButton } from "@/components/action-button";
import { ApproveBox } from "@/components/approve-box";
import { ActiveToggle, CopyButton } from "@/components/controls";
import { Feed } from "@/components/feed";
import { PdfButton } from "@/components/pdf-viewer";
import { BOX_STATE, CLIENT_STATE, PAY_STATE, Pill, SMS_KIND, SMS_STATE, type StateDef } from "@/components/status";
import { Empty } from "@/components/ui";
import { removeBox, setBoxBlocked } from "../../boxes/actions";
import { generateReferenceNow, refreshClientInvoices, resendReferenceSms, simulatePayment } from "../actions";

type Props = { params: Promise<{ id: string }> };

const parseId = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).id);
  if (!id || !(await currentUser())) return { title: "Cliente" };
  const row = await getClient(id);
  return { title: row?.customer.name ?? "Cliente" };
}

const KIND_LABEL: Record<string, string> = { internet: "Internet", tv: "Televisão", internet_tv: "Internet + TV" };

function contractState(status: string, internet: string | null): StateDef {
  if (status !== "A") return { label: CONTRACT_STATUS[status] ?? status, tone: "", Icon: CirclePause };
  if (internet && BLOCKED_INTERNET.includes(internet)) return { label: INTERNET_STATUS[internet] ?? "Bloqueado", tone: "serious", Icon: WifiOff };
  return { label: "Ativo", tone: "good", Icon: CircleCheck };
}

export default async function ClientePage({ params }: Props) {
  const user = await requireUser();
  const id = parseId((await params).id);
  if (!id) notFound();
  const row = await getClient(id);
  if (!row) notFound();
  const { customer: c, plan } = row;
  const og = officegestConfig();
  const today = isoDay();
  const mode = cycleMode();
  const devMocks = !!env().DEV_MOCKS_URL;
  const [pays, invs, open, feed, ixcData, sms, boxes, waiting, grid] = await Promise.all([
    clientPayments(c.id),
    clientInvoices(c.id),
    openReference(c.id),
    activityFeed({ customerId: c.id, limit: 12 }),
    clientContracts(c.id),
    recentSms({ customerId: c.id, limit: 6 }),
    customerBoxes(c.id),
    pendingEnrollments(4),
    currentGrid(),
  ]);
  // O que as boxes do cliente mostram nas Definições da app
  const tv = boxes.length ? await billingFor(c.id) : null;
  const st = CLIENT_STATE[clientState(c, today)];
  const editor = canEdit(user);
  // O próximo título por cobrar (sem referência viva e ainda não pago)
  const nextTitle = ixcData.open.find((r) => !r.paid && r.ixcId !== open?.ixcReceivableId);
  const canGenerate = editor && mode === "ativo" && !open && !!nextTitle && !c.disabledAt;
  const synced = invs.reduce<Date | null>((m, { invoice }) => (!m || invoice.syncedAt > m ? invoice.syncedAt : m), null);
  const visibleInvs = invs.filter(({ invoice }) => !invoice.cancelled).length;

  const meta: [LucideIcon, string, string?][] = [
    [Hash, `IXC ${c.ixcId}`],
    [Phone, phoneFmt(c.phone)],
    ...(c.email ? [[Mail, c.email, "desktop-only"] as [LucideIcon, string, string]] : []),
    [MapPin, `${c.zone ? `${c.zone}, ` : ""}${c.city}`],
    ...(c.since ? [[Calendar, `Cliente desde ${MONTHS[+c.since.slice(5, 7) - 1]} ${c.since.slice(0, 4)}`, "desktop-only"] as [LucideIcon, string, string]] : []),
  ];

  return (
    <>
      <Link className="back-link" href="/clientes"><ArrowLeft className="ico sm" aria-hidden />Clientes</Link>
      <div className="page-head">
        <div className="client-head">
          <span className="avatar lg">{initials(c.name)}</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h1>{c.name}</h1><Pill s={st} /></div>
            <div className="client-meta">
              {meta.map(([Icon, text, cls]) => <span key={text} className={cls}><Icon className="ico xs" aria-hidden />{text}</span>)}
            </div>
          </div>
        </div>
        <div className="btn-row">
          <ActiveToggle customerId={c.id} name={c.name} active={c.status !== "inactive" && !c.disabledAt} disabled={!editor} />
        </div>
      </div>

      <div className="detail-grid">
        <div className="grid">
          <article className="card">
            <div className="card-head"><h2>Contrato</h2></div>
            <div className="card-body">
              <div className="kv">
                <div><small>Plano</small><strong>{plan ? plan.name.replace(/^ZON\s/, "") : "Sem plano"}</strong><span>{plan ? KIND_LABEL[plan.kind] ?? plan.kind : "—"}</span></div>
                <div><small>Mensalidade</small><strong>{plan ? kz(plan.priceKz) : "—"}</strong><span>Pagamento por referência</span></div>
                <div><small>Validade</small><strong>{date(c.dueDate)}</strong><span>{rel(c.dueDate, today)}</span></div>
                <div>
                  <small>{plan?.speedMbps ? "Velocidade" : "Canais"}</small>
                  <strong>{plan?.speedMbps ? `${plan.speedMbps} Mbps` : plan?.channels ?? "—"}</strong>
                  <span>{plan?.channels ? `${plan.channels} canais incluídos` : "Sem TV"}</span>
                </div>
              </div>
              {ixcData.contracts.length ? (
                <div className="kv-list mt">
                  {ixcData.contracts.map(({ contract: k, planName }) => {
                    const titles = ixcData.open.filter((r) => r.contractId === k.id);
                    return (
                      <div className="kv-row contract-row" key={k.id}>
                        <div>
                          <strong>Contrato {k.ixcId} no IXC</strong>
                          <small>
                            {planName ?? "Plano por identificar"}{k.amountKz ? ` · ${kz(k.amountKz)}` : ""}
                            {titles.length ? ` · ${titles.length} título${titles.length === 1 ? "" : "s"} em aberto (próximo a ${date(titles[0]!.dueDate)})` : " · sem títulos em aberto"}
                          </small>
                        </div>
                        <Pill s={contractState(k.status, k.internetStatus)} />
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {c.disabledAt ? <p className="muted mt" style={{ fontSize: 12.5 }}>Desativado no backoffice a {date(c.disabledAt)}: fica fora do ciclo de cobrança (sem referências nem SMS).</p> : null}
            </div>
          </article>

          <article className="card">
            <div className="card-head"><div><h2>Referência Multicaixa</h2><p className="sub">Paga em qualquer ATM ou no Multicaixa Express</p></div></div>
            <div className="mt">
              {open ? (
                <div className="ref-card">
                  <span className="mcx"><Landmark className="ico lg" aria-hidden /></span>
                  <div className="ref-fields">
                    <div><small>Entidade</small><strong>{open.entity}</strong></div>
                    <div><small>Referência</small><strong>{refFmt(open.reference)}</strong></div>
                    <div><small>Valor</small><strong>{kz(open.amountKz)}</strong></div>
                  </div>
                  <div className="btn-row">
                    <CopyButton text={`Entidade ${open.entity} · Referência ${refFmt(open.reference)} · ${kz(open.amountKz)}`} done="Referência copiada" />
                    {editor && open.ixcReceivableId && mode !== "desligado" ? (
                      <ActionButton action={resendReferenceSms.bind(null, open.id)} className="btn sm" confirm={`Enviar de novo a referência por SMS a ${c.name}?`}>
                        <Send className="ico sm" aria-hidden />Reenviar SMS
                      </ActionButton>
                    ) : null}
                    {editor && devMocks && open.appypayId ? (
                      <ActionButton action={simulatePayment.bind(null, open.id)} className="btn sm" title="Só no ambiente de desenvolvimento" confirm="Simular o pagamento desta referência na AppyPay de testes?">
                        <FlaskConical className="ico sm" aria-hidden />Simular pagamento
                      </ActionButton>
                    ) : null}
                  </div>
                  <div className="ref-status">
                    <span><Pill s={PAY_STATE.pending} /> &nbsp;Válida até {date(open.dueDate)} ({rel(open.dueDate, today)})</span>
                    {open.sms === "sent"
                      ? <span className="sms-ok"><CheckCheck className="ico xs" aria-hidden />SMS entregue</span>
                      : open.sms === "failed" ? <span className="sms-fail"><CircleX className="ico xs" aria-hidden />SMS falhou</span> : <span className="muted">SMS não enviado</span>}
                  </div>
                </div>
              ) : (
                <div className="ref-card">
                  <span className="mcx" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}><Landmark className="ico lg" aria-hidden /></span>
                  <div>
                    <strong>Sem referência em aberto</strong>
                    <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      {c.disabledAt || c.status === "inactive"
                        ? "Cliente inativo: não recebe referências."
                        : nextTitle
                          ? `Próximo título no IXC: ${kz(nextTitle.amountKz)}, vence a ${date(nextTitle.dueDate)}. ${mode === "ativo" ? "A referência sai por SMS 7 dias antes." : "O ciclo de cobrança não está ativo."}`
                          : ixcData.contracts.length ? "Sem títulos por pagar no IXC." : `A próxima referência é gerada antes de ${date(c.dueDate)}.`}
                    </p>
                  </div>
                  {canGenerate ? (
                    <div className="btn-row">
                      <ActionButton action={generateReferenceNow.bind(null, nextTitle!.id)} className="btn sm primary" confirm={`Criar já a referência de ${kz(nextTitle!.amountKz)} e enviá-la por SMS a ${c.name}?`}>
                        <Landmark className="ico sm" aria-hidden />Gerar referência
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </article>

          <article className="card">
            <div className="card-head"><div><h2>Pagamentos</h2><p className="sub">Últimas {pays.length || ""} referências</p></div></div>
            {pays.length ? (
              <div className="table-wrap mt">
                <table className="data responsive">
                  <thead><tr><th>Mês</th><th>Referência</th><th className="num">Valor</th><th>Emitida</th><th>Paga em</th><th>Estado</th></tr></thead>
                  <tbody>
                    {pays.map(({ payment: x, invoice }) => (
                      <tr key={x.id}>
                        <td className="o1"><strong style={{ textTransform: "capitalize" }}>{monthLabel(x.period.slice(0, 7))}</strong></td>
                        <td className="hide-sm"><span className="mono">{refFmt(x.reference)}</span></td>
                        <td className="num o3">{kz(x.amountKz)}</td>
                        <td className="hide-sm tnum">{date(x.issuedAt)}</td>
                        <td className="o4 right tnum">
                          {x.paidAt ? (
                            <div>
                              <span>{date(x.paidAt)}</span>
                              {invoice?.id ? <PdfButton variant="link" invoiceId={invoice.id} number={invoice.documentNumber} subtitle={`${typeLabel(invoice.ogType)} · ${c.name}`} canShare={editor} /> : null}
                            </div>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td className="o2 right"><Pill s={PAY_STATE[x.status]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty Icon={Landmark}>Ainda sem referências.</Empty>}
          </article>

          <article className="card" id="faturas">
            <div className="card-head">
              <div>
                <h2>Faturas</h2>
                <p className="sub">
                  {!og ? "OfficeGest por configurar"
                    : c.officegestId ? `OfficeGest n.º ${c.officegestId} · ${int(visibleInvs)} documento${visibleInvs === 1 ? "" : "s"}${synced ? ` · sincronizado ${ago(synced)}` : ""}`
                      : "Ainda não ligado ao OfficeGest"}
                </p>
              </div>
              {og ? (
                <ActionButton action={refreshClientInvoices.bind(null, c.id)} className="link link-btn" title="Ler de novo do OfficeGest">
                  <RefreshCw className="ico xs" aria-hidden />Atualizar
                </ActionButton>
              ) : null}
            </div>
            {invs.length ? (
              <div className="table-wrap mt">
                <table className="data responsive">
                  <thead><tr><th>Documento</th><th>Descrição</th><th>Data</th><th className="num">Valor</th><th className="inv-cell" /></tr></thead>
                  <tbody>
                    {invs.map(({ invoice: d, reference }) => (
                      <tr key={d.id} style={d.cancelled ? { opacity: 0.6 } : undefined}>
                        <td className="o1"><div><strong className="mono">{d.documentNumber}</strong><span className="cell-sub">{typeLabel(d.ogType)}</span></div></td>
                        <td className="hide-sm">
                          <div>
                            <span>{d.description ?? typeLabel(d.ogType)}</span>
                            <span className="cell-sub">{d.cancelled ? "Anulada no OfficeGest" : reference ? `Paga com a ref. ${refFmt(reference)}` : d.origin === "officegest" ? "Emitida no OfficeGest" : "Emitida pelo backoffice"}</span>
                          </div>
                        </td>
                        <td className="o4 right tnum">{date(d.date)}</td>
                        <td className="num o3">{d.cancelled ? <span className="pill plain">Anulada</span> : <strong>{kz(d.ogType === "nc" ? -d.total : d.total)}</strong>}</td>
                        <td className="o2 right inv-cell">
                          <div className="inv-actions">
                            <PdfButton invoiceId={d.id} number={d.documentNumber} cancelled={d.cancelled} canShare={editor}
                              subtitle={`${typeLabel(d.ogType)} · ${c.name} · ${d.origin === "officegest" ? "emitida no OfficeGest" : "emitida pelo backoffice"}`} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty Icon={FileText}>
                {c.officegestId ? "Sem faturas no OfficeGest." : c.nif ? "Carregue em Atualizar para procurar o cliente no OfficeGest pelo NIF." : "Sem NIF: o cliente fica ligado ao OfficeGest na primeira fatura."}
              </Empty>
            )}
          </article>
        </div>

        <div className="grid">
          <article className="card">
            <div className="card-head">
              <div><h2>Boxes</h2><p className="sub">{boxes.length ? `${boxes.length} associada${boxes.length === 1 ? "" : "s"} · app ZON TV` : "Nenhuma box associada"}</p></div>
            </div>
            {boxes.map(({ box: x, approvedBy }) => {
              const v = boxView(x, c);
              const device = v === "online" ? "" : v === "blocked" || v === "disabled" ? " blocked" : " off";
              return (
                <div className="box-card" key={x.id}>
                  <div className="box-visual">
                    <span className={`box-device${device}`}><Tv className="ico" aria-hidden /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong className="mono" style={{ fontSize: 14 }}>{x.serial}</strong>
                      <small className="muted" style={{ display: "block", fontSize: 12.5 }}>{x.model ?? "Modelo desconhecido"}</small>
                    </div>
                    <Pill s={BOX_STATE[v]} />
                  </div>
                  <div className="kv-list">
                    <div className="kv-row"><span>Último contacto</span><strong>{x.lastSeenAt ? `${dateTime(x.lastSeenAt)} · ${ago(x.lastSeenAt)}` : "ainda não sincronizou"}</strong></div>
                    <div className="kv-row"><span>Versão da app</span><strong>{x.appVersion ? `${x.appVersion}${x.osVersion ? ` · Android ${x.osVersion}` : ""}` : "—"}</strong></div>
                    <div className="kv-row"><span>Grelha</span><strong>{x.gridVersion ? `v${x.gridVersion}${x.gridVersion === grid.version ? "" : ` · a passar para v${grid.version}`}` : "—"}</strong></div>
                    <div className="kv-row"><span>Na TV (Definições)</span><strong>{tv?.pending ? `Ref. ${refFmt(tv.pending.reference)} · ${kz(tv.pending.amountKz)}` : tv?.nextPayment ? `Próximo pagamento ${date(tv.nextPayment.date)}` : "—"}</strong></div>
                    <div className="kv-row"><span>Aprovada</span><strong>{date(x.approvedAt)}{approvedBy ? ` · ${approvedBy}` : ""}</strong></div>
                  </div>
                  {editor ? (
                    <div className="btn-row">
                      <ActionButton action={setBoxBlocked.bind(null, x.id, !x.blockedAt)} className="btn sm"
                        confirm={x.blockedAt ? undefined : `Bloquear a box ${x.serial}? Deixa de mostrar canais dentro de 1 minuto.`}>
                        {x.blockedAt ? <><LockOpen className="ico sm" aria-hidden />Desbloquear</> : <><Lock className="ico sm" aria-hidden />Bloquear</>}
                      </ActionButton>
                      <ActionButton action={removeBox.bind(null, x.id)} className="btn sm ghost"
                        confirm={`Desassociar a box ${x.serial} de ${c.name}? Para voltar a ver TV precisa de nova aprovação.`}>
                        <Unlink className="ico sm" aria-hidden />Desassociar
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {c.disabledAt && boxes.length ? <p className="muted box-note">Cliente desativado: as boxes não mostram canais até ser ativado de novo.</p> : null}
            {editor ? (
              <div className="card-body box-associate">
                <div>
                  <strong>Associar box</strong>
                  <small>Na box, abrir a ZON TV e indicar o servidor <span className="mono">https://{new URL(env().APP_URL).host}</span> e o serial. Depois aprovar aqui com o código que a TV mostra.</small>
                </div>
                {waiting.rows.length ? waiting.rows.map(({ enrollment: x }) => (
                  <div className="associate-row" key={x.id}>
                    <div><strong className="mono">{x.serial}</strong><small>{x.model ?? "Modelo desconhecido"} · {ago(x.lastSeenAt)}</small></div>
                    <ApproveBox enrollmentId={x.id} serial={x.serial} customer={{ id: c.id, name: c.name, ixcId: c.ixcId }} canReject={false} />
                  </div>
                )) : <small className="muted">Sem pedidos de ativação neste momento.</small>}
                {waiting.total > waiting.rows.length ? <Link className="link" href="/boxes">Ver os {int(waiting.total)} pedidos em Boxes</Link> : null}
                {plan?.kind === "internet" ? <small className="muted">O plano principal deste cliente é só de Internet.</small> : null}
              </div>
            ) : !boxes.length ? <Empty Icon={Tv}>Sem boxes.</Empty> : null}
          </article>

          <article className="card">
            <div className="card-head"><div><h2>Dados</h2></div></div>
            <div className="card-body">
              <div className="kv-list">
                <div className="kv-row"><span>NIF</span><strong className="mono">{c.nif ?? "Consumidor final"}</strong></div>
                <div className="kv-row"><span>Email</span><strong>{c.email ?? "—"}</strong></div>
                <div className="kv-row"><span>Último pagamento</span><strong>{c.lastPaymentAt ? dateTime(c.lastPaymentAt) : "—"}</strong></div>
                <div className="kv-row"><span>Cliente desde</span><strong>{date(c.since)}</strong></div>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="card-head"><div><h2>SMS</h2><p className="sub">Últimas mensagens enviadas a {phoneFmt(c.phone)}</p></div></div>
            {sms.length ? (
              <div className="card-body sms-list">
                <div className="kv-list">
                  {sms.map(({ sms: s, reference }) => (
                    <div className="kv-row" key={s.id}>
                      <div>
                        <strong title={s.body}>{SMS_KIND[s.kind] ?? s.kind}</strong>
                        <small>{dateTime(s.at)}{reference ? ` · ref. ${refFmt(reference)}` : ""}{s.test ? " · número de testes" : ""}</small>
                        {s.error ? <small className="sms-fail">{s.error}</small> : null}
                      </div>
                      <Pill s={SMS_STATE[s.status] ?? SMS_STATE.failed!} />
                    </div>
                  ))}
                </div>
              </div>
            ) : <Empty Icon={MessageSquare}>Ainda sem SMS.</Empty>}
          </article>

          <article className="card">
            <div className="card-head"><h2>Histórico</h2></div>
            <Feed items={feed} empty="Sem histórico." />
          </article>
        </div>
      </div>
    </>
  );
}
