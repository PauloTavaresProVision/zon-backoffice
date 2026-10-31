import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function kvGet(key: string): Promise<string | null> {
  const [row] = await db().select({ value: schema.kv.value }).from(schema.kv).where(eq(schema.kv.key, key)).limit(1);
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await db().insert(schema.kv).values({ key, value })
    .onConflictDoUpdate({ target: schema.kv.key, set: { value, updatedAt: sql`now()` } });
}
