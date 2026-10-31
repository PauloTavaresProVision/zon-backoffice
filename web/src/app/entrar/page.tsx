import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { ZonLogo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await currentUser()) redirect("/dashboard");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <div className="login">
      <section className="login-art">
        <ZonLogo />
        <div>
          <h2>Clientes, pagamentos e faturas. Num só sítio.</h2>
          <p>O backoffice da ZON junta o IXC, a AppyPay, o OfficeGest, a WeSender e a gestão das TvBox numa única aplicação, no computador e no telemóvel.</p>
          <div className="login-pills"><span>Multicaixa</span><span>Faturas</span><span>SMS</span><span>TvBox</span><span>Grelhas</span><span>IXC</span></div>
        </div>
        <small style={{ color: "#80898F" }}>© {new Date().getFullYear()} ZON · Luanda</small>
      </section>
      <section className="login-form">
        <LoginForm next={next} />
      </section>
    </div>
  );
}
