import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

export type Tx = Prisma.TransactionClient;

const RETRYABLE = new Set([
  'P2034', // serialization failure / deadlock — another registration won the race
  'P2002', // unique (shiftId, userId) hit by a concurrent double-click; the retry sees the row
]);

/**
 * Run `fn` in a SERIALIZABLE transaction, retrying on write conflicts.
 * Capacity and driver checks read-then-write, so this is what stops two volunteers
 * from both grabbing the last seat at the same moment.
 */
export async function withSerializableTx<T>(fn: (tx: Tx) => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (err) {
      const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
      if (!code || !RETRYABLE.has(code) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 30));
    }
  }
}
