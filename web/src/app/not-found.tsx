import Link from "next/link";
import { ZonLogo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="login-form nf">
      <div style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
        <ZonLogo className="nf-logo" />
        <h1 style={{ fontSize: 22 }}>Página não encontrada</h1>
        <p className="muted">O endereço não existe ou o registo foi removido.</p>
        <Link className="btn primary" href="/dashboard">Voltar ao início</Link>
      </div>
    </div>
  );
}
