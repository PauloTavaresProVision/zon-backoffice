"use client";

import { CircleAlert, KeyRound, UserPlus, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ActionButton } from "@/components/action-button";
import { CopyButton } from "@/components/controls";
import { toast } from "@/components/toast";
import { createUser, resetUserPassword, setUserActive, setUserRole, type CreateUserState } from "./actions";

function Secret({ title, who, password, onClose }: { title: string; who: string; password: string; onClose?: () => void }) {
  return (
    <div className="notice info" role="status" style={{ marginBottom: 0 }}>
      <span className="notice-ico"><KeyRound className="ico" aria-hidden /></span>
      <div className="grow">
        <strong>{title}</strong>
        <span>Palavra-passe de {who}. Só é mostrada agora: entregue-a em mão e peça para a mudar.</span>
        <div className="secret mt">{password}</div>
      </div>
      <div className="btn-row">
        <CopyButton text={password} done="Palavra-passe copiada" />
        {onClose ? <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Fechar"><X className="ico sm" aria-hidden /></button> : null}
      </div>
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createUser, {});
  const [hide, setHide] = useState(false);
  useEffect(() => setHide(false), [state]);
  return (
    <form action={action} className="card-body">
      <div className="users-new">
        <div className="field"><label htmlFor="u-name">Nome</label><input className="input" id="u-name" name="name" required minLength={2} maxLength={80} placeholder="Nome e apelido" /></div>
        <div className="field"><label htmlFor="u-email">Email</label><input className="input" id="u-email" name="email" type="email" required placeholder="nome@zon.ao" /></div>
        <div className="field">
          <label htmlFor="u-role">Perfil</label>
          <select className="select" id="u-role" name="role" defaultValue="operador">
            <option value="operador">Operador</option>
            <option value="consulta">Consulta</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button className={`btn primary${pending ? " busy" : ""}`} type="submit" disabled={pending} style={{ height: 40 }}><UserPlus className="ico sm" aria-hidden />Criar</button>
      </div>
      {state.error ? <div className="form-error mt" role="alert"><CircleAlert className="ico sm" aria-hidden />{state.error}</div> : null}
      {state.password && !hide ? <div className="mt"><Secret title={`${state.name} criado`} who={state.email ?? ""} password={state.password} onClose={() => setHide(true)} /></div> : null}
    </form>
  );
}

export function UserSwitch({ userId, name, active, disabled }: { userId: number; name: string; active: boolean; disabled: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();
  useEffect(() => setOn(active), [active]);
  return (
    <span className="switch">
      <input type="checkbox" checked={on} disabled={disabled || pending} aria-label={`${name} ativo`} onChange={(e) => {
        const next = e.target.checked;
        if (!next && !window.confirm(`Desativar ${name}? As sessões abertas terminam.`)) return;
        setOn(next);
        start(async () => {
          const r = await setUserActive(userId, next);
          toast(r.message, r.ok ? "ok" : "error");
          if (!r.ok) setOn(!next);
        });
      }} />
      <span />
    </span>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: number; role: string; disabled: boolean }) {
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();
  useEffect(() => setValue(role), [role]);
  return (
    <select className="select" style={{ height: 32, fontSize: 12.5 }} value={value} disabled={disabled || pending} aria-label="Perfil" onChange={(e) => {
      const next = e.target.value;
      const before = value;
      setValue(next);
      start(async () => {
        const r = await setUserRole(userId, next);
        toast(r.message, r.ok ? "ok" : "error");
        if (!r.ok) setValue(before);
      });
    }}>
      <option value="admin">Administrador</option>
      <option value="operador">Operador</option>
      <option value="consulta">Consulta</option>
    </select>
  );
}

export function ResetPasswordButton({ userId, name }: { userId: number; name: string }) {
  const [password, setPassword] = useState<string | null>(null);
  return (
    <>
      <ActionButton
        action={resetUserPassword.bind(null, userId)}
        className="icon-btn sm"
        title="Repor palavra-passe"
        ariaLabel={`Repor palavra-passe de ${name}`}
        confirm={`Gerar uma nova palavra-passe para ${name}? A atual deixa de funcionar.`}
        onDone={(r) => { if (r.ok && r.value) setPassword(r.value); else toast(r.message, "error"); }}
      >
        <KeyRound className="ico sm" aria-hidden />
      </ActionButton>
      {password ? createPortal(
        <>
          <div className="modal-backdrop" onClick={() => setPassword(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Nova palavra-passe de ${name}`} style={{ width: "min(560px, calc(100vw - 32px))" }}>
            <div className="modal-body" style={{ borderRadius: 18 }}>
              <Secret title="Palavra-passe reposta" who={name} password={password} onClose={() => setPassword(null)} />
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}
