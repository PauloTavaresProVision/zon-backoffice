import { Eye, Shield, ShieldCheck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { canEdit, requireUser } from "@/lib/auth/session";
import { ago, initials, int } from "@/lib/format";
import { listUsers } from "@/lib/queries";
import { ActionButton } from "@/components/action-button";
import { revokeUserSessions } from "./actions";
import { CreateUserForm, ResetPasswordButton, RoleSelect, UserSwitch } from "./user-controls";

export const metadata: Metadata = { title: "Utilizadores" };

const ROLES = [
  { id: "admin", name: "Administrador", Icon: ShieldCheck, desc: "Tudo, incluindo utilizadores e tarefas automáticas" },
  { id: "operador", name: "Operador", Icon: Wrench, desc: "Ativar e desativar clientes, faturas e links" },
  { id: "consulta", name: "Consulta", Icon: Eye, desc: "Vê clientes, pagamentos e faturas, sem alterar" },
] as const;
const ROLE_NAME = { admin: "Administrador", operador: "Operador", consulta: "Consulta" } as const;

export default async function UtilizadoresPage() {
  const me = await requireUser();
  const admin = canEdit(me, "admin");
  const users = await listUsers();
  const sessions = users.reduce((a, u) => a + u.sessions, 0);
  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Sistema</p><h1>Utilizadores</h1><p className="sub">{users.length} utilizadores · {int(sessions)} sessões ativas</p></div>
      </div>

      <div className="row-2-even" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {ROLES.map((r) => (
          <article className="card card-pad" key={r.id}>
            <div className="kpi-top"><strong>{r.name}</strong><span className="kpi-icon"><r.Icon className="ico sm" aria-hidden /></span></div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{r.desc}</p>
            <p style={{ marginTop: 12, fontSize: 12.5 }}><b>{users.filter((u) => u.user.role === r.id).length}</b> <span className="muted">utilizador(es)</span></p>
          </article>
        ))}
      </div>

      {admin ? (
        <article className="card mt">
          <div className="card-head"><div><h2>Novo utilizador</h2><p className="sub">A palavra-passe é gerada e mostrada uma única vez</p></div></div>
          <CreateUserForm />
        </article>
      ) : null}

      <article className="card mt">
        <div className="table-wrap">
          <table className="data responsive">
            <thead><tr><th>Utilizador</th><th>Perfil</th><th>Último acesso</th><th>Sessões</th><th>Ativo</th>{admin ? <th className="w-act" /> : null}</tr></thead>
            <tbody>
              {users.map(({ user: u, sessions: n }) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td className="o1">
                      <div className="cell-main">
                        <span className={`avatar${self ? " gold" : ""}`}>{initials(u.name)}</span>
                        <div><strong>{u.name}{self ? <span className="muted" style={{ fontWeight: 400 }}> · eu</span> : null}</strong><small>{u.email}</small></div>
                      </div>
                    </td>
                    <td className="o3">{admin && !self ? <RoleSelect userId={u.id} role={u.role} disabled={false} /> : <span className="tag"><Shield className="ico xs" aria-hidden />{ROLE_NAME[u.role]}</span>}</td>
                    <td className="o4 right muted">{ago(u.lastLoginAt)}</td>
                    <td className="hide-sm">
                      {n ? <>{n}{admin && !self ? <> <ActionButton action={revokeUserSessions.bind(null, u.id)} className="link link-btn" confirm={`Terminar as sessões de ${u.name}?`}>terminar</ActionButton></> : null}</> : <span className="muted">—</span>}
                    </td>
                    <td className="o2 right"><UserSwitch userId={u.id} name={u.name} active={u.active} disabled={!admin || self} /></td>
                    {admin ? <td className="w-act hide-sm">{!self ? <ResetPasswordButton userId={u.id} name={u.name} /> : null}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
