// Regras do catálogo e das grelhas. Sem base de dados: corre no servidor, no editor (browser) e nos testes.
import type { GridChannel } from "@/lib/db/schema";

// As categorias que a app da box conhece; outra qualquer aparece lá como "Outros"
export const CATEGORIES = ["Angola", "Desporto", "Filmes e séries", "Notícias", "Infantil", "Música", "Rádio", "Documentários", "Outros"] as const;
export type Category = (typeof CATEGORIES)[number];

// Limites da app (Catalog.kt e ManagementClient.parseChannels)
export const MAX_GRID = 1000;
export const MAX_NAME = 120;
// Abaixo do limite de 1 MB das ações do servidor do Next; 1000 canais dão cerca de 450 KB
export const MAX_XML_BYTES = 900_000;
export const DEFAULT_PORT = 1234;

export type CatalogChannel = { id: number; name: string; ip: string; port: number; category: string; active: boolean };
export type ChannelInput = { name: string; ip: string; port: number; category: Category };

/** Como a app compara nomes (logótipos, pesquisa): sem acentos, minúsculas. */
export const normName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export const address = (c: { ip: string; port: number }) => `${c.ip}:${c.port}`;

export function isMulticast(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return false;
  const first = Number(parts[0]);
  return first >= 224 && first <= 239;
}

export const isCategory = (v: unknown): v is Category => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

/** Valida o formulário de um canal com as mesmas regras da box. Lança Error com a mensagem para o operador. */
export function channelInput(raw: { name: unknown; ip: unknown; port: unknown; category: unknown }): ChannelInput {
  const name = typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > MAX_NAME) throw new Error(`O nome do canal tem de ter entre 1 e ${MAX_NAME} caracteres.`);
  const ip = typeof raw.ip === "string" ? raw.ip.trim() : "";
  if (!isMulticast(ip)) throw new Error("Endereço multicast inválido: tem de estar entre 224.0.0.0 e 239.255.255.255.");
  const port = Number(raw.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("A porta tem de ser um número entre 1 e 65535.");
  if (!isCategory(raw.category)) throw new Error("Escolha uma categoria da lista.");
  return { name, ip, port, category: raw.category };
}

/** A mesma heurística da app (Catalog.category), para os canais novos que chegam no XML. */
export function guessCategory(name: string): Category {
  const n = normName(name);
  const has = (...words: string[]) => words.some((w) => n.includes(w));
  if (has(" fm", "radio", "world service", "african languages", "voice of america")) return "Rádio";
  if (has("tpa", "zimbo", "girassol tv", "banda tv", "kwenda magic")) return "Angola";
  if (n.startsWith("ss ") || has("supersport", "espn", "wwe")) return "Desporto";
  if (has("cartoon", "disney", "nick", "cbeebies", "dreamworks", "jim jam", "panda", "biggs")) return "Infantil";
  if (has("news", "noticias", "cnn", "al jazeera", "cnbc", "bloomberg", "ndtv", "africanews", "arise")) return "Notícias";
  if (has("music", "mtv", "trace", "hip tv", "sound city")) return "Música";
  if (has("discovery", "geographic", "nat geo", "history", "curiosity")) return "Documentários";
  if (has("movie", "cin", "m-net", "universal", "axn", "star ", "telemundo", "pipoca", "rok", "magic", "tln", "comedy", "bravo")) return "Filmes e séries";
  return "Outros";
}

/** Ids pela ordem da TV → canais numerados de 1 a n, como a box os recebe. Ignora repetidos e inativos. */
export function buildLineup(ids: readonly number[], byId: ReadonlyMap<number, CatalogChannel>): { ids: number[]; channels: GridChannel[] } {
  const seen = new Set<number>();
  const out: { ids: number[]; channels: GridChannel[] } = { ids: [], channels: [] };
  for (const id of ids) {
    const c = byId.get(id);
    if (!c || !c.active || seen.has(id)) continue;
    seen.add(id);
    out.ids.push(id);
    out.channels.push({ number: out.ids.length, name: c.name, ip: c.ip, port: c.port, category: c.category });
  }
  return out;
}

/** Erro para mostrar ao publicar, ou null se a box aceita esta grelha. */
export function lineupProblem(channels: readonly GridChannel[]): string | null {
  if (!channels.length) return "A grelha está vazia: adicione pelo menos um canal.";
  if (channels.length > MAX_GRID) return `A box aceita no máximo ${MAX_GRID} canais.`;
  const addresses = new Set(channels.map(address));
  if (addresses.size !== channels.length) return "Há canais com o mesmo endereço multicast e porta.";
  return null;
}

// Maior subsequência crescente: os canais que ficaram na mesma ordem relativa não contam como movidos
function lisLength(seq: readonly number[]): number {
  const tails: number[] = [];
  for (const x of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

export type Lineup = { ids: readonly number[]; channels: readonly GridChannel[] };
export type LineupDiff = {
  added: number[]; removed: number[]; edited: number[];
  // Canais arrastados para outro sítio (o mínimo que explica a nova ordem)
  moved: number;
  // Canais que mudam de número na TV, por terem sido movidos ou por outros terem entrado ou saído
  renumbered: number;
  total: number;
};

/** O que muda nas boxes entre a versão publicada e a próxima. */
export function diffLineup(before: Lineup | null, after: Lineup): LineupDiff {
  const pos = new Map<number, number>();
  (before?.ids ?? []).forEach((id, i) => pos.set(id, i));
  const now = new Set(after.ids);
  const added: number[] = [];
  const edited: number[] = [];
  const kept: number[] = [];
  let renumbered = 0;
  after.ids.forEach((id, i) => {
    const j = pos.get(id);
    if (j === undefined) return void added.push(id);
    kept.push(j);
    if (j !== i) renumbered++;
    const a = before!.channels[j];
    const b = after.channels[i];
    if (a && b && (a.name !== b.name || a.ip !== b.ip || a.port !== b.port || a.category !== b.category)) edited.push(id);
  });
  const removed = (before?.ids ?? []).filter((id) => !now.has(id));
  const moved = kept.length - lisLength(kept);
  return { added, removed, edited, moved, renumbered, total: added.length + removed.length + edited.length + moved };
}

export const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Resumo curto das alterações: "+2 · −1 · 3 movidos · 1 editado". */
export function diffSummary(d: LineupDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`+${d.added.length}`);
  if (d.removed.length) parts.push(`−${d.removed.length}`);
  if (d.moved) parts.push(`${d.moved} movido${d.moved === 1 ? "" : "s"}`);
  if (d.edited.length) parts.push(`${d.edited.length} editado${d.edited.length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "sem alterações";
}

/* ---------- XML do headend (DVB ServiceDiscovery, o mesmo formato que a app importa) ---------- */

export type XmlService = { number: number; name: string; ip: string; port: number };

const SDNS = "urn:dvb:metadata:iptv:sdns:2008-1";

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? Number.parseInt(k.slice(2), 16) : Number.parseInt(k.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!.replace(/^[\w.-]+:/, "")] = decodeXml(m[2] ?? m[3] ?? "");
  return out;
}

/** Lê a lista de serviços do XML. Recusa DTD/entidades, como a app. Lança Error com a mensagem para o operador. */
export function parseSdns(xml: string): XmlService[] {
  if (xml.length > MAX_XML_BYTES) throw new Error("O XML excede 900 KB.");
  if (xml.includes("\u0000") || xml.includes("�")) throw new Error("Use um XML com codificação UTF-8.");
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml)) throw new Error("Declarações DTD e entidades não são permitidas.");
  const text = xml.replace(/<!--[\s\S]*?-->/g, "");
  // attrs() tira o prefixo: xmlns:dvb="…" fica em "dvb"; sem prefixo, o espaço de nomes está em "xmlns"
  const root = /<(?:([\w.-]+):)?ServiceDiscovery\b([^>]*)>/.exec(text);
  const ns = root ? attrs(root[2] ?? "")[root[1] ?? "xmlns"] : undefined;
  if (!root || ns !== SDNS) throw new Error("Formato incompatível: é preciso um XML DVB ServiceDiscovery, como o do headend.");
  const blocks = [...text.matchAll(/<(?:[\w.-]+:)?SingleService\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?SingleService>/g)];
  if (!blocks.length || blocks.length > MAX_GRID) throw new Error(`A lista deve ter entre 1 e ${MAX_GRID} canais.`);
  const list = blocks.map((b, i) => {
    const body = b[1] ?? "";
    const one = (re: RegExp, what: string) => {
      const found = [...body.matchAll(re)];
      if (found.length !== 1) throw new Error(`Campo ${what} em falta ou repetido no canal ${i + 1}.`);
      return found[0]!;
    };
    const address = attrs(one(/<(?:[\w.-]+:)?IPMulticastAddress\b([^>]*)\/?>/g, "IPMulticastAddress")[1] ?? "");
    const name = decodeXml(attrs(one(/<(?:[\w.-]+:)?TextualIdentifier\b([^>]*)\/?>/g, "TextualIdentifier")[1] ?? "").ServiceName ?? "").trim();
    const lcn = one(/<(?:[\w.-]+:)?LogicalChannelNumber\b[^>]*>([^<]*)<\/(?:[\w.-]+:)?LogicalChannelNumber>/g, "LogicalChannelNumber")[1] ?? "";
    const ip = (address.Source ?? "").trim();
    const port = Number((address.Port ?? "").trim());
    const number = Number(decodeXml(lcn).trim());
    if (!isMulticast(ip)) throw new Error(`Endereço multicast inválido no canal ${i + 1}.`);
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(number) || number < 1 || number > 65535 || !name || name.length > MAX_NAME) {
      throw new Error(`Nome, número ou porta inválidos no canal ${i + 1}.`);
    }
    return { number, name, ip, port };
  });
  list.sort((a, b) => a.number - b.number);
  if (new Set(list.map((s) => s.number)).size !== list.length) throw new Error("Há números de canal repetidos.");
  if (new Set(list.map(address)).size !== list.length) throw new Error("Há serviços repetidos (mesmo endereço e porta).");
  return list;
}
