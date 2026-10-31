import type { IxcConfig } from "@/lib/env";

/** Erro do IXC ou de rede. A mensagem é segura para mostrar no backoffice. */
export class IxcError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "IxcError";
  }
}

// Campos do IXC que o backoffice lê; vêm sempre preenchidos (com "" quando o IXC não os manda)
const FIELDS = [
  "id", "id_cliente", "id_contrato", "id_vd_contrato", "contrato", "status", "status_internet", "pago_ate_data",
  "data_ativacao", "razao", "fantasia", "telefone_celular", "whatsapp", "fone", "email", "cnpj_cpf", "bairro",
  "data_cadastro", "data_vencimento", "valor", "valor_aberto", "nparcela", "filial_id", "id_carteira_cobranca",
  "id_conta", "previsao", "tipo_recebimento",
] as const;

export type IxcRecord = Record<(typeof FIELDS)[number], string> & Record<string, string>;

export type IxcQuery = {
  qtype: string;
  query: string;
  oper: "=" | ">" | "<" | ">=" | "<=" | "!=" | "L";
  page?: number;
  rp?: number;
  sortname?: string;
  sortorder?: "asc" | "desc";
};

const TIMEOUT_MS = 60_000;
const PAGE_SIZE = 500;
// Teto de segurança contra ciclos sem fim (500 × 400 = 200 mil registos)
const MAX_PAGES = 400;

/** O IXC devolve tudo como texto; números e datas vazios vêm como "" ou "0000-00-00". */
const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "0000-00-00" || s === "0000-00-00 00:00:00" ? "" : s;
};

export function toRecord(v: unknown): IxcRecord {
  const out: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f, ""]));
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) out[k] = clean(x);
  return out as IxcRecord;
}

/** "dd/mm/aaaa" para escrever no IXC. */
export const ixcDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Lê datas do IXC ("aaaa-mm-dd", com ou sem hora, ou "dd/mm/aaaa") como "aaaa-mm-dd". */
export function fromIxcDate(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] === "0000" ? null : `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export const ixcMoney = (v: string | undefined | null): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export class IxcClient {
  private readonly auth: string;
  private readonly base: string;

  constructor(cfg: Pick<IxcConfig, "url" | "token">) {
    this.auth = "Basic " + Buffer.from(cfg.token).toString("base64");
    this.base = cfg.url.endsWith("/") ? cfg.url : cfg.url + "/";
  }

  private async send(method: "GET" | "POST" | "PUT", table: string, opts: { list?: boolean; json?: unknown; form?: Record<string, string> }): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { Authorization: this.auth, Accept: "application/json" };
    if (opts.list) headers.ixcsoft = "listar";
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = new URLSearchParams(opts.form);
    }
    let res: Response;
    try {
      res = await fetch(this.base + table, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "não respondeu a tempo" : "não está acessível";
      throw new IxcError(`O IXC ${reason}.`);
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new IxcError("O IXC recusou o token de acesso.", res.status);
    let json: Record<string, unknown>;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new IxcError(`Resposta inválida do IXC em ${table} (HTTP ${res.status}).`, res.status);
    }
    // O IXC responde 200 com {"type":"error"} quando recusa a operação
    if (!res.ok || String(json.type ?? "").toLowerCase() === "error") {
      const msg = clean(json.message) || `HTTP ${res.status}`;
      throw new IxcError(`IXC (${table}): ${msg.replace(/<[^>]+>/g, " ").slice(0, 300)}`, res.status);
    }
    return json;
  }

  /** Uma página de uma tabela. Alguns recursos só aceitam o filtro como formulário. */
  async listPage(table: string, q: IxcQuery, asForm = false): Promise<{ total: number; rows: IxcRecord[] }> {
    const params = {
      qtype: q.qtype,
      query: q.query,
      oper: q.oper,
      page: String(q.page ?? 1),
      rp: String(q.rp ?? PAGE_SIZE),
      sortname: q.sortname ?? `${table}.id`,
      sortorder: q.sortorder ?? "asc",
    };
    const json = await this.send("POST", table, { list: true, ...(asForm ? { form: params } : { json: params }) });
    const rows = Array.isArray(json.registros) ? json.registros.map(toRecord) : [];
    return { total: Number(json.total ?? rows.length) || rows.length, rows };
  }

  /** Todas as páginas. Pára quando uma página vem incompleta. */
  async listAll(table: string, q: Omit<IxcQuery, "page" | "rp">, asForm = false): Promise<IxcRecord[]> {
    const all: IxcRecord[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { rows } = await this.listPage(table, { ...q, page, rp: PAGE_SIZE }, asForm);
      all.push(...rows);
      if (rows.length < PAGE_SIZE) return all;
    }
    throw new IxcError(`O IXC devolveu mais de ${MAX_PAGES * PAGE_SIZE} registos em ${table}; sincronização interrompida.`);
  }

  async getById(table: string, id: string, asForm = false): Promise<IxcRecord | null> {
    const { rows } = await this.listPage(table, { qtype: `${table}.id`, query: id, oper: "=", rp: 1 }, asForm);
    return rows[0] ?? null;
  }

  async update(table: string, id: string, form: Record<string, string>): Promise<void> {
    await this.send("PUT", `${table}/${encodeURIComponent(id)}`, { form });
  }

  async create(table: string, form: Record<string, string>): Promise<string> {
    const json = await this.send("POST", table, { form });
    const id = clean(json.id);
    if (!id) throw new IxcError(`O IXC aceitou o registo em ${table} mas não devolveu o id.`);
    return id;
  }

  async postJson(table: string, payload: Record<string, string>): Promise<Record<string, unknown>> {
    return this.send("POST", table, { json: payload });
  }
}
