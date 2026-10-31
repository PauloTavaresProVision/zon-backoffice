"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import { useActionState } from "react";
import { login, type LoginState } from "@/lib/auth/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action}>
      <div><p className="eyebrow">Zon Backoffice</p><h1>Entrar</h1></div>
      {state.error ? <div className="form-error" role="alert"><CircleAlert className="ico sm" aria-hidden />{state.error}</div> : null}
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" placeholder="nome@zon.ao" defaultValue={state.email} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="pw">Palavra-passe</label>
        <input className="input" id="pw" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" className="checkbox" name="remember" />Manter sessão neste dispositivo
      </label>
      <button className={`btn primary block${pending ? " busy" : ""}`} type="submit" style={{ height: 44 }} disabled={pending}>
        Entrar <ArrowRight className="ico sm" aria-hidden />
      </button>
      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>Esqueceu-se da palavra-passe? Peça a um administrador para a repor.</p>
    </form>
  );
}
