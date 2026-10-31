"use client";

import { Copy, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setClientActive } from "@/app/(app)/clientes/actions";
import { toast } from "./toast";

type Params = Record<string, string>;

function useUrlParam(params: Params, param: string) {
  const router = useRouter();
  const pathname = usePathname();
  return (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete("pagina");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

/** Caixa de pesquisa que escreve no URL, para os filtros poderem ser partilhados e voltar atrás. */
export function UrlSearch({ params, param = "q", placeholder, label, narrow = false }: {
  params: Params; param?: string; placeholder: string; label: string; narrow?: boolean;
}) {
  const current = params[param] ?? "";
  const [v, setV] = useState(current);
  const [seen, setSeen] = useState(current);
  const apply = useUrlParam(params, param);
  // O URL mudou por outro lado (ex.: voltar atrás): a caixa acompanha
  if (current !== seen) {
    setSeen(current);
    setV(current);
  }
  useEffect(() => {
    if (v.trim() === current) return;
    const t = setTimeout(() => apply(v.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, current]);
  return (
    <div className={`input-icon${narrow ? " narrow" : ""}`}>
      <Search className="ico sm" aria-hidden />
      <input className="input" type="search" placeholder={placeholder} aria-label={label} value={v} onChange={(e) => setV(e.target.value)} />
    </div>
  );
}

export function UrlSelect({ params, param, label, options, className = "select" }: {
  params: Params; param: string; label: string; options: { value: string; label: string }[]; className?: string;
}) {
  const apply = useUrlParam(params, param);
  return (
    <select className={className} aria-label={label} value={params[param] ?? ""} onChange={(e) => apply(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function CopyButton({ text, label = "Copiar", done = "Copiado" }: { text: string; label?: string; done?: string }) {
  return (
    <button type="button" className="btn sm" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast(done);
      } catch {
        window.prompt("Copie:", text);
      }
    }}>
      <Copy className="ico sm" aria-hidden />{label}
    </button>
  );
}

export function ActiveToggle({ customerId, name, active, disabled }: { customerId: number; name: string; active: boolean; disabled: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();
  useEffect(() => setOn(active), [active]);
  return (
    <label className="btn keep-sm" style={{ gap: 10, cursor: disabled ? "default" : "pointer" }} title={disabled ? "O seu perfil só permite consultar" : undefined}>
      Ativo
      <span className="switch">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled || pending}
          aria-label="Cliente ativo"
          onChange={(e) => {
            const next = e.target.checked;
            if (!next && !window.confirm(`Desativar ${name}?`)) return;
            setOn(next);
            start(async () => {
              const r = await setClientActive(customerId, next);
              toast(r.message, r.ok ? "ok" : "error");
              if (!r.ok) setOn(!next);
            });
          }}
        />
        <span />
      </span>
    </label>
  );
}
