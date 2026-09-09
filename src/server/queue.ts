import 'server-only';
import { Temporal } from '@js-temporal/polyfill';
import { addCalendarDays, routineDueAt } from '@/domain/clock';
import { evaluateObligation, groupQueue, localContactState, type QueueCard, type QueueItem } from '@/domain/evaluate';
import type { ContactSide, ObligationType } from '@/domain/types';
import { POLICY } from '@/domain/policy';
import { scoped } from './db';
import { reconcileWorkspace } from './reconcile';

export interface QueueResponse {asOf:string;scope:'today'|'upcoming';hasPlacements:boolean;counts:{immediate:number;urgent:number;overdue:number;dueToday:number};cards:QueueCard[]}

export async function getQueue(workspaceId:string,instant:string,asOf:string,scope:'today'|'upcoming'='today'):Promise<QueueResponse>{
 await reconcileWorkspace(workspaceId,asOf);
 return scoped(workspaceId,async tx=>{
  const [placementCount]=await tx`select count(*)::int total from f5.placements where workspace_id=${workspaceId}`;
  const todayEnd=routineDueAt(asOf);const horizon=routineDueAt(addCalendarDays(asOf,POLICY.scheduling.forwardHorizonCalendarDays));
  const rows=await tx`select o.id,o.type,o.due_at,o.next_contact_at,o.placement_id,c.id contact_id,c.name contact_name,c.side contact_side,c.email contact_email,c.time_zone contact_zone,
   cl.name client_name,pro.name professional_name,p.start_date,p.trial_end,p.trial_decision,
   fr.first_requested_at,fr.response_deadline,i.severity issue_severity,e.reason escalation_reason
   from f5.obligations o join f5.contacts c on c.workspace_id=o.workspace_id and c.id=o.contact_id
   left join f5.placements p on p.workspace_id=o.workspace_id and p.id=o.placement_id
   left join f5.clients cl on cl.workspace_id=o.workspace_id and cl.id=coalesce(o.client_id,p.client_id)
   left join f5.professionals pro on pro.workspace_id=o.workspace_id and pro.id=coalesce(o.professional_id,p.professional_id)
   left join f5.feedback_requests fr on fr.workspace_id=o.workspace_id and fr.obligation_id=o.id
   left join f5.issues i on i.workspace_id=o.workspace_id and i.id=o.issue_id
   left join lateral(select reason from f5.escalations e where e.workspace_id=o.workspace_id and e.issue_id=o.issue_id and o.occurrence_key like '%:senior:'||e.reason order by e.due_at desc limit 1) e on o.type='senior_review'
   where o.workspace_id=${workspaceId} and o.state='open' and o.due_at<=${horizon}
   order by o.due_at,o.id`;
  const all:QueueItem[]=rows.map(row=>{
   const reason=evaluateObligation({obligationId:row.id,type:row.type as ObligationType,dueAt:new Date(row.due_at).toISOString(),asOf,trialEnd:row.trial_end,trialStart:row.start_date,trialDecision:row.trial_decision,firstRequestedAt:row.first_requested_at?new Date(row.first_requested_at).toISOString():null,responseDeadline:row.response_deadline?new Date(row.response_deadline).toISOString():null,issueSeverity:row.issue_severity,escalationReason:row.escalation_reason});
   const dueAt=new Date(row.due_at).toISOString();const nextContactAt=row.next_contact_at?new Date(row.next_contact_at).toISOString():null;
   const scheduledAt=reason.priority==='P0'?dueAt:nextContactAt??dueAt;
   const contact=localContactState(instant,row.contact_zone);
   return {obligationId:row.id,type:row.type as ObligationType,dueAt,scheduledAt,priority:reason.priority,reason:nextContactAt?`${reason.explanation} Next contact is scheduled for ${dateOnly(nextContactAt)}.`:reason.explanation,contactId:row.contact_id,contactName:row.contact_name,contactSide:row.contact_side as ContactSide,contactEmail:row.contact_email,contactZone:row.contact_zone,clientName:row.client_name??null,professionalName:row.professional_name??null,placementId:row.placement_id??null,trialEnd:row.trial_end??null,bucket:contact.bucket,localTime:contact.localTime};
  });
  const today=all.filter(item=>Temporal.Instant.compare(Temporal.Instant.from(item.scheduledAt),Temporal.Instant.from(todayEnd))<=0);
  const selected=scope==='today'?today:all.filter(item=>Temporal.Instant.compare(Temporal.Instant.from(item.scheduledAt),Temporal.Instant.from(todayEnd))>0);
  const todayCards=groupQueue(today);
  const contactKey=(item:QueueItem)=>`${item.contactId}:${item.bucket}`;
  return {asOf,scope,hasPlacements:Number(placementCount?.total??0)>0,counts:{immediate:todayCards.filter(card=>card.priority==='P0').length,urgent:todayCards.filter(card=>card.priority==='P1').length,overdue:new Set(today.filter(item=>dateOnly(item.dueAt)<asOf).map(contactKey)).size,dueToday:new Set(today.filter(item=>dateOnly(item.dueAt)===asOf).map(contactKey)).size},cards:scope==='today'?todayCards:groupQueue(selected)};
 });
}
function dateOnly(instant:string){return Temporal.Instant.from(instant).toZonedDateTimeISO(POLICY.time.operationsZone).toPlainDate().toString();}
