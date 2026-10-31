/* Dados fictícios para o mockup — nenhum destes registos é real. */
window.ZON_DATA = (function () {
  const TODAY = "2026-10-31";

  const plans = [
    { id: "f20", name: "ZON Fibra 20", type: "Internet", speed: 20, price: 7500, packs: [], clients: 1104, grid: null },
    { id: "f50e", name: "ZON Fibra 50 + TV Essencial", type: "Internet + TV", speed: 50, price: 9900, packs: ["Angola", "Notícias", "Entretenimento", "Música", "Rádio"], clients: 1538, grid: "ess" },
    { id: "f50t", name: "ZON Fibra 50 + TV Total", type: "Internet + TV", speed: 50, price: 12500, packs: ["Angola", "Notícias", "Entretenimento", "Filmes e séries", "Desporto", "Infantil"], clients: 1236, grid: "tot", featured: true },
    { id: "f100p", name: "ZON Fibra 100 + TV Premium", type: "Internet + TV", speed: 100, price: 19900, packs: ["Angola", "Notícias", "Entretenimento", "Filmes e séries", "Desporto", "Infantil", "Documentários", "Música", "Rádio"], clients: 512, grid: "pre" },
    { id: "tvt", name: "ZON TV Total", type: "TV", speed: 0, price: 5500, packs: ["Angola", "Notícias", "Entretenimento", "Filmes e séries", "Desporto", "Infantil"], clients: 422, grid: "tot" },
  ];

  const grids = [
    { id: "ess", name: "TV Essencial", published: 8, draft: null, boxes: 1712, updated: "2026-10-12" },
    { id: "tot", name: "TV Total", published: 12, draft: 13, boxes: 2081, updated: "2026-10-28", changes: 4 },
    { id: "pre", name: "TV Premium", published: 5, draft: null, boxes: 617, updated: "2026-09-30" },
  ];

  const clients = [
    { id: 10432, name: "Ana Paula Domingos", phone: "923 418 552", email: "ana.domingos@correio.ao", zone: "Talatona", plan: "f50t", status: "active", due: "2026-11-03", lastPay: "2026-10-02", boxes: ["ZTV-8F3A-21C9"], bi: "004512873LA041", since: "2024-03-12" },
    { id: 10418, name: "Mário Kiala", phone: "912 774 019", email: "mkiala@correio.ao", zone: "Kilamba", plan: "f100p", status: "active", due: "2026-11-02", lastPay: "2026-10-01", boxes: ["ZTV-41B7-09DE", "ZTV-41B7-0A11"], bi: "003318902LA036", since: "2023-11-04" },
    { id: 10377, name: "Esperança Neto", phone: "934 220 871", email: "esperanca.neto@correio.ao", zone: "Maianga", plan: "f50e", status: "late", due: "2026-10-24", lastPay: "2026-09-23", boxes: ["ZTV-77C2-5B30"], bi: "006129774LA048", since: "2025-01-19" },
    { id: 10361, name: "Joaquim Mbala", phone: "926 501 338", email: "jmbala@correio.ao", zone: "Viana", plan: "f20", status: "active", due: "2026-11-15", lastPay: "2026-10-14", boxes: [], bi: "002277561LA039", since: "2022-08-30" },
    { id: 10355, name: "Teresa Lukeny", phone: "917 662 405", email: "teresa.lukeny@correio.ao", zone: "Ingombota", plan: "tvt", status: "inactive", due: "2026-09-30", lastPay: "2026-08-29", boxes: ["ZTV-19AE-77F2"], bi: "005501239LA044", since: "2024-06-02" },
    { id: 10349, name: "Adilson Cassoma", phone: "929 113 760", email: "adilson.c@correio.ao", zone: "Talatona", plan: "f50t", status: "active", due: "2026-11-05", lastPay: "2026-10-04", boxes: ["ZTV-2C90-44A8"], bi: "007734120LA051", since: "2025-04-11" },
    { id: 10333, name: "Helena Bumba", phone: "931 870 224", email: "helena.bumba@correio.ao", zone: "Camama", plan: "f50e", status: "late", due: "2026-10-27", lastPay: "2026-09-26", boxes: ["ZTV-5D11-8E02"], bi: "004890213LA040", since: "2024-12-07" },
    { id: 10321, name: "Nelson Tchipa", phone: "914 335 908", email: "ntchipa@correio.ao", zone: "Benfica", plan: "f100p", status: "active", due: "2026-11-21", lastPay: "2026-10-20", boxes: ["ZTV-90F4-1C6B"], bi: "001982337LA033", since: "2023-02-15" },
    { id: 10308, name: "Rosa Kalunga", phone: "925 640 117", email: "rosa.kalunga@correio.ao", zone: "Cazenga", plan: "f50e", status: "active", due: "2026-11-01", lastPay: "2026-09-30", boxes: ["ZTV-6A3B-D410"], bi: "006670418LA047", since: "2025-07-22" },
    { id: 10296, name: "Domingos Sebastião", phone: "918 207 663", email: "dsebastiao@correio.ao", zone: "Kilamba", plan: "f20", status: "inactive", due: "2026-08-31", lastPay: "2026-07-30", boxes: [], bi: "003045876LA037", since: "2022-03-09" },
    { id: 10284, name: "Luzia Cambuta", phone: "933 498 052", email: "luzia.cambuta@correio.ao", zone: "Morro Bento", plan: "f50t", status: "active", due: "2026-11-06", lastPay: "2026-10-05", boxes: ["ZTV-3E8D-6F17"], bi: "005218760LA043", since: "2024-09-18" },
    { id: 10271, name: "Edson Mavinga", phone: "927 715 390", email: "edson.mavinga@correio.ao", zone: "Viana", plan: "tvt", status: "active", due: "2026-11-12", lastPay: "2026-10-11", boxes: ["ZTV-B204-93C5"], bi: "007120985LA050", since: "2025-09-03" },
    { id: 10265, name: "Filomena Kapinga", phone: "916 052 744", email: "filomena.k@correio.ao", zone: "Talatona", plan: "f50e", status: "active", due: "2026-11-04", lastPay: "2026-10-03", boxes: ["ZTV-C71E-0B98"], bi: "002594431LA038", since: "2023-06-27" },
    { id: 10250, name: "Bruno Ngola", phone: "935 381 670", email: "bruno.ngola@correio.ao", zone: "Maianga", plan: "f100p", status: "late", due: "2026-10-29", lastPay: "2026-09-28", boxes: ["ZTV-D5A9-2E44"], bi: "004407652LA042", since: "2024-02-10" },
    { id: 10243, name: "Celestina Paím", phone: "921 994 263", email: "celestina.paim@correio.ao", zone: "Benfica", plan: "f50t", status: "active", due: "2026-11-18", lastPay: "2026-10-17", boxes: ["ZTV-E3C0-7A21"], bi: "006831095LA049", since: "2025-05-14" },
    { id: 10231, name: "Victor Quissanga", phone: "913 586 471", email: "vquissanga@correio.ao", zone: "Cazenga", plan: "f20", status: "active", due: "2026-11-02", lastPay: "2026-10-01", boxes: [], bi: "001556380LA032", since: "2022-10-21" },
  ];

  const boxes = [
    { serial: "ZTV-8F3A-21C9", client: 10432, grid: "tot", status: "online", app: "0.8.0", seen: "há 2 min", approved: "2026-03-12" },
    { serial: "ZTV-41B7-09DE", client: 10418, grid: "pre", status: "online", app: "0.8.0", seen: "há 1 min", approved: "2025-11-04" },
    { serial: "ZTV-41B7-0A11", client: 10418, grid: "pre", status: "offline", app: "0.8.0", seen: "há 3 dias", approved: "2025-11-04" },
    { serial: "ZTV-77C2-5B30", client: 10377, grid: "ess", status: "online", app: "0.7.2", seen: "há 6 min", approved: "2025-01-19" },
    { serial: "ZTV-19AE-77F2", client: 10355, grid: "tot", status: "blocked", app: "0.7.2", seen: "há 31 dias", approved: "2024-06-02" },
    { serial: "ZTV-2C90-44A8", client: 10349, grid: "tot", status: "online", app: "0.8.0", seen: "agora", approved: "2025-04-11" },
    { serial: "ZTV-5D11-8E02", client: 10333, grid: "ess", status: "online", app: "0.8.0", seen: "há 14 min", approved: "2024-12-07" },
    { serial: "ZTV-90F4-1C6B", client: 10321, grid: "pre", status: "online", app: "0.8.0", seen: "há 4 min", approved: "2023-02-15" },
    { serial: "ZTV-6A3B-D410", client: 10308, grid: "ess", status: "offline", app: "0.8.0", seen: "há 9 h", approved: "2025-07-22" },
    { serial: "ZTV-3E8D-6F17", client: 10284, grid: "tot", status: "online", app: "0.8.0", seen: "há 1 min", approved: "2024-09-18" },
    { serial: "ZTV-B204-93C5", client: 10271, grid: "tot", status: "online", app: "0.7.2", seen: "há 22 min", approved: "2025-09-03" },
    { serial: "ZTV-C71E-0B98", client: 10265, grid: "ess", status: "online", app: "0.8.0", seen: "há 3 min", approved: "2023-06-27" },
    { serial: "ZTV-D5A9-2E44", client: 10250, grid: "pre", status: "offline", app: "0.8.0", seen: "há 2 dias", approved: "2024-02-10" },
    { serial: "ZTV-E3C0-7A21", client: 10243, grid: "tot", status: "online", app: "0.8.0", seen: "há 5 min", approved: "2025-05-14" },
  ];

  const pendingBoxes = [
    { serial: "ZTV-F812-3D07", model: "Xiaomi TV Box S (2.ª ger.)", requested: "há 12 min", zone: "Talatona", suggest: 10349, tech: "Hélder Panzo" },
    { serial: "ZTV-F812-3D1C", model: "Xiaomi TV Box S (2.ª ger.)", requested: "há 41 min", zone: "Kilamba", suggest: 10418, tech: "Carlos Bento" },
    { serial: "ZTV-A0C5-6E92", model: "Xiaomi TV Box S (2.ª ger.)", requested: "há 2 h", zone: "Viana", suggest: null, tech: "Hélder Panzo" },
  ];

  const payments = [
    { ref: "932104558", client: 10432, amount: 12500, issued: "2026-10-29", sms: "ok", paid: null, status: "pending", due: "2026-11-05" },
    { ref: "932104311", client: 10418, amount: 19900, issued: "2026-10-28", sms: "ok", paid: "2026-10-30", status: "paid", due: "2026-11-04" },
    { ref: "932103987", client: 10308, amount: 9900, issued: "2026-10-28", sms: "ok", paid: null, status: "pending", due: "2026-11-03" },
    { ref: "932103512", client: 10250, amount: 19900, issued: "2026-10-22", sms: "fail", paid: null, status: "pending", due: "2026-10-29" },
    { ref: "932102876", client: 10333, amount: 9900, issued: "2026-10-20", sms: "ok", paid: null, status: "expired", due: "2026-10-27" },
    { ref: "932102540", client: 10377, amount: 9900, issued: "2026-10-17", sms: "ok", paid: null, status: "expired", due: "2026-10-24" },
    { ref: "932102233", client: 10321, amount: 19900, issued: "2026-10-14", sms: "ok", paid: "2026-10-20", status: "paid", due: "2026-10-21" },
    { ref: "932101968", client: 10243, amount: 12500, issued: "2026-10-11", sms: "ok", paid: "2026-10-17", status: "paid", due: "2026-10-18", invoice: "fail" },
    { ref: "932101640", client: 10271, amount: 5500, issued: "2026-10-05", sms: "ok", paid: "2026-10-11", status: "paid", due: "2026-10-12" },
    { ref: "932101302", client: 10361, amount: 7500, issued: "2026-10-08", sms: "ok", paid: "2026-10-14", status: "paid", due: "2026-10-15" },
    { ref: "932100977", client: 10284, amount: 12500, issued: "2026-09-30", sms: "ok", paid: "2026-10-05", status: "paid", due: "2026-10-07" },
    { ref: "932100655", client: 10349, amount: 12500, issued: "2026-09-29", sms: "ok", paid: "2026-10-04", status: "paid", due: "2026-10-06" },
    { ref: "932100318", client: 10265, amount: 9900, issued: "2026-09-28", sms: "fail", paid: "2026-10-03", status: "paid", due: "2026-10-05" },
    { ref: "932100046", client: 10231, amount: 7500, issued: "2026-09-26", sms: "ok", paid: "2026-10-01", status: "paid", due: "2026-10-03" },
  ];

  const clientPayments = [
    { month: "Outubro 2026", ref: "932104558", amount: 12500, issued: "2026-10-29", paid: null, status: "pending" },
    { month: "Setembro 2026", ref: "931987402", amount: 12500, issued: "2026-09-28", paid: "2026-10-02", status: "paid" },
    { month: "Agosto 2026", ref: "931862117", amount: 12500, issued: "2026-08-29", paid: "2026-09-01", status: "paid" },
    { month: "Julho 2026", ref: "931740338", amount: 12500, issued: "2026-07-30", paid: "2026-08-04", status: "paid" },
    { month: "Junho 2026", ref: "931611095", amount: 12500, issued: "2026-06-28", paid: null, status: "expired" },
    { month: "Junho 2026", ref: "931623870", amount: 12500, issued: "2026-07-06", paid: "2026-07-07", status: "paid" },
  ];

  const monthly = {
    labels: ["nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out"],
    years: ["2025", "2025", "2026", "2026", "2026", "2026", "2026", "2026", "2026", "2026", "2026", "2026"],
    issued: [41.8, 42.6, 43.5, 44.1, 45.0, 45.9, 46.8, 47.6, 48.5, 49.4, 50.2, 51.3],
    received: [31.2, 33.4, 31.9, 34.0, 35.1, 35.6, 36.9, 36.4, 37.9, 38.6, 37.8, 40.1],
  };

  // Recebido por dia em outubro (M Kz) — picos no início e no fim do mês.
  const dailyShape = [3.1, 2.6, 2.2, 1.9, 1.6, 1.4, 1.2, 1.1, 1.0, 1.0, 0.9, 0.9, 0.8, 0.8, 0.9, 0.9, 0.8, 0.8, 0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.3, 1.5, 1.7, 1.9, 2.0, 2.2, 2.4];
  const shapeSum = dailyShape.reduce((a, b) => a + b, 0);
  const daily = dailyShape.map((v) => +(v * 40.1 / shapeSum).toFixed(2));

  const refsMonth = { issued: 4790, paid: 3744, pending: 812, expired: 234, issuedKz: 51.3, paidKz: 40.1, pendingKz: 8.9, expiredKz: 2.3 };

  // Faturas-recibo emitidas no OfficeGest a seguir a cada pagamento confirmado
  const invoicesMonth = { issued: 3741, failed: 3 };

  const kpis = {
    active: 4812, inactive: 623, late: 287, expiring: 214, total: 5435,
    activeSpark: [4512, 4538, 4566, 4590, 4611, 4640, 4668, 4701, 4733, 4752, 4774, 4812],
    inactiveSpark: [702, 690, 684, 671, 668, 660, 651, 648, 640, 641, 635, 623],
    boxes: { total: 4410, online: 3902, offline: 381, blocked: 97, pending: 30 },
  };

  const activity = [
    { icon: "circle-check", tone: "good", html: "Pagamento de <b>19 900 Kz</b> recebido — Mário Kiala", time: "há 4 min · AppyPay" },
    { icon: "file-text", tone: "", html: "Fatura-recibo <b>FR 2026/5131</b> emitida — Mário Kiala", time: "há 3 min · OfficeGest" },
    { icon: "key-round", tone: "gold", html: "Chave da box <b>ZTV-F812-3D07</b> pedida por Hélder Panzo", time: "há 12 min · Talatona" },
    { icon: "message-square", tone: "", html: "<b>186 SMS</b> de lembrete enviados (D-3)", time: "há 1 h · WeSender" },
    { icon: "list-video", tone: "gold", html: "Grelha <b>TV Total</b> com 4 alterações em rascunho", time: "há 3 h · Paulo Tavares" },
    { icon: "power-off", tone: "crit", html: "Cliente <b>Teresa Lukeny</b> desativado por falta de pagamento", time: "ontem, 18:02 · automático" },
    { icon: "user-plus", tone: "good", html: "<b>12 clientes novos</b> integrados do IXC", time: "ontem, 15:00 · sincronização" },
  ];

  const integrations = [
    { name: "IXC Zon", desc: "Clientes e contratos", state: "ok", meta: "Sincronizado há 4 min" },
    { name: "AppyPay", desc: "Referências Multicaixa", state: "ok", meta: "Entidade 11700 · 98 ms" },
    { name: "WeSender", desc: "Envio de SMS", state: "warn", meta: "Saldo: 1 820 SMS" },
    { name: "TvBox API", desc: "Boxes e grelhas", state: "ok", meta: "3 902 boxes ligadas" },
    { name: "OfficeGest", desc: "Faturas e PDF", state: "ok", meta: "3 741 faturas este mês" },
    { name: "Agendamentos", desc: "Faturação automática", state: "ok", meta: "Próxima execução 00:01" },
  ];

  const users = [
    { name: "Paulo Tavares", email: "paulo.tavares@zon.ao", role: "Administrador", last: "agora", sessions: 2, active: true },
    { name: "Marta Cassule", email: "marta.cassule@zon.ao", role: "Cobrança", last: "há 18 min", sessions: 1, active: true },
    { name: "Hélder Panzo", email: "helder.panzo@zon.ao", role: "Técnico de campo", last: "há 12 min", sessions: 1, active: true },
    { name: "Carlos Bento", email: "carlos.bento@zon.ao", role: "Técnico de campo", last: "há 41 min", sessions: 1, active: true },
    { name: "Sandra Quintas", email: "sandra.quintas@zon.ao", role: "Apoio ao cliente", last: "ontem", sessions: 0, active: true },
    { name: "Auditoria", email: "auditoria@zon.ao", role: "Só leitura", last: "há 9 dias", sessions: 0, active: false },
  ];

  const jobs = [
    { name: "Gerar referências do ciclo", desc: "Cria a referência Multicaixa 7 dias antes da validade", every: "a cada 1 min", last: "há 32 s", ok: true },
    { name: "Lembretes por SMS", desc: "D-7, D-3 e D-1, entre as 08:00 e as 19:00", every: "a cada 3 h", last: "há 1 h", ok: true },
    { name: "Expirar referências vencidas", desc: "Marca como expiradas e notifica o cliente", every: "a cada 1 min", last: "há 32 s", ok: true },
    { name: "Desbloquear contratos pagos", desc: "Dá baixa no IXC e reativa a box", every: "a cada 1 min", last: "há 32 s", ok: true },
    { name: "Emitir faturas no OfficeGest", desc: "Fatura-recibo e PDF a seguir a cada pagamento confirmado", every: "a cada 1 min", last: "há 32 s", ok: true },
    { name: "Sincronizar faturas do OfficeGest", desc: "Traz para a conta do cliente todas as faturas, também as emitidas fora do backoffice", every: "a cada 1 h", last: "há 6 min", ok: true },
    { name: "Sincronizar clientes IXC", desc: "Importa clientes e contratos novos", every: "a cada 3 h", last: "há 4 min", ok: true },
  ];

  return { TODAY, plans, grids, clients, boxes, pendingBoxes, payments, clientPayments, monthly, daily, refsMonth, invoicesMonth, kpis, activity, integrations, users, jobs };
})();
