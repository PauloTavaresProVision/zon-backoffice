import type { LucideIcon } from "lucide-react";

export function ComingSoon({ eyebrow, title, Icon, lead, items }: { eyebrow: string; title: string; Icon: LucideIcon; lead: string; items: string[] }) {
  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="sub">Próxima fase</p></div>
      </div>
      <article className="card">
        <div className="soon-hero">
          <span className="kpi-icon" style={{ width: 44, height: 44, borderRadius: 12 }}><Icon className="ico" aria-hidden /></span>
          <h2>{title} chega na próxima fase</h2>
          <p>{lead}</p>
          <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      </article>
    </>
  );
}
