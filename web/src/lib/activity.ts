import { db, schema } from "@/lib/db";

export type ActivityInput = {
  kind: string;
  message: string;
  customerId?: number | null;
  userId?: number | null;
  meta?: Record<string, unknown>;
};

export async function logActivity(a: ActivityInput): Promise<void> {
  await db().insert(schema.activity).values({
    kind: a.kind,
    message: a.message,
    customerId: a.customerId ?? null,
    userId: a.userId ?? null,
    meta: a.meta ?? null,
  });
}
