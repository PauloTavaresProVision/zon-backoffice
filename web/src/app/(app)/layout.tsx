import { CircleCheck, LogOut, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { ago, initials, int } from "@/lib/format";
import { JOBS } from "@/lib/jobs";
import { appypayConfig, cycleMode, ixcConfig, officegestConfig } from "@/lib/env";
import { clientCounts, jobStatus } from "@/lib/queries";
import { ZonLogo } from "@/components/logo";
import { MobileNav, SidebarNav } from "@/components/nav";
import { Toaster } from "@/components/toast";
import { Topbar } from "@/components/topbar";

const ROLE_LABEL = { admin: "Administrador", operador: "Operador", consulta: "Consulta" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [counts, jobs] = await Promise.all([clientCounts(), jobStatus()]);
  const og = officegestConfig();
  const sync = jobs.last.get(JOBS.sync.name);
  const ogOk = !!og && (!sync || sync.ok !== false);
  const warnings = (ogOk ? 0 : 1) + [...jobs.last.values()].filter((j) => j.ok === false && j.job !== JOBS.sync.name).length;
  const mode = cycleMode();
  /** Ponto e texto de uma integração a partir da sua tarefa principal. */
  const row = (name: string, configured: boolean, job: string, idle: string) => {
    if (!configured) return { name, dot: "off", meta: "por configurar" };
    const last = jobs.last.get(job);
    const ok = jobs.lastOk.get(job);
    return { name, dot: last?.ok === false ? "warn" : "", meta: ok ? ago(ok.startedAt) : idle };
  };
  const rows = [
    row("OfficeGest", !!og, JOBS.sync.name, "por sincronizar"),
    mode === "desligado" && ixcConfig() ? { name: "IXC Zon", dot: "off", meta: "ciclo desligado" } : row("IXC Zon", !!ixcConfig(), JOBS.ixcSync.name, "por sincronizar"),
    row("AppyPay", !!appypayConfig(), JOBS.confirm.name, mode === "ativo" ? "à espera" : "sem referências"),
    { name: "TvBox API", dot: "off", meta: "por ligar" },
  ];

  return (
    <>
      <div className="app">
        <aside className="sidebar" aria-label="Navegação principal">
          <Link className="brand" href="/dashboard" aria-label="Zon Backoffice, início"><ZonLogo /><span className="brand-tag">Backoffice</span></Link>
          <SidebarNav counts={{ clientes: int(counts.all) }} />
          <div className="sidebar-foot">
            <div className="sys-status">
              <div className="sys-status-head">
                <span>Sistemas</span>
                {warnings
                  ? <span className="pill warning" style={{ height: 20, fontSize: 11 }}><TriangleAlert className="ico" aria-hidden />{warnings} aviso{warnings === 1 ? "" : "s"}</span>
                  : <span className="pill good" style={{ height: 20, fontSize: 11 }}><CircleCheck className="ico" aria-hidden />OK</span>}
              </div>
              {rows.map((r) => <div className="sys-row" key={r.name}><span className={`dot ${r.dot}`} /><span>{r.name}</span><span>{r.meta}</span></div>)}
            </div>
            <div className="me">
              <span className="avatar gold">{initials(user.name)}</span>
              <div className="me-meta"><strong>{user.name}</strong><small>{ROLE_LABEL[user.role]}</small></div>
              <form action={logout} className="inline">
                <button type="submit" className="icon-btn sm" title="Terminar sessão" aria-label="Terminar sessão"><LogOut className="ico sm" aria-hidden /></button>
              </form>
            </div>
          </div>
        </aside>
        <div className="main">
          <Topbar me={{ name: user.name }} />
          <main className="content" id="view" tabIndex={-1}>{children}</main>
        </div>
      </div>
      <MobileNav />
      <Toaster />
    </>
  );
}
