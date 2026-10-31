import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

// PDFs das faturas num volume do Docker. Um documento emitido não muda, por isso guarda-se uma vez.
const root = () => path.resolve(env().PDF_DIR);
const safe = (s: string) => s.replace(/[^\w.-]+/g, "_");

export const pdfRelPath = (type: string, number: string) => `${safe(type)}/${safe(number)}.pdf`;

function resolveInside(rel: string): string {
  const full = path.resolve(root(), rel);
  if (!full.startsWith(root() + path.sep)) throw new Error("Caminho de PDF inválido.");
  return full;
}

export async function savePdf(rel: string, data: Buffer): Promise<void> {
  const full = resolveInside(rel);
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, full);
}

export async function readPdf(rel: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveInside(rel));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deletePdf(rel: string): Promise<void> {
  try {
    await unlink(resolveInside(rel));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
