import 'server-only';
import { randomUUID } from 'node:crypto';
import { addBusinessDays, addCalendarDays, compareDates, dateInTimeZone, routineDueAt, trialReviewDate } from '@/domain/clock';
import { feedbackOccurrences, monthlyOccurrences } from '@/domain/evaluate';
import { evaluateEscalations } from '@/domain/issue-lifecycle';
import { POLICY } from '@/domain/policy';
import { scoped, type Tx } from './db';
import { upgradeSeedWorkspace } from './seed';
import { ensureEscalation } from './escalation';

type Desired={workspace_id:string;id:string;type:string;placement_id?:string;client_id?:string;professional_id?:string;issue_id?:string;contact_id:string;occurrence_key:string;policy_version:string;due_at:string;state?:string;state_reason?:string;satisfied_at?:string};
const iso=(value:unknown)=>new Date(String(value)).toISOString();

function currentAndFuture(items:{date:string;key:string}[],asOf:string,baseline?:string|null){
  if(baseline)return items.filter(item=>compareDates(item.date,baseline)>0);
  const past=items.filter(item=>compareDates(item.date,asOf)<=0).at(-1);
  return items.filter(item=>item===past||compareDates(item.date,asOf)>0);
}

async function insertDesired(tx:Tx,desired:Desired[]){
  if(!desired.length)return;
  const normalized=desired.map(item=>({...item,placement_id:item.placement_id??null,client_id:item.client_id??null,professional_id:item.professional_id??null,issue_id:item.issue_id??null,state:item.state??'open',state_reason:item.state_reason??null,satisfied_at:item.satisfied_at??null}));
  await tx`insert into f5.obligations ${tx(normalized,'workspace_id','id','type','placement_id','client_id','professional_id','issue_id','contact_id','occurrence_key','policy_version','due_at','state','state_reason','satisfied_at')} on conflict(workspace_id,type,occurrence_key) do nothing`;
}

export async function reconcileWorkspace(workspaceId:string,asOf:string){
 return scoped(workspaceId,async tx=>{
  await tx`select id from f5.workspaces where id=${workspaceId} for update`;
  await upgradeSeedWorkspace(tx,workspaceId,asOf);
  const horizon=addCalendarDays(asOf,POLICY.scheduling.forwardHorizonCalendarDays);
  const placements=await tx`select p.id,p.client_id,p.professional_id,p.start_date,p.trial_end,p.trial_decision,p.status,
   cc.id client_contact_id,pc.id professional_contact_id,
   (select max(received_at) from f5.feedback_responses f where f.workspace_id=p.workspace_id and f.placement_id=p.id) latest_feedback
   from f5.placements p
   join f5.contacts cc on cc.workspace_id=p.workspace_id and cc.client_id=p.client_id
   join f5.contacts pc on pc.workspace_id=p.workspace_id and pc.professional_id=p.professional_id
   where p.workspace_id=${workspaceId} and p.status<>'ended'`;
  const desired:Desired[]=[];
  for(const p of placements){
   if(p.trial_decision==='pending'){
    const date=trialReviewDate(p.start_date,p.trial_end);
    if(compareDates(date,horizon)<=0)desired.push({workspace_id:workspaceId,id:randomUUID(),type:'trial_review',placement_id:p.id,contact_id:p.client_contact_id,occurrence_key:`placement:${p.id}:trial:${date}`,policy_version:POLICY.version,due_at:routineDueAt(date)});
   }
   const feedback=feedbackOccurrences(p.start_date,horizon);
   const baseline=p.latest_feedback?dateInTimeZone(iso(p.latest_feedback)):null;
   for(const occurrence of currentAndFuture(feedback,asOf,baseline))desired.push({workspace_id:workspaceId,id:randomUUID(),type:'client_feedback',placement_id:p.id,contact_id:p.client_contact_id,occurrence_key:`placement:${p.id}:feedback:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date)});
   for(const occurrence of currentAndFuture(monthlyOccurrences(p.start_date,horizon),asOf,null))desired.push({workspace_id:workspaceId,id:randomUUID(),type:'professional_monthly',professional_id:p.professional_id,placement_id:p.id,contact_id:p.professional_contact_id,occurrence_key:`professional:${p.professional_id}:monthly:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date)});
  }
  const desiredKeys=new Set(desired.map(item=>item.occurrence_key));
  const staleSchedule=await tx`select o.id,o.type,o.occurrence_key,o.due_at from f5.obligations o
   join f5.placements p on p.workspace_id=o.workspace_id and p.id=o.placement_id
   where o.workspace_id=${workspaceId} and o.state='open' and p.status<>'ended'
   and o.type in ('trial_review','client_feedback','professional_monthly')
   and (o.type='trial_review' or o.due_at>=${routineDueAt(asOf)})
   and not exists(select 1 from f5.feedback_requests r where r.workspace_id=o.workspace_id and r.obligation_id=o.id)`;
  for(const obligation of staleSchedule){
   if(!desiredKeys.has(obligation.occurrence_key))await tx`update f5.obligations set state='superseded',state_reason='The placement schedule changed.' where workspace_id=${workspaceId} and id=${obligation.id} and state='open'`;
  }
  const clients=await tx`select c.id,c.cadence_anchor,ct.id contact_id from f5.clients c join f5.contacts ct on ct.workspace_id=c.workspace_id and ct.client_id=c.id
   where c.workspace_id=${workspaceId} and exists(select 1 from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='active')`;
  for(const client of clients)for(const occurrence of currentAndFuture(monthlyOccurrences(client.cadence_anchor,horizon),asOf,null))desired.push({workspace_id:workspaceId,id:randomUUID(),type:'client_monthly',client_id:client.id,contact_id:client.contact_id,occurrence_key:`client:${client.id}:monthly:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date)});

  const issues=await tx`select i.*,c.id contact_id from f5.issues i join f5.contacts c on c.workspace_id=i.workspace_id and c.id=i.reporter_contact_id where i.workspace_id=${workspaceId} and i.state<>'verified_closed'`;
  for(const issue of issues){
   if(issue.state==='open'||issue.state==='reopened'){
    const created=dateInTimeZone(iso(issue.created_at));const date=issue.severity==='critical'?created:addBusinessDays(created,POLICY.issues.triageBusinessDays);
    desired.push({workspace_id:workspaceId,id:randomUUID(),type:'issue_triage',placement_id:issue.placement_id,issue_id:issue.id,contact_id:issue.contact_id,occurrence_key:`issue:${issue.id}:cycle:${issue.fix_cycle}:triage`,policy_version:POLICY.version,due_at:routineDueAt(date)});
   }
   if(issue.state==='action_agreed'&&issue.target_at){
    desired.push({workspace_id:workspaceId,id:randomUUID(),type:'corrective_action',placement_id:issue.placement_id,issue_id:issue.id,contact_id:issue.contact_id,occurrence_key:`issue:${issue.id}:cycle:${issue.fix_cycle}:action`,policy_version:POLICY.version,due_at:iso(issue.target_at)});
    const reasons=evaluateEscalations({state:issue.state,targetDate:dateInTimeZone(iso(issue.target_at)),asOf});
    for(const reason of reasons)await ensureEscalation(tx,workspaceId,{id:String(issue.id),fix_cycle:Number(issue.fix_cycle),description:String(issue.description)},reason,routineDueAt(asOf));
   }
  }
  const checks=await tx`select v.*,i.placement_id,i.reporter_contact_id contact_id from f5.verifications v join f5.issues i on i.workspace_id=v.workspace_id and i.id=v.issue_id where v.workspace_id=${workspaceId}`;
  for(const check of checks)desired.push({workspace_id:workspaceId,id:randomUUID(),type:'verification',placement_id:check.placement_id,issue_id:check.issue_id,contact_id:check.contact_id,occurrence_key:`issue:${check.issue_id}:cycle:${check.fix_cycle}:verification:${check.window_name}`,policy_version:POLICY.version,due_at:iso(check.due_at),state:check.canceled_reason?'canceled':check.result?'satisfied':'open',state_reason:check.canceled_reason??(check.result?`Verification recorded: ${check.result}.`:undefined),satisfied_at:check.result?iso(check.observed_at):undefined});
  const senior=await tx`select id from f5.contacts where workspace_id=${workspaceId} and side='senior' limit 1`;
  const escalations=await tx`select e.*,i.placement_id from f5.escalations e join f5.issues i on i.workspace_id=e.workspace_id and i.id=e.issue_id where e.workspace_id=${workspaceId}`;
  if(senior[0])for(const escalation of escalations)desired.push({workspace_id:workspaceId,id:randomUUID(),type:'senior_review',placement_id:escalation.placement_id,issue_id:escalation.issue_id,contact_id:senior[0].id,occurrence_key:`issue:${escalation.issue_id}:cycle:${escalation.fix_cycle}:senior:${escalation.reason}`,policy_version:POLICY.version,due_at:iso(escalation.due_at),state:escalation.state==='decision_recorded'?'satisfied':'open',state_reason:escalation.state==='decision_recorded'?'Senior decision recorded.':undefined,satisfied_at:escalation.state==='decision_recorded'?iso(escalation.due_at):undefined});

  await insertDesired(tx,desired);
  await tx`update f5.obligations o set state='satisfied',state_reason='Verification recorded: '||v.result||'.',satisfied_at=v.observed_at
   from f5.verifications v where o.workspace_id=${workspaceId} and v.workspace_id=o.workspace_id and o.issue_id=v.issue_id and o.type='verification'
   and o.occurrence_key=('issue:'||v.issue_id||':cycle:'||v.fix_cycle||':verification:'||v.window_name) and v.result is not null and o.state='open'`;
  await tx`update f5.obligations o set state='canceled',state_reason=v.canceled_reason
   from f5.verifications v where o.workspace_id=${workspaceId} and v.workspace_id=o.workspace_id and o.issue_id=v.issue_id and o.type='verification'
   and o.occurrence_key=('issue:'||v.issue_id||':cycle:'||v.fix_cycle||':verification:'||v.window_name) and v.canceled_reason is not null and o.state='open'`;
  await tx`update f5.obligations o set state='satisfied',state_reason='Senior decision recorded.',satisfied_at=e.due_at
   from f5.escalations e where o.workspace_id=${workspaceId} and e.workspace_id=o.workspace_id and o.issue_id=e.issue_id and o.type='senior_review'
   and o.occurrence_key=('issue:'||e.issue_id||':cycle:'||e.fix_cycle||':senior:'||e.reason) and e.state='decision_recorded' and o.state='open'`;
  await tx`update f5.obligations o set state='canceled',state_reason='Placement ended.' from f5.placements p where o.workspace_id=${workspaceId} and p.workspace_id=o.workspace_id and p.id=o.placement_id and p.status='ended' and o.state='open' and o.type in ('trial_review','client_feedback','professional_monthly')`;
  return {created:desired.length,through:horizon};
 });
}
