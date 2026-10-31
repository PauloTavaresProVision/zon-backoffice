import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { int } from "@/lib/format";

export function StackBar({ parts, label }: { parts: { label: string; value: number; color: string }[]; label: string }) {
  const total = parts.reduce((a, b) => a + b.value, 0);
  const aria = `${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`;
  return (
    <>
      <div className="meter-track" role="img" aria-label={aria}>
        {total ? parts.map((p) => (p.value ? <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null)) : null}
      </div>
      <div className="meter-legend">
        {parts.map((p) => <span key={p.label}><i className="swatch" style={{ background: p.color }} />{p.label} <b>{int(p.value)}</b></span>)}
      </div>
    </>
  );
}

export function KpiTile({ label, Icon, value, foot, href, attention = false }: {
  label: string; Icon: LucideIcon; value: ReactNode; foot: ReactNode; href?: string; attention?: boolean;
}) {
  const body = (
    <>
      <div className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon className="ico sm" aria-hidden /></span></div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot"><span>{foot}</span></div>
    </>
  );
  const cls = `card kpi${attention ? " attention" : ""}`;
  return href ? <Link className={cls} href={href}>{body}</Link> : <article className={cls}>{body}</article>;
}

/** Paginação com links: funciona sem JavaScript e o botão "voltar" do browser respeita-a. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const list = [...set].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  list.forEach((p, i) => {
    if (i && p - list[i - 1]! > 1) out.push(<span key={`gap${p}`} className="off">…</span>);
    out.push(p === page ? <span key={p} className="on" aria-current="page">{p}</span> : <Link key={p} href={href(p)}>{p}</Link>);
  });
  return (
    <nav className="pager" aria-label="Páginas">
      {page > 1 ? <Link href={href(page - 1)} aria-label="Página anterior"><ChevronLeft className="ico xs" aria-hidden /></Link> : <span className="off"><ChevronLeft className="ico xs" aria-hidden /></span>}
      {out}
      {page < pages ? <Link href={href(page + 1)} aria-label="Página seguinte"><ChevronRight className="ico xs" aria-hidden /></Link> : <span className="off"><ChevronRight className="ico xs" aria-hidden /></span>}
    </nav>
  );
}

export function Empty({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return <div className="empty"><Icon className="ico" aria-hidden />{children}</div>;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Só os parâmetros de texto, para os componentes que reescrevem o URL. */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) out[k] = v;
  return out;
}

export function withParams(path: string, base: Record<string, string>, patch: Record<string, string | number | null>): string {
  const q = new URLSearchParams(base);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "" || v === "all" || (k === "pagina" && v === 1)) q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const pageParam = (v: string | undefined) => Math.max(1, Math.min(10_000, Number.parseInt(v ?? "1", 10) || 1));
