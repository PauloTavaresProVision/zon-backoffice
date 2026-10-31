import { Baby, Clapperboard, Flag, Globe, Music, Newspaper, Radio, Trophy, Tv, type LucideIcon } from "lucide-react";
import type { Logo } from "@/lib/channels/logos";

const CAT_ICON: Record<string, LucideIcon> = {
  Angola: Flag, Desporto: Trophy, "Filmes e séries": Clapperboard, Notícias: Newspaper, Infantil: Baby,
  Música: Music, Rádio: Radio, Documentários: Globe, Outros: Tv,
};

export function CategoryTag({ category }: { category: string }) {
  const Icon = CAT_ICON[category] ?? Tv;
  return <span className="tag"><Icon className="ico xs" aria-hidden />{category}</span>;
}

/** Logótipo como aparece na box; sem logótipo, as iniciais. */
export function LogoTile({ name, logo, size = "sm" }: { name: string; logo: Logo; size?: "sm" | "" }) {
  if (logo) {
    return (
      <span className={`logo-tile${logo.light ? " light" : ""} ${size}`} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ficheiros pequenos e já otimizados para a box */}
        <img src={logo.src} alt="" loading="lazy" />
      </span>
    );
  }
  const ini = name.replace(/\b(HD|SD|FHD|TV)\b/gi, "").trim().split(/\s+/).slice(0, 2).map((w) => w.slice(0, 3)).join(" ") || name.slice(0, 3);
  return <span className={`logo-tile ${size}`} title={name}><span className="ini">{ini.toUpperCase()}</span></span>;
}
