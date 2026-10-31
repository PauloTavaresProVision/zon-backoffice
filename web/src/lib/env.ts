import { z } from "zod";

// Lida só quando é precisa: o `next build` corre sem as variáveis de produção.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  APP_URL: z.string().url().default("http://127.0.0.1:4620"),
  APP_SECRET: z.string().min(32, "APP_SECRET tem de ter pelo menos 32 caracteres"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("true"),
  PDF_DIR: z.string().default("./data/faturas"),

  OFFICEGEST_URL: z.string().url().optional().or(z.literal("")),
  OFFICEGEST_USER: z.string().optional(),
  OFFICEGEST_KEY: z.string().optional(),
  OFFICEGEST_ARTICLE_ID: z.string().optional(),
  OFFICEGEST_VAT_ID: z.string().optional(),
  OFFICEGEST_CONSUMER_NIF: z.string().default("999999999"),
  OFFICEGEST_DOC_TYPES: z.string().default("fr,ft,nc"),
  OFFICEGEST_ISSUE_TYPE: z.string().default("fr"),
  OFFICEGEST_PRINT: z.enum(["A", "T", "O"]).default("A"),
  // Só os pagamentos feitos a partir deste dia recebem fatura do backoffice.
  // Vazio = emissão desligada (evita duplicar as faturas que o sistema antigo já emitiu).
  OFFICEGEST_ISSUE_FROM: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  OFFICEGEST_SYNC_MINUTES: z.coerce.number().int().min(5).default(60),

  // Ciclo de cobrança. "desligado": nada corre. "simulacao": lê o IXC e mostra o que faria,
  // sem criar referências, sem SMS e sem escrever no IXC. "ativo": faz tudo.
  CYCLE_MODE: z.enum(["desligado", "simulacao", "ativo"]).default("desligado"),
  // Na passagem do sistema antigo: só entram no ciclo os títulos que vencem a partir deste dia (AAAA-MM-DD).
  // Os anteriores já têm referência do sistema antigo e ficam com ele.
  CYCLE_FROM_DUE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),

  IXC_URL: z.string().url().optional().or(z.literal("")),
  IXC_TOKEN: z.string().optional(),
  IXC_SYNC_MINUTES: z.coerce.number().int().min(15).default(180),

  APPYPAY_URL: z.string().url().optional().or(z.literal("")),
  APPYPAY_TOKEN_URL: z.string().url().optional().or(z.literal("")),
  APPYPAY_CLIENT_ID: z.string().optional(),
  APPYPAY_CLIENT_SECRET: z.string().optional(),
  APPYPAY_RESOURCE: z.string().optional(),
  APPYPAY_PAYMENT_METHOD: z.string().optional(),
  APPYPAY_ENTITY: z.string().default("11700"),
  // Segredo nosso no URL do webhook (a AppyPay não assina as notificações)
  APPYPAY_WEBHOOK_SECRET: z.string().optional(),

  WESENDER_URL: z.string().url().optional().or(z.literal("")),
  WESENDER_KEY: z.string().optional(),
  // Com um número aqui, todos os SMS vão só para ele (testes)
  SMS_TEST_PHONE: z.string().optional(),
  // Linha "Dúvidas:" no fim das SMS (vazio = sem a linha)
  SMS_SUPPORT_PHONE: z.string().optional(),
  // Só no perfil dev: URL dos simuladores, ativa o botão "Simular pagamento"
  DEV_MOCKS_URL: z.string().url().optional().or(z.literal("")),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Configuração inválida: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export type OfficeGestConfig = {
  url: string;
  user: string;
  key: string;
  articleId: string | null;
  vatId: string | null;
  consumerNif: string;
  docTypes: string[];
  issueType: string;
  print: "A" | "T" | "O";
  issueFrom: string | null;
  syncMinutes: number;
};

export function officegestConfig(): OfficeGestConfig | null {
  const e = env();
  if (!e.OFFICEGEST_URL || !e.OFFICEGEST_USER || !e.OFFICEGEST_KEY) return null;
  const issueType = e.OFFICEGEST_ISSUE_TYPE.trim().toLowerCase();
  const docTypes = e.OFFICEGEST_DOC_TYPES.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!docTypes.includes(issueType)) docTypes.unshift(issueType);
  return {
    url: e.OFFICEGEST_URL.replace(/\/+$/, ""),
    user: e.OFFICEGEST_USER,
    key: e.OFFICEGEST_KEY,
    articleId: e.OFFICEGEST_ARTICLE_ID || null,
    vatId: e.OFFICEGEST_VAT_ID || null,
    consumerNif: e.OFFICEGEST_CONSUMER_NIF,
    docTypes,
    issueType,
    print: e.OFFICEGEST_PRINT,
    issueFrom: e.OFFICEGEST_ISSUE_FROM || null,
    syncMinutes: e.OFFICEGEST_SYNC_MINUTES,
  };
}

export type CycleMode = Env["CYCLE_MODE"];
export const cycleMode = (): CycleMode => env().CYCLE_MODE;
export const cycleFromDue = (): string | null => env().CYCLE_FROM_DUE || null;

export type IxcConfig = { url: string; token: string; syncMinutes: number };

export function ixcConfig(): IxcConfig | null {
  const e = env();
  if (!e.IXC_URL || !e.IXC_TOKEN) return null;
  return { url: e.IXC_URL, token: e.IXC_TOKEN, syncMinutes: e.IXC_SYNC_MINUTES };
}

export type AppyPayConfig = {
  url: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  resource: string;
  paymentMethod: string;
  entity: string;
  webhookSecret: string | null;
};

export function appypayConfig(): AppyPayConfig | null {
  const e = env();
  if (!e.APPYPAY_URL || !e.APPYPAY_TOKEN_URL || !e.APPYPAY_CLIENT_ID || !e.APPYPAY_CLIENT_SECRET || !e.APPYPAY_PAYMENT_METHOD) return null;
  return {
    url: e.APPYPAY_URL.endsWith("/") ? e.APPYPAY_URL : e.APPYPAY_URL + "/",
    tokenUrl: e.APPYPAY_TOKEN_URL,
    clientId: e.APPYPAY_CLIENT_ID,
    clientSecret: e.APPYPAY_CLIENT_SECRET,
    resource: e.APPYPAY_RESOURCE ?? "",
    paymentMethod: e.APPYPAY_PAYMENT_METHOD,
    entity: e.APPYPAY_ENTITY,
    webhookSecret: e.APPYPAY_WEBHOOK_SECRET || null,
  };
}

export type SmsConfig = { url: string; key: string; testPhone: string | null };

export function smsConfig(): SmsConfig | null {
  const e = env();
  if (!e.WESENDER_URL || !e.WESENDER_KEY) return null;
  return { url: e.WESENDER_URL, key: e.WESENDER_KEY, testPhone: e.SMS_TEST_PHONE?.trim() || null };
}
