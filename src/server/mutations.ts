import 'server-only';
import { createHash,randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { validateContactOutcome } from '@/domain/contact-outcome';
import { addBusinessDays,businessDeadline,compareDates,dateInTimeZone,responseDeadline,routineDueAt,verificationDeadlines } from '@/domain/clock';
import { DomainError } from '@/domain/errors';
import { evaluateEscalations,validateIssueCommand,validateIssueCreate } from '@/domain/issue-lifecycle';
import { validateId } from '@/domain/placement';
import { POLICY } from '@/domain/policy';
import { scoped } from './db';
import { ensureEscalation } from './escalation';

export async function recordContactOutcome(workspaceId:string,raw:unknown,keyValue:unknown,occurredAt:string){
 const key=validateId(keyValue);const input=validateContactOutcome(raw);const instant=Temporal.Instant.from(occurredAt).toString();
 const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return scoped(workspaceId,async tx=>{
  await tx`select id from f5.workspaces where id=${workspaceId} for update`;
  const [receipt]=await tx`select request_hash,result from f5.mutation_receipts where workspace_id=${workspaceId} and key=${key}`;
  if(receipt){if(receipt.request_hash!==hash)throw new DomainError('VERSION_CONFLICT','Key reused');return receipt.result;}
  const [contact]=await tx`select id,name,side from f5.contacts where workspace_id=${workspaceId} and id=${input.contactId}`;
  if(!contact)throw new DomainError('NOT_FOUND','Contact unavailable');
  const obligations=input.obligationIds.length?await tx`select o.id,o.type,o.placement_id,o.contact_id,o.state,p.owner_id,p.professional_id
   from f5.obligations o left join f5.placements p on p.workspace_id=o.workspace_id and p.id=o.placement_id
   where o.workspace_id=${workspaceId} and o.id in ${tx(input.obligationIds)} for update of o`:[];
  if(obligations.length!==input.obligationIds.length||obligations.some(item=>item.contact_id!==input.contactId||item.state!=='open'))throw new DomainError('NOT_FOUND','Selected work unavailable');
  const feedbackByPlacement=new Map(input.feedback.map(item=>[item.placementId,item]));
  if(input.feedback.some(entry=>!obligations.some(obligation=>obligation.type==='client_feedback'&&obligation.placement_id===entry.placementId)))throw new DomainError('INVALID_RANGE','Feedback must match selected placement feedback work');
  for(const obligation of obligations){
   if(obligation.type==='client_feedback'&&input.outcome==='reached'&&!feedbackByPlacement.has(obligation.placement_id))throw new DomainError('EVIDENCE_REQUIRED','Placement feedback required');
  }
  const [actor]=await tx`select id from f5.operators where workspace_id=${workspaceId} and role='manager' order by id limit 1`;
  if(!actor)throw new DomainError('NOT_FOUND','Manager unavailable');
  const placementIds=[...new Set(obligations.map(item=>item.placement_id).filter(Boolean))] as string[];
  const interactionId=randomUUID();const placementId:string|null=placementIds.length===1?placementIds[0]!:null;
  await tx`insert into f5.interactions(workspace_id,id,placement_id,contact_id,actor_id,direction,channel,outcome,notes,occurred_at) values
   (${workspaceId},${interactionId},${placementId},${input.contactId},${actor.id},${input.direction},${input.channel},${input.outcome},${input.notes},${instant})`;

  if(input.direction==='outbound')for(const obligation of obligations){
   if(obligation.type==='client_feedback')await tx`insert into f5.feedback_requests(workspace_id,id,placement_id,obligation_id,first_requested_at,response_deadline,channel) values
    (${workspaceId},${randomUUID()},${obligation.placement_id},${obligation.id},${instant},${responseDeadline(instant)},${input.channel}) on conflict(workspace_id,obligation_id) do nothing`;
  }

  if(input.outcome==='rescheduled'){
   const asOf=dateInTimeZone(instant);const latest=addBusinessDays(asOf,POLICY.rescheduling.maximumBusinessDays);
   if(!input.rescheduleDate||compareDates(input.rescheduleDate,asOf)<0||compareDates(input.rescheduleDate,latest)>0)throw new DomainError('INVALID_RANGE','Reschedule is outside the allowed window');
   const next=routineDueAt(input.rescheduleDate);
   if(Temporal.Instant.compare(Temporal.Instant.from(next),Temporal.Instant.from(instant))<=0)throw new DomainError('INVALID_RANGE','Reschedule must be in the future');
   for(const obligation of obligations)await tx`update f5.obligations set next_contact_at=${next},state_reason=${`Rescheduled: ${input.notes}`} where workspace_id=${workspaceId} and id=${obligation.id} and state='open'`;
  }

  let satisfied=0,feedbackCreated=0,issuesCreated=0;const feedbackIds=new Map<string,string>();
  if(input.outcome==='reached')for(const obligation of obligations){
   let feedbackId:string|null=null;const feedback=feedbackByPlacement.get(obligation.placement_id);
   if(obligation.type==='client_feedback'){
    if(!obligation.placement_id||contact.side!=='client'||!feedback)throw new DomainError('EVIDENCE_REQUIRED','Client feedback required');
    feedbackId=feedbackIds.get(obligation.placement_id)??null;
    if(!feedbackId){
     feedbackId=randomUUID();feedbackIds.set(obligation.placement_id,feedbackId);
     await tx`insert into f5.feedback_responses(workspace_id,id,placement_id,contact_id,assessment,rating,notes,received_at,channel) values (${workspaceId},${feedbackId},${obligation.placement_id},${input.contactId},${feedback.assessment},${feedback.rating},${feedback.notes},${instant},${input.channel})`;
     feedbackCreated++;
     if(feedback.assessment!=='satisfied'||(feedback.rating!==null&&feedback.rating<=POLICY.feedback.clarificationRating)){
      const severity=feedback.assessment==='unsatisfied'&&feedback.rating===1?'high':'normal';
      await tx`insert into f5.issues(workspace_id,id,placement_id,reporter_contact_id,owner_id,category,severity,description,state,created_at) values (${workspaceId},${randomUUID()},${obligation.placement_id},${input.contactId},${obligation.owner_id},'performance',${severity},${feedback.notes},'open',${instant})`;
      issuesCreated++;
     }
    }
   }
   const completable=obligation.type==='client_feedback'||obligation.type==='client_monthly'||obligation.type==='professional_monthly';
   if(completable){await tx`update f5.obligations set state='satisfied',state_reason='Covered in a recorded conversation.',satisfied_at=${instant},next_contact_at=null where workspace_id=${workspaceId} and id=${obligation.id}`;satisfied++;}
   await tx`insert into f5.interaction_coverage(workspace_id,interaction_id,obligation_id,feedback_id) values (${workspaceId},${interactionId},${obligation.id},${feedbackId})`;
  }
  const summary=input.outcome==='no_answer'?`No answer from ${contact.name}.`:input.outcome==='rescheduled'?`Contact with ${contact.name} rescheduled.`:`Conversation with ${contact.name} recorded.`;
  for(const affectedPlacement of placementIds)await tx`insert into f5.activity(workspace_id,id,placement_id,actor_id,type,summary,details,occurred_at) values (${workspaceId},${randomUUID()},${affectedPlacement},${actor.id},'contact_outcome',${summary},${tx.json({interactionId,direction:input.direction,channel:input.channel,outcome:input.outcome,obligationIds:input.obligationIds})},${instant})`;
  const result={interactionId,satisfied,feedbackCreated,issuesCreated};
  await tx`insert into f5.mutation_receipts(workspace_id,key,request_hash,result) values (${workspaceId},${key},${hash},${tx.json(result)})`;
  return result;
 });
}

export async function createIssue(workspaceId:string,raw:unknown,keyValue:unknown,occurredAt:string){
 const key=validateId(keyValue),input=validateIssueCreate(raw),instant=Temporal.Instant.from(occurredAt).toString();
 const hash=createHash('sha256').update(JSON.stringify({type:'create_issue',input})).digest('hex');
 return scoped(workspaceId,async tx=>{
  await tx`select id from f5.workspaces where id=${workspaceId} for update`;
  const [receipt]=await tx`select request_hash,result from f5.mutation_receipts where workspace_id=${workspaceId} and key=${key}`;
  if(receipt){if(receipt.request_hash!==hash)throw new DomainError('VERSION_CONFLICT','Key reused');return receipt.result;}
  const [placement]=await tx`select p.id,p.owner_id,
   (select id from f5.contacts where workspace_id=p.workspace_id and client_id=p.client_id order by id limit 1) client_contact_id,
   (select id from f5.contacts where workspace_id=p.workspace_id and professional_id=p.professional_id order by id limit 1) professional_contact_id
   from f5.placements p where p.workspace_id=${workspaceId} and p.id=${input.placementId}`;
  if(!placement)throw new DomainError('NOT_FOUND','Placement unavailable');
  const [count]=await tx`select count(*)::int total from f5.issues where workspace_id=${workspaceId}`;
  if(Number(count?.total)>=200)throw new DomainError('INVALID_RANGE','Workspace issue limit reached');
  const issueId=randomUUID(),reporterId=input.reporterSide==='client'?placement.client_contact_id:placement.professional_contact_id;
  if(!reporterId)throw new DomainError('NOT_FOUND','Reporter unavailable');
  await tx`insert into f5.issues(workspace_id,id,placement_id,reporter_contact_id,owner_id,category,severity,description,state,created_at) values
   (${workspaceId},${issueId},${placement.id},${reporterId},${placement.owner_id},${input.category},${input.severity},${input.description},'open',${instant})`;
  const reasons=evaluateEscalations({explicit:input.escalationTrigger});
  for(const reason of reasons)await ensureEscalation(tx,workspaceId,{id:issueId,fix_cycle:1,description:input.description},reason,instant);
  await tx`insert into f5.activity(workspace_id,id,placement_id,actor_id,type,summary,details,occurred_at) values
   (${workspaceId},${randomUUID()},${placement.id},${placement.owner_id},'issue_created','Issue reported and awaiting triage.',${tx.json({issueId,reporterSide:input.reporterSide,category:input.category,severity:input.severity,escalationReasons:reasons})},${instant})`;
  const result={id:issueId,version:1,state:'open'};
  await tx`insert into f5.mutation_receipts(workspace_id,key,request_hash,result) values (${workspaceId},${key},${hash},${tx.json(result)})`;
  return result;
 });
}

export async function updateIssue(workspaceId:string,issueIdValue:unknown,raw:unknown,keyValue:unknown,occurredAt:string){
 const issueId=validateId(issueIdValue),key=validateId(keyValue),instant=Temporal.Instant.from(occurredAt).toString();
 const input=validateIssueCommand(raw,dateInTimeZone(instant));
 const hash=createHash('sha256').update(JSON.stringify({type:'update_issue',issueId,input})).digest('hex');
 return scoped(workspaceId,async tx=>{
  await tx`select id from f5.workspaces where id=${workspaceId} for update`;
  const [receipt]=await tx`select request_hash,result from f5.mutation_receipts where workspace_id=${workspaceId} and key=${key}`;
  if(receipt){if(receipt.request_hash!==hash)throw new DomainError('VERSION_CONFLICT','Key reused');return receipt.result;}
  const [issue]=await tx`select i.*,reporter.side reporter_side,p.client_id,p.professional_id,
   (select id from f5.contacts where workspace_id=i.workspace_id and client_id=p.client_id order by id limit 1) client_contact_id,
   (select id from f5.contacts where workspace_id=i.workspace_id and professional_id=p.professional_id order by id limit 1) professional_contact_id
   from f5.issues i join f5.contacts reporter on reporter.workspace_id=i.workspace_id and reporter.id=i.reporter_contact_id
   join f5.placements p on p.workspace_id=i.workspace_id and p.id=i.placement_id
   where i.workspace_id=${workspaceId} and i.id=${issueId} for update of i`;
  if(!issue)throw new DomainError('NOT_FOUND','Issue unavailable');
  if(issue.version!==input.version)throw new DomainError('VERSION_CONFLICT','Issue changed');
  const [manager]=await tx`select id from f5.operators where workspace_id=${workspaceId} and role='manager' order by id limit 1`;
  if(!manager)throw new DomainError('NOT_FOUND','Manager unavailable');
  let actorId=manager.id as string,summary='',nextState=issue.state as string;

  if(input.type==='agree_action'){
   if(issue.state!=='open'&&issue.state!=='reopened')throw new DomainError('INVALID_TRANSITION','Issue is not awaiting an action');
   const targetAt=routineDueAt(input.targetDate);
   await tx`update f5.issues set state='action_agreed',action_owner=${input.actionOwner},agreed_action=${input.agreedAction},verification_criteria=${input.verificationCriteria},target_at=${targetAt},fix_reported_at=null,fix_evidence=null,version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
   await tx`insert into f5.issue_actions(workspace_id,id,issue_id,fix_cycle,action_owner,agreed_action,verification_criteria,target_at) values
    (${workspaceId},${randomUUID()},${issueId},${issue.fix_cycle},${input.actionOwner},${input.agreedAction},${input.verificationCriteria},${targetAt})
    on conflict(workspace_id,issue_id,fix_cycle) do update set action_owner=excluded.action_owner,agreed_action=excluded.agreed_action,verification_criteria=excluded.verification_criteria,target_at=excluded.target_at`;
   await tx`update f5.obligations set state='satisfied',state_reason='Corrective action agreed.',satisfied_at=${instant},next_contact_at=null where workspace_id=${workspaceId} and issue_id=${issueId} and type='issue_triage' and state='open'`;
   summary='Corrective action agreed.';nextState='action_agreed';
  }else if(input.type==='report_fix'){
   if(issue.state!=='action_agreed')throw new DomainError('INVALID_TRANSITION','Issue has no active corrective action');
   const deadlines=verificationDeadlines(instant);
   await tx`update f5.issues set state='monitoring',fix_reported_at=${instant},fix_evidence=${input.evidence},version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
   await tx`update f5.issue_actions set fix_reported_at=${instant},fix_evidence=${input.evidence} where workspace_id=${workspaceId} and issue_id=${issueId} and fix_cycle=${issue.fix_cycle}`;
   await tx`insert into f5.verifications(workspace_id,id,issue_id,fix_cycle,window_name,due_at) values
    (${workspaceId},${randomUUID()},${issueId},${issue.fix_cycle},'initial',${deadlines.initial}),
    (${workspaceId},${randomUUID()},${issueId},${issue.fix_cycle},'sustained',${deadlines.sustained})
    on conflict(workspace_id,issue_id,fix_cycle,window_name) do nothing`;
   await tx`update f5.obligations set state='satisfied',state_reason='Fix reported; monitoring started.',satisfied_at=${instant},next_contact_at=null where workspace_id=${workspaceId} and issue_id=${issueId} and type='corrective_action' and state='open'`;
   summary='Fix reported; recovery monitoring started.';nextState='monitoring';
  }else if(input.type==='record_verification'){
   if(issue.state!=='monitoring')throw new DomainError('INVALID_TRANSITION','Issue is not in monitoring');
   const [check]=await tx`select * from f5.verifications where workspace_id=${workspaceId} and id=${input.verificationId} and issue_id=${issueId} and fix_cycle=${issue.fix_cycle} for update`;
   if(!check||check.result||check.canceled_reason)throw new DomainError('NOT_FOUND','Verification unavailable');
   if(input.result==='pass'&&Temporal.Instant.compare(Temporal.Instant.from(instant),Temporal.Instant.from(new Date(check.due_at).toISOString()))<0)throw new DomainError('INVALID_TRANSITION','Observation window is not complete');
   if(input.result==='pass'&&check.window_name==='sustained'){
    const [initial]=await tx`select result from f5.verifications where workspace_id=${workspaceId} and issue_id=${issueId} and fix_cycle=${issue.fix_cycle} and window_name='initial'`;
    if(initial?.result!=='pass')throw new DomainError('INVALID_TRANSITION','Initial verification must pass first');
    if(input.confirmerSide!==issue.reporter_side)throw new DomainError('EVIDENCE_REQUIRED','Final confirmation must come from the reporting side');
   }
   const confirmerId=input.confirmerSide==='client'?issue.client_contact_id:issue.professional_contact_id;
   if(!confirmerId)throw new DomainError('NOT_FOUND','Confirmer unavailable');
   await tx`insert into f5.verification_attempts(workspace_id,id,verification_id,result,confirmer_id,observed_at,evidence) values (${workspaceId},${randomUUID()},${check.id},${input.result},${confirmerId},${instant},${input.evidence})`;
   if(input.result==='inconclusive'){
    await tx`update f5.obligations set next_contact_at=${businessDeadline(instant,1)},state_reason='Verification was inconclusive; confirmation is still required.' where workspace_id=${workspaceId} and issue_id=${issueId} and type='verification' and occurrence_key=${`issue:${issueId}:cycle:${issue.fix_cycle}:verification:${check.window_name}`} and state='open'`;
    await tx`update f5.issues set version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
    summary='Verification was inconclusive; follow-up remains open.';
   }else{
    await tx`update f5.verifications set result=${input.result},confirmer_id=${confirmerId},observed_at=${instant},evidence=${input.evidence} where workspace_id=${workspaceId} and id=${check.id}`;
    await tx`update f5.obligations set state='satisfied',state_reason=${`Verification recorded: ${input.result}.`},satisfied_at=${instant},next_contact_at=null where workspace_id=${workspaceId} and issue_id=${issueId} and type='verification' and occurrence_key=${`issue:${issueId}:cycle:${issue.fix_cycle}:verification:${check.window_name}`} and state='open'`;
    if(input.result==='fail'){
     const reason='A verification failed; a new corrective-action cycle is required.';
     await tx`update f5.verifications set canceled_reason=${reason} where workspace_id=${workspaceId} and issue_id=${issueId} and fix_cycle=${issue.fix_cycle} and result is null and canceled_reason is null`;
     await tx`update f5.obligations set state='canceled',state_reason=${reason} where workspace_id=${workspaceId} and issue_id=${issueId} and type='verification' and state='open'`;
     const nextCycle=Number(issue.fix_cycle)+1;
     await tx`update f5.issues set state='reopened',fix_cycle=${nextCycle},action_owner=null,agreed_action=null,verification_criteria=null,target_at=null,fix_reported_at=null,fix_evidence=null,closed_at=null,closure_evidence=null,version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
     for(const reason of evaluateEscalations({verificationFailed:true}))await ensureEscalation(tx,workspaceId,{id:issueId,fix_cycle:nextCycle,description:issue.description},reason,instant);
     summary='Verification failed; issue reopened for a new recovery plan.';nextState='reopened';
    }else if(check.window_name==='sustained'){
     await tx`update f5.issues set state='verified_closed',closed_at=${instant},closure_evidence=${input.evidence},version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
     summary='Recovery held through both observation windows; issue verified closed.';nextState='verified_closed';
    }else{
     await tx`update f5.issues set version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
     summary='Initial recovery verification passed.';
    }
   }
  }else if(input.type==='reopen'){
   if(issue.state!=='verified_closed')throw new DomainError('INVALID_TRANSITION','Only a verified closed issue can be reopened');
   const nextCycle=Number(issue.fix_cycle)+1;
   await tx`update f5.issues set state='reopened',fix_cycle=${nextCycle},action_owner=null,agreed_action=null,verification_criteria=null,target_at=null,fix_reported_at=null,fix_evidence=null,closed_at=null,closure_evidence=null,version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
   for(const reason of evaluateEscalations({recurrence:true}))await ensureEscalation(tx,workspaceId,{id:issueId,fix_cycle:nextCycle,description:issue.description},reason,instant);
   summary='Issue recurred after closure and was reopened.';nextState='reopened';
  }else{
   const [escalation]=await tx`select * from f5.escalations where workspace_id=${workspaceId} and id=${input.escalationId} and issue_id=${issueId} for update`;
   if(!escalation)throw new DomainError('NOT_FOUND','Senior review unavailable');
   if(escalation.version!==input.escalationVersion)throw new DomainError('VERSION_CONFLICT','Senior review changed');
   actorId=escalation.owner_id;
   if(input.type==='acknowledge_escalation'){
    if(escalation.state!=='pending_acknowledgment')throw new DomainError('INVALID_TRANSITION','Senior review is already acknowledged');
    await tx`update f5.escalations set state='acknowledged',acknowledged_at=${instant},acknowledged_by=${actorId},version=version+1 where workspace_id=${workspaceId} and id=${escalation.id}`;
    summary='Senior owner acknowledged the review.';
   }else{
    if(escalation.state!=='acknowledged')throw new DomainError('INVALID_TRANSITION','Senior review must be acknowledged first');
    await tx`update f5.escalations set state='decision_recorded',decision=${input.decision},decided_at=${instant},follow_up_owner=${input.followUpOwner},follow_up_action=${input.followUpAction},version=version+1 where workspace_id=${workspaceId} and id=${escalation.id}`;
    await tx`update f5.obligations set state='satisfied',state_reason='Senior decision recorded.',satisfied_at=${instant},next_contact_at=null where workspace_id=${workspaceId} and issue_id=${issueId} and type='senior_review' and occurrence_key=${`issue:${issueId}:cycle:${escalation.fix_cycle}:senior:${escalation.reason}`} and state='open'`;
    summary='Senior decision and responsible follow-up recorded.';
   }
   await tx`update f5.issues set version=version+1 where workspace_id=${workspaceId} and id=${issueId}`;
  }
  await tx`insert into f5.activity(workspace_id,id,placement_id,actor_id,type,summary,details,occurred_at) values
   (${workspaceId},${randomUUID()},${issue.placement_id},${actorId},'issue_updated',${summary},${tx.json({issueId,command:input.type,evidence:'evidence' in input?input.evidence:undefined,previousState:issue.state,nextState})},${instant})`;
  const result={id:issueId,version:Number(issue.version)+1,state:nextState};
  await tx`insert into f5.mutation_receipts(workspace_id,key,request_hash,result) values (${workspaceId},${key},${hash},${tx.json(result)})`;
  return result;
 });
}
