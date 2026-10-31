import { ListVideo, Star, Tv, Wifi } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { gridSnapshot, resolveGrid, versionLabel } from "@/lib/boxes/grid";
import { int, mkz } from "@/lib/format";
import { plansWithClients } from "@/lib/queries";

export const metadata: Metadata = { title: "Planos" };

const KIND = { internet: { label: "Internet", Icon: Wifi }, tv: { label: "TV", Icon: Tv }, internet_tv: { label: "Internet + TV", Icon: Wifi } } as const;

export default async function PlanosPage() {
  await requireUser();
  const [plans, snap] = await Promise.all([plansWithClients(), gridSnapshot()]);
  const clients = plans.reduce((a, p) => a + p.clients, 0);
  const revenue = plans.reduce((a, p) => a + p.clients * p.plan.priceKz, 0);
  const top = plans[0]?.clients ? plans[0].plan.id : null;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Serviço</p>
          <h1>Planos</h1>
          <p className="sub">{plans.filter((p) => p.plan.active).length} planos ativos · {int(clients)} clientes com serviço · {mkz(revenue)} / mês</p>
        </div>
      </div>
      <div className="plans">
        {plans.map(({ plan: p, clients: n }) => {
          const k = KIND[p.kind as keyof typeof KIND] ?? KIND.internet;
          const tv = p.kind === "tv" || p.kind === "internet_tv";
          // A grelha que as boxes deste plano recebem: a escolhida, se já publicada, ou a predefinida
          const grid = tv ? resolveGrid(snap, p.gridId) : null;
          const waiting = tv && p.gridId !== null && !snap.byGrid.has(p.gridId);
          return (
            <article className="card plan" key={p.id}>
              <div className="plan-top">
                <div className="plan-type">
                  <span className="tag"><k.Icon className="ico xs" aria-hidden />{k.label}</span>
                  {p.id === top ? <span className="pill gold"><Star className="ico" aria-hidden />Mais clientes</span> : null}
                  {!p.active ? <span className="pill plain">Inativo</span> : null}
                </div>
                <h3>{p.name}</h3>
                <div className="plan-price">{int(p.priceKz)}<small> Kz / mês</small></div>
                <div className="plan-metrics">
                  <div><small>Velocidade</small><strong>{p.speedMbps ? `${p.speedMbps} Mbps` : "—"}</strong></div>
                  <div><small>Canais</small><strong>{grid ? int(grid.channels.length) : "—"}</strong></div>
                  <div><small>Clientes</small><strong>{int(n)}</strong></div>
                </div>
                {grid ? (
                  <div className="plan-grid">
                    <ListVideo className="ico xs" aria-hidden />
                    <Link href={grid.gridId ? `/canais?grelha=${grid.gridId}` : "/canais"}>{versionLabel(snap, grid.version) ?? grid.name}</Link>
                    <span className="muted">{waiting ? "· a grelha escolhida ainda não foi publicada" : p.gridId ? "" : "· predefinida"}</span>
                  </div>
                ) : null}
              </div>
              <div className="plan-foot"><span>Receita: <b className="text-2">{mkz(n * p.priceKz)}</b> / mês</span><span className="mono">{p.code}</span></div>
            </article>
          );
        })}
      </div>
      <p className="muted mt" style={{ fontSize: 12.5 }}>Os planos e preços vêm do IXC: os que a sincronização encontra e ainda não existem são criados aqui. A grelha de canais de cada plano escolhe-se em <Link href="/canais">Canais & grelhas</Link>.</p>
    </>
  );
}
