"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { approveEnrollment, rejectEnrollment } from "@/app/(app)/boxes/actions";
import { toast } from "./toast";

type Client = { id: number; name: string; ixcId: number };

/** Procura o cliente pela pesquisa global do backoffice (nome, telefone, NIF ou n.º IXC). */
function ClientPicker({ value, onChange }: { value: Client | null; onChange: (c: Client | null) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Client[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setFound([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/pesquisa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: term }), signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { clients: [] }))
        .then((r: { clients?: Client[] }) => setFound(r.clients ?? []))
        .catch(() => undefined);
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  if (value) {
    return (
      <span className="picked">
        <span className="picked-name">{value.name}<small>IXC {value.ixcId}</small></span>
        <button type="button" className="icon-btn xs" onClick={() => onChange(null)} aria-label="Escolher outro cliente"><X className="ico xs" aria-hidden /></button>
      </span>
    );
  }
  return (
    <div className="picker">
      <div className="input-icon">
        <Search className="ico sm" aria-hidden />
        <input className="input" type="search" placeholder="Cliente: nome, telefone ou n.º IXC" aria-label="Cliente da box" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {found.length ? (
        <div className="picker-list" role="listbox">
          {found.map((c) => (
            <button type="button" role="option" aria-selected={false} key={c.id} onClick={() => { onChange(c); setQ(""); setFound([]); }}>
              {c.name}<small>IXC {c.ixcId}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Aprovar um pedido de ativação: cliente (se não vier da ficha) e o código da instalação que a TV mostra.
 */
export function ApproveBox({ enrollmentId, serial, customer, canReject = true }: {
  enrollmentId: number; serial: string; customer?: Client; canReject?: boolean;
}) {
  const [client, setClient] = useState<Client | null>(customer ?? null);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const clean = code.replace(/[\s-]/g, "");
  const ready = !!client && clean.length >= 12;

  const approve = () => start(async () => {
    const r = await approveEnrollment(enrollmentId, client!.id, clean);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) setCode("");
  });
  const reject = () => {
    if (!window.confirm(`Rejeitar o pedido de ativação da box ${serial}?`)) return;
    start(async () => {
      const r = await rejectEnrollment(enrollmentId);
      toast(r.message, r.ok ? "ok" : "error");
    });
  };

  return (
    <div className="approve-form">
      {customer ? null : <ClientPicker value={client} onChange={setClient} />}
      <input
        className="input mono code-input" placeholder="Código na TV" aria-label={`Código da instalação da box ${serial}`}
        maxLength={20} autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === "Enter" && ready && !pending) approve(); }}
      />
      <div className="btn-row">
        {canReject ? (
          <button type="button" className="btn sm ghost" disabled={pending} onClick={reject} aria-label={`Rejeitar ${serial}`}>
            <X className="ico sm" aria-hidden /><span className="desktop-only">Rejeitar</span>
          </button>
        ) : null}
        <button type="button" className={`btn sm primary${pending ? " busy" : ""}`} disabled={!ready || pending} onClick={approve}
          title={!client ? "Escolha o cliente" : clean.length < 12 ? "Escreva o código que aparece no ecrã da box" : undefined}>
          <Check className="ico sm" aria-hidden />Aprovar
        </button>
      </div>
    </div>
  );
}
