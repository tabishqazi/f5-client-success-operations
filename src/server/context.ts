import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, scoped } from './db';
import { DomainError } from '@/domain/errors';
import { POLICY } from '@/domain/policy';
import { dateInTimeZone, addCalendarDaysToInstant } from '@/domain/clock';
import { seedWorkspace } from './seed';
export const SESSION_COOKIE='f5_session';
export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export async function resolveSession(token: string | undefined): Promise<string> {
 if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new DomainError('FORBIDDEN','Session unavailable');
 const [session]=await db()`select workspace_id from f5.sessions where token_hash=${tokenHash(token)} and expires_at>now()`;
 if (!session) throw new DomainError('FORBIDDEN','Session expired');
 return session.workspace_id as string;
}
export async function createWorkspace(asOf = dateInTimeZone(new Date().toISOString())) {
 const token=randomBytes(32).toString('hex'); const workspaceId=randomUUID();
 const expiresAt=new Date(addCalendarDaysToInstant(new Date().toISOString(),POLICY.demo.sessionLifetimeDays));
 await db().begin(async tx => {
  await tx`insert into f5.workspaces(id,policy_version) values (${workspaceId},${POLICY.version})`;
  await tx`select set_config('f5.workspace_id',${workspaceId},true)`;
  await seedWorkspace(tx,workspaceId,asOf);
  await tx`insert into f5.sessions(token_hash,workspace_id,expires_at) values (${tokenHash(token)},${workspaceId},${expiresAt})`;
 });
 return {token,workspaceId,expiresAt};
}
export async function rateLimit(bucket: string, max: number, seconds: number) {
 const [row]=await db()`insert into f5.rate_limits(bucket,count,resets_at) values (${bucket},1,now()+${seconds}*interval '1 second')
 on conflict(bucket) do update set count=case when f5.rate_limits.resets_at<=now() then 1 else f5.rate_limits.count+1 end,
 resets_at=case when f5.rate_limits.resets_at<=now() then excluded.resets_at else f5.rate_limits.resets_at end returning count`;
 if (Number(row?.count)>max) throw new DomainError('RATE_LIMITED','Rate limited');
}
export async function workspaceSummary(workspaceId:string) {
 return scoped(workspaceId,async tx => {
  const [summary]=await tx`select count(*)::int as placements, count(*) filter(where status='active')::int as active,
   count(*) filter(where status='scheduled')::int as scheduled, count(*) filter(where status='ended')::int as ended from f5.placements where workspace_id=${workspaceId}`;
  return summary;
 });
}
