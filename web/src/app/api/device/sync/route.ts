import { sync } from "@/lib/boxes/device";
import { deviceRoute } from "@/lib/boxes/route";

// Sincronização assinada: estado da box, grelha e conta do cliente
export const POST = (req: Request) => deviceRoute(req, sync);
