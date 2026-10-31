import { challenge } from "@/lib/boxes/device";
import { deviceRoute } from "@/lib/boxes/route";

// Desafio de uma só utilização, assinado pela box na sincronização
export const POST = (req: Request) => deviceRoute(req, challenge);
