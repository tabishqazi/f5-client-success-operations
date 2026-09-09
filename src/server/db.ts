import 'server-only';
import postgres from 'postgres';
import { DomainError } from '@/domain/errors';
export type Tx = postgres.TransactionSql;
const globalDb = globalThis as unknown as { f5Sql?: postgres.Sql };
export function db(): postgres.Sql {
  if (!process.env.DATABASE_URL) throw new DomainError('UNAVAILABLE', 'Database not configured');
  return globalDb.f5Sql ??= postgres(process.env.DATABASE_URL, {
    max: 5, prepare: false, idle_timeout: 20, connect_timeout: 5, onnotice: () => {},
    // A SQL date is a calendar date, never a midnight timestamp in a browser zone.
    types: { calendarDate: { to: 1082, from: [1082], serialize: String, parse: String } },
  });
}
export async function scoped<T>(workspaceId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return await db().begin(async tx => {
    await tx`select set_config('f5.workspace_id', ${workspaceId}, true)`;
    return work(tx);
  }) as T;
}
