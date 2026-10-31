import { Tv } from "lucide-react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Boxes" };

export default async function BoxesPage() {
  await requireUser();
  return (
    <ComingSoon
      eyebrow="Clientes"
      title="Boxes"
      Icon={Tv}
      lead="O ecrã já está desenhado no mockup. Falta ligar ao serviço que fala com as boxes, com chaves próprias do Zon Backoffice."
      items={[
        "Aprovar as chaves de instalação pedidas pelos técnicos",
        "Ver as boxes online, offline e bloqueadas, e a versão da app",
        "Bloquear e desbloquear a box quando o cliente é desativado ou paga",
        "Associar e trocar a box de um cliente",
      ]}
    />
  );
}
