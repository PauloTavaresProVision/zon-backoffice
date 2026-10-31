"use client";

import {
  HandCoins, Layers, LayoutDashboard, ListVideo, LogOut, Menu, Receipt, Settings, SunMoon, Tv, UserCog, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/auth/actions";
import { flipTheme } from "./theme";

type Item = { href: string; label: string; Icon: LucideIcon; count?: "clientes"; soon?: boolean };

export const NAV: { group: string; items: Item[] }[] = [
  { group: "Geral", items: [{ href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard }] },
  { group: "Clientes", items: [
    { href: "/clientes", label: "Clientes", Icon: Users, count: "clientes" },
    { href: "/boxes", label: "Boxes", Icon: Tv },
  ] },
  { group: "Serviço", items: [
    { href: "/planos", label: "Planos", Icon: Layers },
    { href: "/canais", label: "Canais & grelhas", Icon: ListVideo },
  ] },
  { group: "Financeiro", items: [
    { href: "/pagamentos", label: "Pagamentos", Icon: Receipt },
    { href: "/cobranca", label: "Cobrança", Icon: HandCoins },
  ] },
  { group: "Sistema", items: [
    { href: "/utilizadores", label: "Utilizadores", Icon: UserCog },
    { href: "/definicoes", label: "Definições", Icon: Settings },
  ] },
];

const isOn = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function SidebarNav({ counts }: { counts: { clientes: string } }) {
  const pathname = usePathname();
  return (
    <nav>
      {NAV.map((g) => (
        <div className="nav-group" key={g.group}>
          <div className="nav-caption">{g.group}</div>
          {g.items.map((it) => (
            <Link key={it.href} href={it.href} className={`nav-item${isOn(pathname, it.href) ? " active" : ""}`} title={it.label}
              aria-current={isOn(pathname, it.href) ? "page" : undefined}>
              <it.Icon className="ico" aria-hidden />
              <span className="label">{it.label}</span>
              {it.count ? <span className="nav-count">{counts[it.count]}</span> : null}
              {it.soon ? <span className="soon">Breve</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

const TABS: Item[] = [
  { href: "/dashboard", label: "Início", Icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", Icon: Users },
  { href: "/pagamentos", label: "Pagamentos", Icon: Receipt },
  { href: "/planos", label: "Planos", Icon: Layers },
];
const MORE: Item[] = [
  { href: "/cobranca", label: "Cobrança", Icon: HandCoins },
  { href: "/boxes", label: "Boxes", Icon: Tv },
  { href: "/canais", label: "Canais & grelhas", Icon: ListVideo },
  { href: "/utilizadores", label: "Utilizadores", Icon: UserCog },
  { href: "/definicoes", label: "Definições", Icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const moreOn = MORE.some((m) => isOn(pathname, m.href));
  return (
    <div className={open ? "sheet-open" : undefined}>
      <nav className="tabbar" aria-label="Navegação rápida">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={isOn(pathname, t.href) ? "on" : undefined}>
            <t.Icon className="ico" aria-hidden /><span>{t.label}</span>
          </Link>
        ))}
        <button type="button" className={moreOn ? "on" : undefined} onClick={() => setOpen(true)} aria-expanded={open}>
          <Menu className="ico" aria-hidden /><span>Mais</span>
        </button>
      </nav>
      <div className="sheet-backdrop" onClick={() => setOpen(false)} />
      <div className="sheet" role="dialog" aria-label="Mais opções" aria-hidden={!open}>
        <div className="sheet-grip" />
        <div className="sheet-grid">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href}><m.Icon className="ico lg" aria-hidden />{m.label}</Link>
          ))}
          <button type="button" onClick={flipTheme}><SunMoon className="ico lg" aria-hidden />Tema</button>
          <form action={logout} className="inline">
            <button type="submit" style={{ width: "100%" }}><LogOut className="ico lg" aria-hidden />Sair</button>
          </form>
        </div>
      </div>
    </div>
  );
}
