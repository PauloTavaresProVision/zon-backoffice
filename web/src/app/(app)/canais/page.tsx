import { ListVideo } from "lucide-react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Canais & grelhas" };

export default async function CanaisPage() {
  await requireUser();
  return (
    <ComingSoon
      eyebrow="Serviço"
      title="Canais & grelhas"
      Icon={ListVideo}
      lead="O editor de grelhas e o catálogo de canais estão desenhados no mockup. Ficam ativos quando a API das TvBox estiver ligada."
      items={[
        "Catálogo de canais com logótipos e categorias",
        "Grelhas por plano, com rascunho e publicação por versões",
        "Packs extra por cliente",
        "Reenviar a grelha a uma box",
      ]}
    />
  );
}
