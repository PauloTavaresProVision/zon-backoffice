"use client";

import { Table2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { compactKz, kz, pct } from "@/lib/format";

export type ChartData = {
  aria: string;
  labels: string[];
  titles: string[];
  values: number[];
  ghost?: number[];
  valueLabel: string;
  ghostLabel?: string;
  height?: number;
  fill?: number;
  labelEvery?: number;
  markMax?: boolean;
  showRate?: boolean;
};

function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function bar(x: number, y: number, w: number, h: number, fill: string, key: string) {
  if (h <= 0.5) return null;
  const r = Math.min(4, w / 2, h);
  return <path key={key} d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`} style={{ fill }} />;
}

const SWATCH_GHOST = { background: "var(--series-ghost)", boxShadow: "inset 0 0 0 1px var(--line-strong)" };

/** Colunas com o mesmo desenho do mockup: barra recebida sobre a emitida, tooltip e tabela alternativa. */
export function ColumnChart(d: ChartData) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setW(Math.max(280, Math.round(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = d.height ?? 240;
  const pad = { l: 46, r: 6, t: 16, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = d.labels.length;
  const band = iw / Math.max(1, n);
  const bw = Math.min(24, band * (d.fill ?? 0.56));
  const ticks = niceTicks(Math.max(...d.values, ...(d.ghost ?? [0])));
  const max = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const mark = d.markMax && Math.max(...d.values) > 0 ? d.values.indexOf(Math.max(...d.values)) : -1;

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
      <svg width={w} height={H} role="img" aria-label={d.aria}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base-line" : "grid-line"} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t === 0 ? "0" : compactKz(t)}</text>
          </g>
        ))}
        {d.labels.map((lab, i) => {
          const cx = pad.l + band * i + band / 2;
          const x = cx - bw / 2;
          const g = d.ghost?.[i] ?? 0;
          const v = d.values[i] ?? 0;
          return (
            <g key={i}>
              {d.ghost ? bar(x, y(g), bw, y(0) - y(g), "var(--series-ghost)", "g") : null}
              {bar(x, y(v), bw, y(0) - y(v), "var(--series-1)", "v")}
              {!d.labelEvery || i % d.labelEvery === 0 || i === n - 1 ? <text x={cx} y={H - pad.b + 18} textAnchor="middle">{lab}</text> : null}
            </g>
          );
        })}
        {mark >= 0 ? (() => {
          const cx = pad.l + band * mark + band / 2;
          const edge = mark < n * 0.15 ? "start" : mark > n * 0.85 ? "end" : "middle";
          const tx = edge === "start" ? cx - bw / 2 : edge === "end" ? cx + bw / 2 : cx;
          return <text className="val" x={tx} y={y(d.values[mark] ?? 0) - 7} textAnchor={edge}>{compactKz(d.values[mark] ?? 0)}</text>;
        })() : null}
        {d.labels.map((_, i) => (
          <rect key={`h${i}`} className="hit" x={pad.l + band * i} y={pad.t} width={band} height={ih} rx={6}
            onPointerMove={(e) => setTip({ i, x: e.clientX, y: e.clientY })} onPointerDown={(e) => setTip({ i, x: e.clientX, y: e.clientY })} />
        ))}
      </svg>
      {tip ? (
        <div className="tooltip show" role="status" style={{
          left: Math.max(8, tip.x + 14 + 220 > window.innerWidth ? tip.x - 220 : tip.x + 14),
          top: Math.max(8, tip.y + 14 + 110 > window.innerHeight ? tip.y - 110 : tip.y + 14),
        }}>
          <div className="tt-title">{d.titles[tip.i]}</div>
          <div className="tt-row"><span><i className="swatch" style={{ background: "var(--series-1)" }} />{d.valueLabel}</span><b>{kz(d.values[tip.i] ?? 0)}</b></div>
          {d.ghost ? <div className="tt-row"><span><i className="swatch" style={SWATCH_GHOST} />{d.ghostLabel}</span><b>{kz(d.ghost[tip.i] ?? 0)}</b></div> : null}
          {d.showRate && d.ghost ? <div className="tt-row"><span>Taxa de cobrança</span><b>{pct(((d.values[tip.i] ?? 0) / (d.ghost[tip.i] || 1)) * 100)}</b></div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Cartão com gráfico, legenda e a mesma informação em tabela. */
export function ChartCard({ title, sub, foot, chart, table }: {
  title: string; sub: string; foot: string; chart: ChartData; table: { head: string[]; rows: string[][] };
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <article className="card">
      <div className="card-head">
        <div><h2>{title}</h2><p className="sub">{sub}</p></div>
        {chart.ghost ? (
          <div className="legend">
            <span><i className="swatch" style={{ background: "var(--series-1)" }} />{chart.valueLabel}</span>
            <span><i className="swatch" style={SWATCH_GHOST} />{chart.ghostLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="card-body">
        <ColumnChart {...chart} />
        {showTable ? (
          <div className="chart-table">
            <div className="table-wrap">
              <table className="data">
                <thead><tr>{table.head.map((h, i) => <th key={h} className={i ? "num" : undefined}>{h}</th>)}</tr></thead>
                <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "num" : undefined}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
      <div className="card-foot">
        <span>{foot}</span>
        <button type="button" className="link" onClick={() => setShowTable((v) => !v)}>
          <Table2 className="ico xs" aria-hidden /><span>{showTable ? "Esconder tabela" : "Ver tabela"}</span>
        </button>
      </div>
    </article>
  );
}
