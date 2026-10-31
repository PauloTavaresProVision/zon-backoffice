import type { OfficeGestConfig } from "@/lib/env";

/** Erro devolvido pelo OfficeGest ou de rede. A mensagem é segura para mostrar no backoffice. */
export class OfficeGestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OfficeGestError";
  }
}

export type OgDocumentSummary = {
  number: string;
  serie?: string;
  idcustomer: number | null;
  total: number;
  paidValue: number | null;
  state: string | null;
  date: string; // AAAA-MM-DD
  documentNumber: string;
  dateAlter: string | null; // AAAA-MM-DD HH:MM:SS
};

export type OgDocumentLineInput = {
  idarticle: string;
  quantity: number;
  sellingprice: number;
  extradescription?: string;
  vatid?: string | null;
};

export type OgCustomerInput = {
  name: string;
  customertaxid: string;
  mobilephone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  zipcode?: string | null;
  country?: string;
};

type Json = Record<string, unknown>;

const TIMEOUT_MS = 20_000;

const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const asString = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/** O OfficeGest devolve listas ora como array, ora como objeto indexado. */
export function listValues(v: unknown): Json[] {
  if (Array.isArray(v)) return v.filter((x): x is Json => !!x && typeof x === "object");
  if (v && typeof v === "object") return Object.values(v).filter((x): x is Json => !!x && typeof x === "object");
  return [];
}

export function toDocumentSummary(d: Json): OgDocumentSummary {
  return {
    number: String(d.number ?? ""),
    serie: asString(d.serie) ?? undefined,
    idcustomer: asNumber(d.idcustomer),
    total: asNumber(d.total) ?? 0,
    paidValue: asNumber(d.paid_value),
    state: asString(d.state),
    date: String(d.date ?? "").slice(0, 10),
    documentNumber: asString(d.documentnumber) ?? String(d.number ?? ""),
    dateAlter: asString(d.date_alter),
  };
}

/** Estado de documento anulado. No OfficeGest o detalhe tem `anulado: "T"`; na lista vem só `state`. */
export function isCancelled(state: string | null | undefined, anulado?: unknown): boolean {
  if (anulado === "T" || anulado === true || anulado === 1) return true;
  return !!state && /^anu|anul|cancel/i.test(state);
}

export class OfficeGestClient {
  private readonly auth: string;

  constructor(private readonly cfg: Pick<OfficeGestConfig, "url" | "user" | "key">) {
    this.auth = "Basic " + Buffer.from(`${cfg.user}:${cfg.key}`).toString("base64");
  }

  private async request(method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: BodyInit } = {}): Promise<Json> {
    const url = new URL(this.cfg.url + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: this.auth, Accept: "application/json" },
        body: opts.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "não respondeu a tempo" : "não está acessível";
      throw new OfficeGestError(`O OfficeGest ${reason}.`);
    }
    const text = await res.text();
    let json: Json | null = null;
    try { json = text ? (JSON.parse(text) as Json) : {}; } catch { json = null; }
    if (res.status === 401 || res.status === 403) throw new OfficeGestError("O OfficeGest recusou as credenciais.", res.status);
    if (!json) throw new OfficeGestError(`Resposta inválida do OfficeGest (HTTP ${res.status}).`, res.status);
    if (!res.ok || json.result === "error") {
      const msg = asString(json.message) ?? asString(json.error) ?? `HTTP ${res.status}`;
      throw new OfficeGestError(`OfficeGest: ${msg.slice(0, 300)}`, res.status);
    }
    return json;
  }

  /** Tipos de documento de venda que a conta tem. Serve também para testar a ligação. */
  async listDocumentTypes(): Promise<{ code: string; description: string }[]> {
    const json = await this.request("GET", "/sales/documents");
    const raw = json.documents ?? json.types ?? json.document_types ?? json;
    return listValues(raw).map((t) => ({
      code: String(t.code ?? t.id ?? t.type ?? t.generaltype ?? ""),
      description: String(t.description ?? t.typedescription ?? t.name ?? ""),
    })).filter((t) => t.code);
  }

  async listDocuments(type: string, opts: {
    filters?: Record<string, string>;
    operator?: string;
    limit?: number;
    offset?: number;
    order?: string;
    sorder?: "ASC" | "DESC";
  } = {}): Promise<{ documents: OgDocumentSummary[]; total: number | null }> {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.filters ?? {})) query[`filter[${k}]`] = v;
    if (opts.operator) query.operator = opts.operator;
    if (opts.limit) query.limit = String(opts.limit);
    if (opts.offset) query.offset = String(opts.offset);
    if (opts.order) query.order = opts.order;
    if (opts.sorder) query.sorder = opts.sorder;
    const json = await this.request("GET", `/sales/documents/${encodeURIComponent(type)}`, { query });
    return { documents: listValues(json.documents).map(toDocumentSummary), total: asNumber(json.total) };
  }

  /** Detalhe de um documento. Com `print`, o OfficeGest devolve em `pdf` um link para o PDF. */
  async getDocument(type: string, number: string, print?: "A" | "T" | "O"): Promise<{ document: Json; lines: Json[]; pdfUrl: string | null }> {
    const query: Record<string, string> = print ? { print } : {};
    const json = await this.request("GET", `/sales/documents/${encodeURIComponent(type)}/${encodeURIComponent(number)}`, { query });
    const document = (json.document && typeof json.document === "object" ? json.document : {}) as Json;
    return { document, lines: listValues(json.lines), pdfUrl: asString(json.pdf) ?? asString(document.pdf) };
  }

  async downloadPdf(pdfUrl: string): Promise<Buffer> {
    let url: URL;
    try { url = new URL(pdfUrl, this.cfg.url); } catch { throw new OfficeGestError("O OfficeGest devolveu um link de PDF inválido."); }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new OfficeGestError("O OfficeGest devolveu um link de PDF inválido.");
    // O link costuma ser temporário e público; só enviamos credenciais se for do próprio OfficeGest.
    const sameHost = url.host === new URL(this.cfg.url).host;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: sameHost ? { Authorization: this.auth } : {},
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
    } catch {
      throw new OfficeGestError("Não foi possível descarregar o PDF do OfficeGest.");
    }
    if (!res.ok) throw new OfficeGestError(`O PDF do OfficeGest deu erro (HTTP ${res.status}).`, res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new OfficeGestError("O OfficeGest não devolveu um PDF.");
    return buf;
  }

  async findCustomerByTaxId(taxId: string): Promise<number | null> {
    const json = await this.request("GET", "/entities/customers", { query: { "filter[customertaxid]": taxId, limit: "5" } });
    const found = listValues(json.customers).find((c) => String(c.customertaxid ?? "").replace(/\s/g, "") === taxId.replace(/\s/g, ""));
    return found ? asNumber(found.id) : null;
  }

  async createCustomer(c: OgCustomerInput): Promise<number> {
    const body = new URLSearchParams();
    body.set("name", c.name);
    body.set("customertaxid", c.customertaxid);
    body.set("country", c.country ?? "AO");
    if (c.mobilephone) body.set("mobilephone", c.mobilephone);
    if (c.email) body.set("email", c.email);
    if (c.address) body.set("address", c.address);
    if (c.city) body.set("city", c.city);
    if (c.zipcode) body.set("zipcode", c.zipcode);
    const json = await this.request("POST", "/entities/customers", { body });
    const id = asNumber(json.customer_id) ?? asNumber((json.customer as Json | undefined)?.id);
    if (!id) throw new OfficeGestError("O OfficeGest criou o cliente mas não devolveu o id.");
    return id;
  }

  async createDocument(type: string, doc: { idcustomer: number; lines: OgDocumentLineInput[] }): Promise<OgDocumentSummary> {
    const form = new FormData();
    form.set("idcustomer", String(doc.idcustomer));
    doc.lines.forEach((l, i) => {
      form.set(`lines[${i}][idarticle]`, l.idarticle);
      form.set(`lines[${i}][quantity]`, String(l.quantity));
      form.set(`lines[${i}][sellingprice]`, String(l.sellingprice));
      if (l.extradescription) form.set(`lines[${i}][extradescription]`, l.extradescription);
      if (l.vatid) form.set(`lines[${i}][vatid]`, l.vatid);
    });
    form.set("sendemail", "0");
    const json = await this.request("POST", `/sales/documents/${encodeURIComponent(type)}`, { body: form });
    const raw = (json.document && typeof json.document === "object" ? json.document : json) as Json;
    const summary = toDocumentSummary(raw);
    if (!summary.number) throw new OfficeGestError("O OfficeGest criou o documento mas não devolveu o número.");
    if (summary.documentNumber === summary.number && asString(json.document_number)) summary.documentNumber = String(json.document_number);
    return summary;
  }
}
