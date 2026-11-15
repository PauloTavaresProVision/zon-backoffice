import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AppyPayConfig } from "@/lib/env";

/** Erro da AppyPay ou de rede. A mensagem é segura para mostrar no backoffice. */
export class AppyPayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AppyPayError";
  }
}

export type AppyPayReferenceInput = {
  referenceNumber: string;
  amount: number;
  descriptionLine1: string;
  descriptionLine2?: string;
  /** Instantes em UTC, "AAAA-MM-DDTHH:MM:SSZ" */
  startDate: string;
  expirationDate: string;
};

export type AppyPayReferenceCreated = {
  paymentId: string | null;
  referenceNumber: string;
  entity: string | null;
  expirationDate: string | null;
};

export type AppyPayCharge = {
  id: string;
  status: string;
  amount: number;
  merchantTransactionId: string | null;
  referenceNumber: string | null;
  entity: string | null;
  /** Quando o cliente pagou, como a rede Multicaixa o indica */
  providerPaidAt: string | null;
  updatedAt: string | null;
};

type Json = Record<string, unknown>;

const TIMEOUT_MS = 30_000;
const asString = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const asNumber = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** Valores inteiros vão sem casas decimais, como a AppyPay espera. */
const amountJson = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);

/** Estado "pago" de uma cobrança na AppyPay. */
export const isPaidStatus = (status: string | null | undefined) => (status ?? "").toLowerCase() === "success";

/**
 * Pedido HTTP só com os cabeçalhos que lhe damos. O fetch do Node junta outros (Accept-Language: *,
 * Sec-Fetch-Mode, User-Agent) e a AppyPay responde 500 a pedidos que o gerador em Python faz sem problema.
 */
function send(method: string, url: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(body, "utf8");
    const req = (url.startsWith("http:") ? httpRequest : httpsRequest)(url, {
      method,
      headers: data ? { ...headers, "Content-Length": String(data.length) } : headers,
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    req.on("error", reject);
    req.end(data);
  });
}

// Token OAuth2 (client credentials) partilhado no processo até perto de expirar
const tokens = new Map<string, { value: string; expiresAt: number }>();

export class AppyPayClient {
  constructor(private readonly cfg: Pick<AppyPayConfig, "url" | "tokenUrl" | "clientId" | "clientSecret" | "resource" | "paymentMethod">) {}

  private async accessToken(): Promise<string> {
    const cached = tokens.get(this.cfg.clientId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      resource: this.cfg.resource,
    });
    let res: Response;
    try {
      res = await fetch(this.cfg.tokenUrl, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      throw new AppyPayError("O serviço de autenticação da AppyPay não está acessível.");
    }
    const json = obj(await res.json().catch(() => null));
    const token = asString(json.access_token);
    if (!res.ok || !token) {
      // Nunca se mostra a resposta inteira: pode trazer identificadores da conta
      const code = asString(json.error) ?? `HTTP ${res.status}`;
      throw new AppyPayError(`A AppyPay recusou as credenciais (${code}).`, res.status);
    }
    const ttl = Math.max(60, asNumber(json.expires_in) || 3600);
    tokens.set(this.cfg.clientId, { value: token, expiresAt: Date.now() + (ttl - 60) * 1000 });
    return token;
  }

  private async request(method: "GET" | "POST", path: string, body?: Json): Promise<{ status: number; json: Json; text: string }> {
    const token = await this.accessToken();
    let res: { status: number; text: string };
    try {
      // Os mesmos cabeçalhos do gerador de referências que funciona (sem Accept-Language)
      res = await send(method, this.cfg.url + path, {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      }, body ? JSON.stringify(body) : undefined);
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "não respondeu a tempo" : "não está acessível";
      throw new AppyPayError(`A AppyPay ${reason}.`);
    }
    if (res.status === 401 || res.status === 403) {
      tokens.delete(this.cfg.clientId);
      throw new AppyPayError("A AppyPay recusou o pedido (autorização).", res.status);
    }
    const text = res.text;
    let json: Json = {};
    try { json = text ? obj(JSON.parse(text)) : {}; } catch {
      throw new AppyPayError(`Resposta inválida da AppyPay (HTTP ${res.status})${text.trim() ? `: ${text.trim().slice(0, 200)}` : ""}.`, res.status);
    }
    if (res.status >= 500) console.error(`[appypay] ${method} ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
    return { status: res.status, json, text };
  }

  /** Mensagem de erro da AppyPay, venha ela no formato que vier. */
  private errorMessage(status: number, json: Json, text: string, first: Json = {}): string {
    const errors = json.errors && typeof json.errors === "object" ? JSON.stringify(json.errors) : null;
    const msg = asString(obj(json.responseStatus).message) ?? asString(obj(first.responseStatus).message) ?? asString(first.message)
      ?? asString(json.message) ?? asString(json.detail) ?? asString(json.title) ?? asString(json.error) ?? errors
      ?? (text.trim() ? text.trim() : null);
    return `AppyPay: HTTP ${status}${msg ? ` · ${msg.slice(0, 300)}` : ""}`;
  }

  /** Cria uma referência Multicaixa. O número é nosso; a AppyPay devolve o id do pagamento. */
  async createReference(input: AppyPayReferenceInput): Promise<AppyPayReferenceCreated> {
    const { status, json, text } = await this.request("POST", "references", {
      paymentMethod: this.cfg.paymentMethod,
      references: [{
        referenceNumber: input.referenceNumber,
        currency: "AOA",
        amounts: [{
          amount: amountJson(input.amount),
          descriptionLine1: input.descriptionLine1.slice(0, 40),
          descriptionLine2: (input.descriptionLine2 || "Entidade 11700").slice(0, 40),
        }],
        minAmount: amountJson(input.amount),
        maxAmount: amountJson(input.amount),
        startDate: input.startDate,
        expirationDate: input.expirationDate,
      }],
      // Valor indicado pelo suporte da AppyPay
      createdBy: "API_Integration",
    });
    const refs = Array.isArray(json.references) ? json.references.map(obj) : [];
    const first = refs[0] ?? {};
    const okFlag = obj(json.responseStatus).successful ?? obj(first.responseStatus).successful;
    if (status >= 400 || okFlag === false) throw new AppyPayError(this.errorMessage(status, json, text, first), status);
    return {
      paymentId: asString(json.id) ?? asString(first.id),
      referenceNumber: asString(first.referenceNumber) ?? input.referenceNumber,
      entity: asString(first.entity),
      expirationDate: asString(first.expirationDate) ?? input.expirationDate,
    };
  }

  /** Estado de um pagamento na AppyPay (a fonte de verdade para dar uma referência como paga). */
  async getCharge(id: string): Promise<AppyPayCharge | null> {
    const { status, json } = await this.request("GET", `charges/${encodeURIComponent(id)}`);
    if (status === 404) return null;
    if (status >= 400) throw new AppyPayError(`AppyPay: ${asString(json.message) ?? `HTTP ${status}`}`, status);
    return toCharge(obj(json.payment ?? json));
  }

  /**
   * Lista de pagamentos na AppyPay (GET /charges), uma página. A criação de referências não devolve o id
   * do pagamento, por isso é por aqui, pelo número da referência, que a verificação periódica as encontra.
   */
  async listCharges(f: { dateFrom: string; dateTo: string; amountFrom?: number; amountTo?: number; skip: number; limit: number }): Promise<AppyPayCharge[]> {
    const q = new URLSearchParams({ dateFrom: f.dateFrom, dateTo: f.dateTo, skip: String(f.skip), limit: String(f.limit) });
    if (f.amountFrom !== undefined) q.set("amountFrom", String(f.amountFrom));
    if (f.amountTo !== undefined) q.set("amountTo", String(f.amountTo));
    const { status, json } = await this.request("GET", `charges?${q}`);
    if (status >= 400) throw new AppyPayError(`AppyPay: ${asString(json.message) ?? `HTTP ${status}`}`, status);
    const list = Array.isArray(json.payments) ? json.payments : [];
    return list.map((p) => toCharge(obj(p))).filter((c): c is AppyPayCharge => !!c);
  }

  /**
   * Referência registada na AppyPay (GET /reference/<número>). A criação é assíncrona (202): isto diz se a
   * AppyPay já a ativou. Não diz se foi paga.
   */
  async getReference(referenceNumber: string): Promise<{ isActive: boolean | null; entity: string | null; dueDate: string | null } | null> {
    const { status, json } = await this.request("GET", `reference/${encodeURIComponent(referenceNumber)}`);
    if (status === 404) return null;
    if (status >= 400) throw new AppyPayError(`AppyPay: ${asString(json.message) ?? `HTTP ${status}`}`, status);
    const r = obj(json.reference ?? json);
    return {
      isActive: typeof r.isActive === "boolean" ? r.isActive : null,
      entity: asString(r.entity),
      dueDate: asString(r.dueDate) ?? asString(r.expirationDate),
    };
  }

  /** Para o botão "Testar ligação": só pede um token. */
  async ping(): Promise<void> {
    await this.accessToken();
  }
}

export function toCharge(p: Json): AppyPayCharge | null {
  const id = asString(p.id);
  if (!id) return null;
  const ref = obj(p.reference);
  return {
    id,
    status: asString(p.status) ?? asString(obj(p.responseStatus).status) ?? "",
    amount: asNumber(p.amount),
    merchantTransactionId: asString(p.merchantTransactionId),
    referenceNumber: asString(ref.referenceNumber),
    entity: asString(ref.entity),
    providerPaidAt: asString(ref.providerPaymentDateTime),
    updatedAt: asString(p.updatedDate),
  };
}
