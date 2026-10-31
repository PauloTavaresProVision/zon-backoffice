"use client";

import { ChevronRight, FileText, Receipt, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { initials, kz, refFmt } from "@/lib/format";
import { ZonLogo } from "./logo";
import { ThemeButton } from "./theme";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard", clientes: "Clientes", boxes: "Boxes", planos: "Planos", canais: "Canais & grelhas",
  pagamentos: "Pagamentos", cobranca: "Cobrança", utilizadores: "Utilizadores", definicoes: "Definições",
};

type Results = {
  clients: { id: number; name: string; ixcId: number }[];
  refs: { customerId: number; reference: string; amountKz: number }[];
  docs: { customerId: number; documentNumber: string; total: number }[];
};

function GlobalSearch({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) { setRes(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        // POST: nomes e telefones não ficam nos registos de acesso
        const r = await fetch("/api/pesquisa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: v }), signal: ctl.signal });
        if (r.ok) setRes(await r.json());
      } catch {
        // pedido cancelado ou rede em baixo: fica o último resultado
      }
    }, 160);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  const go = (href: string) => { setQ(""); setOpen(false); input.current?.blur(); onNavigate(); router.push(href); };
  const items: { href: string; node: React.ReactNode; group: string }[] = res ? [
    ...res.clients.map((c) => ({ group: "Clientes", href: `/clientes/${c.id}`, node: <><span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(c.name)}</span>{c.name}<small>IXC {c.ixcId}</small></> })),
    ...res.refs.map((r) => ({ group: "Referências", href: `/clientes/${r.customerId}`, node: <><Receipt className="ico sm" aria-hidden /><span className="mono">{refFmt(r.reference)}</span><small>{kz(r.amountKz)}</small></> })),
    ...res.docs.map((d) => ({ group: "Faturas", href: `/clientes/${d.customerId}`, node: <><FileText className="ico sm" aria-hidden /><span className="mono">{d.documentNumber}</span><small>{kz(d.total)}</small></> })),
  ] : [];

  return (
    <div className="search" ref={box}>
      <Search className="ico sm" aria-hidden />
      <input
        ref={input}
        type="search"
        placeholder="Procurar cliente, telefone, NIF, referência ou fatura…"
        autoComplete="off"
        aria-label="Pesquisa global"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setQ(""); setOpen(false); input.current?.blur(); }
          if (e.key === "Enter" && items[0]) go(items[0].href);
        }}
      />
      <span className="kbd">Ctrl K</span>
      {open && q.trim().length >= 2 && res ? (
        <div className="search-results">
          {items.length ? items.map((it, i) => (
            <Fragment key={`${it.group}-${i}`}>
              {i === 0 || items[i - 1]?.group !== it.group ? <div className="sr-group">{it.group}</div> : null}
              <a className="sr-item" href={it.href} onClick={(e) => { e.preventDefault(); go(it.href); }}>{it.node}</a>
            </Fragment>
          )) : <div className="sr-empty">Sem resultados para “{q.trim()}”</div>}
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({ me }: { me: { name: string } }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const seg = pathname.split("/").filter(Boolean);
  const crumbs = [TITLES[seg[0] ?? ""] ?? "Zon Backoffice", ...(seg[0] === "clientes" && seg[1] ? ["Ficha do cliente"] : [])];
  return (
    <header className={`topbar${searchOpen ? " search-open" : ""}`}>
      <Link className="topbar-logo" href="/dashboard" aria-label="Início"><ZonLogo /></Link>
      <div className="crumbs">
        {crumbs.map((c, i) => i === crumbs.length - 1
          ? <strong key={c}>{c}</strong>
          : <Fragment key={c}><Link href={`/${seg[0]}`}>{c}</Link><ChevronRight className="ico xs" aria-hidden /></Fragment>)}
      </div>
      <div className="spacer mobile-only" />
      <GlobalSearch onNavigate={() => setSearchOpen(false)} />
      <button type="button" className="icon-btn mobile-only" aria-label="Pesquisar" onClick={() => setSearchOpen((v) => !v)}>
        <Search className="ico" aria-hidden />
      </button>
      <ThemeButton />
      <Link className="avatar gold mobile-only" href="/utilizadores" aria-label="Utilizadores">{initials(me.name)}</Link>
    </header>
  );
}
