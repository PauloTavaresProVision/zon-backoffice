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
