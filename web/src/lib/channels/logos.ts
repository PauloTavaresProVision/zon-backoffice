import LOGOS from "./logos.json";
import { normName } from "./rules";

// Os mesmos logótipos que a app da box traz, escolhidos pelo nome do canal como lá (MainActivity.logos).
const MAP = LOGOS as Record<string, (string | number)[]>;

export type Logo = { src: string; light: boolean } | null;

export function logoFor(name: string): Logo {
  const e = MAP[normName(name)];
  return e ? { src: `/logos/${e[0]}`, light: e[1] === 1 } : null;
}
