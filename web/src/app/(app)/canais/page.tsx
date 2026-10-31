import { CircleCheck, CircleSlash, Library, ListOrdered, ListVideo } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { canEdit, requireUser } from "@/lib/auth/session";
import { gridSnapshot } from "@/lib/boxes/grid";
import { boxStats } from "@/lib/boxes/queries";
import { logoFor } from "@/lib/channels/logos";
import { boxesPerGrid, catalog, gridHistory, gridsByChannel, gridsInfo, tvPlans } from "@/lib/channels/queries";
import { CATEGORIES, normName } from "@/lib/channels/rules";
import { int } from "@/lib/format";
import { CategoryTag, LogoTile } from "@/components/channels";
import { UrlSearch, UrlSelect } from "@/components/controls";
import { Empty, flatParams, Pager, pageParam, withParams, type SearchParams } from "@/components/ui";
import { ChannelButton, ImportXmlButton } from "./channel-forms";
import { GridEditor } from "./grid-editor";
import { GridSettingsButton, NewGridButton } from "./grid-settings";

export const metadata: Metadata = { title: "Canais & grelhas" };

const PAGE = 20;
const STATES = [
  { value: "", label: "Todos os estados" },
  { value: "ativos", label: "Ativos" },
  { value: "sem-grelha", label: "Ativos sem grelha" },
  { value: "inativos", label: "Inativos" },
];

export default async function CanaisPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = flatParams(await searchParams);
  const tab = sp.tab === "catalogo" ? "catalogo" : "grelhas";
  const editor = canEdit(user);
  const admin = canEdit(user, "admin");
  const list = await catalog();
  const [grids, snap, stats] = await Promise.all([gridsInfo(list), gridSnapshot(), boxStats()]);
  const byChannel = gridsByChannel(grids);
  const active = list.filter((c) => c.active).length;
  const published = grids.filter((g) => g.published).length;
  const selected = grids.find((g) => String(g.id) === sp.grelha) ?? grids.find((g) => g.isDefault) ?? grids[0] ?? null;

  const tabs = [
    { id: "grelhas", label: "Grelhas", count: grids.length, Icon: ListOrdered, href: selected ? `/canais?grelha=${selected.id}` : "/canais" },
    { id: "catalogo", label: "Catálogo", count: list.length, Icon: Library, href: "/canais?tab=catalogo" },
  ];

  async function gridsTab() {
    if (!selected) {
      return (
        <article className="card">
          <Empty Icon={ListVideo}>Ainda não há grelhas.{editor ? " Crie a primeira com o botão Nova grelha." : ""}</Empty>
          {editor ? <div className="card-body"><NewGridButton grids={[]} from={null} /></div> : null}
        </article>
      );
    }
    const [history, plans, boxes] = await Promise.all([gridHistory(selected.id), tvPlans(), boxesPerGrid(snap)]);
    const names = new Map(grids.map((g) => [g.id, g.name]));
    return (
      <>
        <GridEditor
          key={`${selected.id}:${selected.rev}:${selected.published?.version ?? 0}`}
          grid={{
            id: selected.id, name: selected.name, isDefault: selected.isDefault, rev: selected.rev,
            published: selected.published
              ? { number: selected.published.number, version: selected.published.version, ids: selected.published.ids, channels: selected.published.channels }
              : null,
            initial: selected.draft ?? selected.published?.ids ?? [],
            boxes: boxes.get(selected.id) ?? { total: 0, current: 0 },
            plans: selected.plans.map((p) => p.name),
          }}
          grids={grids.map((g) => ({ id: g.id, name: g.name, pending: g.draft !== null || !g.published }))}
          channels={list.map((c) => ({ ...c, logo: logoFor(c.name) }))}
          canEdit={editor}
          canPublish={admin}
          newGrid={editor ? <NewGridButton grids={grids.map(({ id, name }) => ({ id, name }))} from={selected.id} /> : null}
          settings={
            <GridSettingsButton
              grid={{ id: selected.id, name: selected.name, isDefault: selected.isDefault, published: !!selected.published }}
              plans={plans.map((p) => ({ ...p, gridName: p.gridId ? names.get(p.gridId) ?? null : null }))}
              history={history.map((h) => ({ ...h, at: h.at.toISOString() }))}
              canEdit={editor}
              isAdmin={admin}
            />
          }
        />
        {editor && !admin ? <p className="muted mt" style={{ fontSize: 12.5 }}>As alterações ficam no rascunho. Publicar e escolher os planos de cada grelha é com um administrador.</p> : null}
      </>
    );
  }

  function catalogTab() {
    const q = normName(sp.q ?? "");
    const digits = /^\d+$/.test(q) ? Number(q) : null;
    // O número que se mostra é o da grelha predefinida
    const def = grids.find((g) => g.isDefault)?.published;
    const numberIn = new Map((def?.ids ?? []).map((id, i) => [id, i + 1]));
    const rows = list.filter((c) => {
      if (sp.cat && c.category !== sp.cat) return false;
      if (sp.estado === "ativos" && !c.active) return false;
      if (sp.estado === "inativos" && c.active) return false;
      if (sp.estado === "sem-grelha" && (!c.active || byChannel.has(c.id))) return false;
      if (!q) return true;
      return normName(`${c.name} ${c.ip}:${c.port}`).includes(q) || (digits !== null && numberIn.get(c.id) === digits);
    }).sort((a, b) => (numberIn.get(a.id) ?? 1e9) - (numberIn.get(b.id) ?? 1e9) || a.name.localeCompare(b.name, "pt"));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const page = Math.min(pageParam(sp.pagina), pages);
    const slice = rows.slice((page - 1) * PAGE, page * PAGE);
    const from = rows.length ? (page - 1) * PAGE + 1 : 0;
    return (
      <article className="card">
        <div className="toolbar">
          <UrlSearch params={sp} placeholder="Nome, número ou endereço" label="Procurar no catálogo" />
          <UrlSelect params={sp} param="cat" label="Categoria" options={[{ value: "", label: "Todas as categorias" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
          <UrlSelect params={sp} param="estado" label="Estado" options={STATES} />
        </div>
        <div className="table-wrap">
          <table className="data responsive">
            <thead>
              <tr>
                <th style={{ width: 64 }} title="Número na grelha predefinida">Nº</th><th>Canal</th><th>Categoria</th><th>Endereço multicast</th><th>Grelhas</th><th>Estado</th><th className="w-act" />
              </tr>
            </thead>
            <tbody>
              {slice.length ? slice.map((c) => {
                const n = numberIn.get(c.id);
                const num = n ? String(n).padStart(3, "0") : null;
                const inGrids = byChannel.get(c.id) ?? [];
                return (
                  <tr key={c.id}>
                    <td className="hide-sm"><span className="mono muted">{num ?? "—"}</span></td>
                    <td className="o1">
                      <div className="cell-main">
                        <LogoTile name={c.name} logo={logoFor(c.name)} />
                        <div><strong>{c.name}</strong><small className="mono">{num ? `${num} · ` : ""}{c.ip}:{c.port}</small></div>
                      </div>
                    </td>
                    <td className="o3"><CategoryTag category={c.category} /></td>
                    <td className="hide-sm"><span className="mono text-2">{c.ip}:{c.port}</span></td>
                    <td className="hide-sm">
                      {inGrids.length
                        ? <div className="chips" style={{ gap: 4 }}>{inGrids.map((g) => <Link key={g.id} className="tag" href={`/canais?grelha=${g.id}`}>{g.name}</Link>)}</div>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="o2 right">
                      {c.active
                        ? <span className="pill good"><CircleCheck className="ico" aria-hidden />Ativo</span>
                        : <span className="pill plain"><CircleSlash className="ico" aria-hidden />Inativo</span>}
                    </td>
                    <td className="w-act hide-sm">{editor ? <ChannelButton channel={c} grids={inGrids.map((g) => g.name)} /> : null}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7}><Empty Icon={ListVideo}>{list.length ? "Nenhum canal corresponde aos filtros." : "O catálogo está vazio. Importe o XML do headend ou crie um canal."}</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{rows.length ? `A mostrar ${int(from)}–${int(from + slice.length - 1)} de ${int(rows.length)} canais` : "Sem resultados"}</span>
          <Pager page={page} pages={pages} href={(p) => withParams("/canais", sp, { pagina: p })} />
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Serviço</p>
          <h1>Canais & grelhas</h1>
          <p className="sub">{int(active)} canais no catálogo · {published} grelha{published === 1 ? "" : "s"} publicada{published === 1 ? "" : "s"} · {int(stats.total)} boxes</p>
        </div>
        {editor ? (
          <div className="btn-row">
            <ImportXmlButton grids={grids.map(({ id, name }) => ({ id, name }))} gridId={selected?.id ?? null} />
            <ChannelButton />
          </div>
        ) : null}
      </div>
      <nav className="tabs" aria-label="Secções">
        {tabs.map((t) => (
          <Link key={t.id} href={t.href} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}>
            <t.Icon className="ico sm" aria-hidden />{t.label} <span className="count">{t.count}</span>
          </Link>
        ))}
      </nav>
      {tab === "grelhas" ? await gridsTab() : catalogTab()}
    </>
  );
}
