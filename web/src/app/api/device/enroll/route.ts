import { enroll } from "@/lib/boxes/device";
import { deviceRoute } from "@/lib/boxes/route";

// Pedido de ativação da app ZON TV (serial + chave pública da box)
export const POST = (req: Request) => deviceRoute(req, enroll);
