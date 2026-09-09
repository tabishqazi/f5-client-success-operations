import 'server-only';
import { randomUUID } from 'node:crypto';
import { addBusinessDays,dateInTimeZone,routineDueAt } from '@/domain/clock';
import { DomainError } from '@/domain/errors';
import { escalationCopy,type EscalationReason } from '@/domain/issue-lifecycle';
import type { Tx } from './db';

export async function ensureEscalation(tx:Tx,workspaceId:string,issue:{id:string;fix_cycle:number;description:string},reason:EscalationReason,instant:string){
 const [senior]=await tx`select id from f5.operators where workspace_id=${workspaceId} and role='senior' order by id limit 1`;
 if(!senior)throw new DomainError('NOT_FOUND','Senior owner unavailable');
 const copy=escalationCopy(reason);const asOf=dateInTimeZone(instant);const dueAt=copy.urgent?instant:routineDueAt(addBusinessDays(asOf,1));
 const inserted=await tx`insert into f5.escalations(workspace_id,id,issue_id,fix_cycle,owner_id,reason,requested_decision,evidence,due_at) values
  (${workspaceId},${randomUUID()},${issue.id},${issue.fix_cycle},${senior.id},${reason},${copy.requestedDecision},${issue.description},${dueAt})
  on conflict(workspace_id,issue_id,fix_cycle,reason) do nothing returning id`;
 if(inserted[0])return inserted[0].id as string;
 const [existing]=await tx`select id from f5.escalations where workspace_id=${workspaceId} and issue_id=${issue.id} and fix_cycle=${issue.fix_cycle} and reason=${reason}`;
 if(!existing)throw new DomainError('UNAVAILABLE','Senior review was not created');
 return existing.id as string;
}
