// Regras do ciclo de cobrança, sem acesso a rede nem à base de dados (testadas em rules.test.ts).
import { randomInt } from "node:crypto";
import { addDays, daysFrom } from "@/lib/format";

/** Dias antes do vencimento em que a referência é criada e enviada. */
export const WINDOW_DAYS = 7;
/** Dias depois do vencimento em que a referência ainda pode ser paga. */
export const GRACE_DAYS = 3;
/** Validade de uma referência nova para um título já vencido. */
export const OVERDUE_VALID_DAYS = 7;
/** Títulos vencidos há mais do que isto já não recebem referência automática. */
export const OVERDUE_MAX_DAYS = 30;

/** Valor a cobrar: o que falta pagar do título; se o IXC não o indicar, o valor do título. */
export function amountToCharge(raw: Record<string, string>): number {
  const n = (v: string | undefined) => {
    const x = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  };
  const open = n(raw.valor_aberto);
  return Math.round(open > 0 ? open : n(raw.valor));
}

/** O título entra no ciclo: vence nos próximos 7 dias ou está em atraso há pouco tempo. */
export function inCycleWindow(dueDate: string, today: string): boolean {
  const d = daysFrom(dueDate, today);
  return d <= WINDOW_DAYS && d >= -OVERDUE_MAX_DAYS;
}

/**
 * Último dia em que a referência pode ser paga (inclusive), em Luanda: o vencimento mais 3 dias;
 * para um título já vencido, uma semana a contar de hoje.
 */
export function referenceLastDay(dueDate: string, today: string): string {
  return dueDate >= today ? addDays(dueDate, GRACE_DAYS) : addDays(today, OVERDUE_VALID_DAYS);
}

/** 23:59:59 de um dia em Luanda (UTC+1), no formato que a AppyPay usa. */
export const endOfDayUtc = (iso: string) => `${iso}T22:59:59Z`;

/** Agora, em UTC sem milissegundos. */
export const nowUtc = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Fase do aviso por SMS conforme os dias até ao vencimento: 7 (primeiro aviso), 3 e 1 (último).
 * Cada fase envia uma só SMS por referência; se o ciclo apanhar o título já tarde, salta as fases passadas.
 */
export function smsStage(daysLeft: number): 7 | 3 | 1 {
  if (daysLeft > 3) return 7;
  if (daysLeft > 1) return 3;
  return 1;
}

export type SmsKind = `stage_${7 | 3 | 1}` | "paid" | "manual";
export const stageKind = (daysLeft: number): SmsKind => `stage_${smsStage(daysLeft)}`;

/** Número de referência Multicaixa: 9 dígitos, sem zero à esquerda. */
export const newReferenceNumber = () => String(randomInt(100_000_000, 1_000_000_000));

/**
 * Período seguinte depois de um pagamento: começa no dia do pagamento e dura 30 dias,
 * mais os dias que ainda faltavam se o cliente pagou antes do vencimento.
 */
export function nextPeriod(paymentDay: string, previousDue: string): { start: string; end: string } {
  const left = Math.max(0, daysFrom(previousDue, paymentDay));
  return { start: paymentDay, end: addDays(paymentDay, 30 + left) };
}

/**
 * Data e hora de pagamento indicadas pela rede Multicaixa. Vêm na hora de Luanda e sem fuso
 * ("2026-10-31 14:05:00", "31/10/2026 14:05:00"...). Devolve null se não se perceber.
 */
export function parseProviderDate(v: string | null | undefined): Date | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  let parts: string[] | null = m ? [m[1]!, m[2]!, m[3]!, m[4] ?? "00", m[5] ?? "00", m[6] ?? "00"] : null;
  if (!parts) {
    m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    parts = m ? [m[3]!, m[2]!, m[1]!, m[4] ?? "00", m[5] ?? "00", m[6] ?? "00"] : null;
  }
  if (!parts) return null;
  const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------- Textos das SMS ---------- */

const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const refText = (r: string) => r.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function when(dueDate: string, today: string): string {
  const d = daysFrom(dueDate, today);
  if (d > 1) return `termina em ${d} dias (${dm(dueDate)})`;
  if (d === 1) return `termina amanhã (${dm(dueDate)})`;
  if (d === 0) return "termina hoje";
  return `terminou a ${dm(dueDate)}`;
}

export type ReferenceSms = {
  name: string;
  service: string;
  dueDate: string;
  today: string;
  entity: string;
  reference: string;
  amount: number;
  support?: string | null;
};

export function referenceSms(x: ReferenceSms): string {
  const first = x.name.trim().split(/\s+/)[0] || "cliente";
  return [
    `Estimado(a) ${first},`,
    `O seu serviço ${x.service} ${when(x.dueDate, x.today)}.`,
    "Renove por Multicaixa:",
    `Entidade: ${x.entity}`,
    `Referência: ${refText(x.reference)}`,
    `Valor: ${group(x.amount)} Kz`,
    ...(x.support ? [`Dúvidas: ${x.support}`] : []),
  ].join("\n");
}

export function paidSms(x: { name: string; amount: number; reference: string }): string {
  const first = x.name.trim().split(/\s+/)[0] || "cliente";
  return `${first}, recebemos o seu pagamento de ${group(x.amount)} Kz (ref. ${refText(x.reference)}). Obrigado por escolher a ZON.`;
}

/** Hora de Luanda em que se podem enviar SMS automáticas (8h às 20h). */
export function smsHours(d = new Date()): boolean {
  const h = (d.getUTCHours() + 1) % 24;
  return h >= 8 && h < 20;
}
