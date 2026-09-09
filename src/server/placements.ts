import 'server-only';
import { randomUUID,createHash } from 'node:crypto';
import { scoped } from './db';
import type { Tx } from './db';
import { validatePlacement,validateId,type PlacementRecord } from '@/domain/placement';
import { dateInTimeZone } from '@/domain/clock';
import { DomainError } from '@/domain/errors';
import { evaluateHealth } from '@/domain/health';
import { validatePlacementListQuery } from '@/domain/pagination';

async function selectPlacements(tx:Tx,w:string,id?:string) {
 return tx<PlacementRecord[]>`select p.*, c.name as client_name,c.version as client_version, pro.name as professional_name,pro.role,pro.location,o.name as owner_name,
 cc.name as client_contact_name,cc.email as client_email,cc.time_zone as client_time_zone,
 pc.email as professional_email,pc.time_zone as professional_time_zone
 from f5.placements p join f5.clients c on c.workspace_id=p.workspace_id and c.id=p.client_id
 join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
 join f5.operators o on o.workspace_id=p.workspace_id and o.id=p.owner_id
 left join lateral(select name,email,time_zone from f5.contacts where workspace_id=p.workspace_id and client_id=p.client_id order by id limit 1) cc on true
 left join lateral(select email,time_zone from f5.contacts where workspace_id=p.workspace_id and professional_id=p.professional_id order by id limit 1) pc on true
 where p.workspace_id=${w} ${id?tx`and p.id=${id}`:tx``} order by p.start_date desc,p.id limit 100`;
}
export function listPlacements(w:string) { return scoped(w,tx=>selectPlacements(tx,w)); }
export interface PlacementListPage {
 items: PlacementRecord[];
 total: number;
 page: number;
 pageSize: number;
 totalPages: number;
}
export function listPlacementsPage(w:string,value:{page?:unknown;pageSize?:unknown;search?:unknown}):Promise<PlacementListPage> {
 const query=validatePlacementListQuery(value);
 return scoped(w,async tx=>{
  const pattern=`%${query.search.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')}%`;
  const condition=query.search?tx`and (pro.name ilike ${pattern} escape '\\' or c.name ilike ${pattern} escape '\\' or pro.role ilike ${pattern} escape '\\')`:tx``;
  const [count]=await tx`select count(*)::int total from f5.placements p
   join f5.clients c on c.workspace_id=p.workspace_id and c.id=p.client_id
   join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
   where p.workspace_id=${w} ${condition}`;
  const total=Number(count?.total??0);const totalPages=Math.max(1,Math.ceil(total/query.pageSize));const page=Math.min(query.page,totalPages);const offset=(page-1)*query.pageSize;
  const items=await tx<PlacementRecord[]>`select p.*, c.name as client_name,c.version as client_version,pro.name as professional_name,pro.role,pro.location,o.name as owner_name,
   cc.name as client_contact_name,cc.email as client_email,cc.time_zone as client_time_zone,
   pc.email as professional_email,pc.time_zone as professional_time_zone
   from f5.placements p join f5.clients c on c.workspace_id=p.workspace_id and c.id=p.client_id
   join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
   join f5.operators o on o.workspace_id=p.workspace_id and o.id=p.owner_id
   left join lateral(select name,email,time_zone from f5.contacts where workspace_id=p.workspace_id and client_id=p.client_id order by id limit 1) cc on true
   left join lateral(select email,time_zone from f5.contacts where workspace_id=p.workspace_id and professional_id=p.professional_id order by id limit 1) pc on true
   where p.workspace_id=${w} ${condition} order by p.start_date desc,p.id limit ${query.pageSize} offset ${offset}`;
  return {items,total,page,pageSize:query.pageSize,totalPages};
 });
}
export async function getPlacement(w:string,id:string,now=new Date().toISOString()) {
 validateId(id);
 return scoped(w,async tx=>{
  const [placement]=await selectPlacements(tx,w,id);
  if(!placement) throw new DomainError('NOT_FOUND','Placement unavailable');
  const feedback=await tx`select assessment,rating,notes,received_at from f5.feedback_responses where workspace_id=${w} and placement_id=${id} order by received_at desc limit 20`;
  const activity=await tx`select type,summary,occurred_at from f5.activity where workspace_id=${w} and placement_id=${id} order by occurred_at desc limit 50`;
  const issues=await tx`select id,description,state,severity,target_at from f5.issues where workspace_id=${w} and placement_id=${id} order by created_at desc limit 20`;
  const obligations=await tx`select id,type,due_at,next_contact_at from f5.obligations where workspace_id=${w} and placement_id=${id} and state='open' order by due_at limit 30`;
  const activeIssues=issues.filter(issue=>issue.state!=='verified_closed');
  const health=evaluateHealth({latestAssessment:feedback[0]?.assessment,latestRating:feedback[0]?.rating,hasActiveIssue:activeIssues.length>0,hasCriticalIssue:activeIssues.some(issue=>issue.severity==='critical'),hasOverdueFeedback:obligations.some(obligation=>obligation.type==='client_feedback'&&new Date(obligation.due_at).getTime()<new Date(now).getTime())});
  return {placement,feedback,activity,issues,obligations,health};
 });
}
export function getLookups(w:string) {
 return scoped(w,async tx=>({
  operators:await tx`select id,name,role from f5.operators where workspace_id=${w} order by name`,
  clients:await tx`select c.id,c.name,ct.name as contact_name,ct.email,ct.time_zone from f5.clients c join f5.contacts ct on ct.workspace_id=c.workspace_id and ct.client_id=c.id where c.workspace_id=${w} order by c.name`,
 }));
}
export function listIssues(w:string) {
 return scoped(w,tx=>tx`select i.id,i.description,i.state,i.severity,i.category,i.action_owner,i.agreed_action,i.verification_criteria,i.target_at,i.fix_reported_at,i.fix_evidence,i.fix_cycle,i.version,i.closed_at,i.closure_evidence,
 pro.name as professional_name,c.id as client_id,c.name as client_name,p.id as placement_id,o.name as owner_name,reporter.name reporter_name,reporter.side reporter_side,
 (select min(due_at) from f5.verifications where workspace_id=${w} and issue_id=i.id and result is null and canceled_reason is null) as next_verification,
 coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'fix_cycle',v.fix_cycle,'window_name',v.window_name,'due_at',v.due_at,'result',v.result,'observed_at',v.observed_at,'evidence',v.evidence,'canceled_reason',v.canceled_reason,'attempts',coalesce((select jsonb_agg(jsonb_build_object('result',a.result,'observed_at',a.observed_at,'evidence',a.evidence) order by a.observed_at) from f5.verification_attempts a where a.workspace_id=v.workspace_id and a.verification_id=v.id),'[]'::jsonb)) order by v.fix_cycle desc,v.due_at) from f5.verifications v where v.workspace_id=i.workspace_id and v.issue_id=i.id),'[]'::jsonb) verifications,
 coalesce((select jsonb_agg(jsonb_build_object('fix_cycle',a.fix_cycle,'action_owner',a.action_owner,'agreed_action',a.agreed_action,'verification_criteria',a.verification_criteria,'target_at',a.target_at,'fix_reported_at',a.fix_reported_at,'fix_evidence',a.fix_evidence) order by a.fix_cycle desc) from f5.issue_actions a where a.workspace_id=i.workspace_id and a.issue_id=i.id),'[]'::jsonb) actions,
 (select jsonb_build_object('id',e.id,'fix_cycle',e.fix_cycle,'reason',e.reason,'state',e.state,'requested_decision',e.requested_decision,'evidence',e.evidence,'due_at',e.due_at,'owner_name',eo.name,'acknowledged_at',e.acknowledged_at,'decision',e.decision,'decided_at',e.decided_at,'follow_up_owner',e.follow_up_owner,'follow_up_action',e.follow_up_action,'version',e.version) from f5.escalations e join f5.operators eo on eo.workspace_id=e.workspace_id and eo.id=e.owner_id where e.workspace_id=i.workspace_id and e.issue_id=i.id order by (e.state<>'decision_recorded') desc,e.fix_cycle desc,e.due_at desc limit 1) escalation
 from f5.issues i join f5.placements p on p.workspace_id=i.workspace_id and p.id=i.placement_id
 join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
 join f5.clients c on c.workspace_id=p.workspace_id and c.id=p.client_id
 join f5.operators o on o.workspace_id=i.workspace_id and o.id=i.owner_id
 join f5.contacts reporter on reporter.workspace_id=i.workspace_id and reporter.id=i.reporter_contact_id
 where i.workspace_id=${w} order by i.created_at desc limit 100`);
}
export async function savePlacement(w:string, raw:unknown, key:string, id?:string, version?:number) {
 validateId(key);if(id) validateId(id);
 if(id && (!Number.isSafeInteger(version)||Number(version)<1)) throw new DomainError('INVALID_RANGE','Version required');
 const input=validatePlacement(raw,dateInTimeZone(new Date().toISOString()));
 const hash=createHash('sha256').update(JSON.stringify({input,id,version})).digest('hex');
 return scoped(w,async tx=>{
  // Serialize writes and receipt checks per workspace; protects record caps as well.
  await tx`select id from f5.workspaces where id=${w} for update`;
  const [receipt]=await tx`select request_hash,result from f5.mutation_receipts where workspace_id=${w} and key=${key}`;
  if(receipt){if(receipt.request_hash!==hash)throw new DomainError('VERSION_CONFLICT','Key reused');return receipt.result as {id:string;version:number};}
  const [owner]=await tx`select id from f5.operators where workspace_id=${w} and id=${input.ownerId} and role='manager'`;
  if(!owner)throw new DomainError('NOT_FOUND','Owner unavailable');
  let clientId=input.clientId,professionalId=input.professionalId;
  let previous:PlacementRecord|undefined;
  if(id){
   const [current]=await tx`select * from f5.placements where workspace_id=${w} and id=${id} for update`;
   if(!current)throw new DomainError('NOT_FOUND','Placement unavailable');
   if(current.version!==version)throw new DomainError('VERSION_CONFLICT','Record changed');
   if(clientId!==current.client_id || professionalId!==current.professional_id)throw new DomainError('INVALID_RANGE','Reassignment requires a new engagement');
   [previous]=await selectPlacements(tx,w,id);
  }
  if(clientId){
   if(!(await tx`select id from f5.clients where workspace_id=${w} and id=${clientId}`).length)throw new DomainError('NOT_FOUND','Client unavailable');
   if(id){
    const [client]=await tx`select version from f5.clients where workspace_id=${w} and id=${clientId} for update`;
    if(client?.version!==input.clientVersion)throw new DomainError('VERSION_CONFLICT','Client changed');
    await tx`update f5.clients set name=${input.clientName},version=version+1 where workspace_id=${w} and id=${clientId}`;
    await tx`update f5.contacts set name=${input.clientContactName},email=${input.clientEmail},time_zone=${input.clientTimeZone} where workspace_id=${w} and client_id=${clientId}`;
   }
  }else{
   clientId=randomUUID();
   await tx`insert into f5.clients(workspace_id,id,name,owner_id,cadence_anchor) values (${w},${clientId},${input.clientName},${input.ownerId},${input.startDate})`;
   await tx`insert into f5.contacts(workspace_id,id,name,side,client_id,email,time_zone) values (${w},${randomUUID()},${input.clientContactName},'client',${clientId},${input.clientEmail},${input.clientTimeZone})`;
  }
  if(!id && professionalId)throw new DomainError('INVALID_RANGE','Create a new professional with the engagement');
  if(professionalId){
   if(!(await tx`select id from f5.professionals where workspace_id=${w} and id=${professionalId}`).length)throw new DomainError('NOT_FOUND','Professional unavailable');
   await tx`update f5.professionals set name=${input.professionalName},role=${input.role},location=${input.location} where workspace_id=${w} and id=${professionalId}`;
   await tx`update f5.contacts set name=${input.professionalName},email=${input.professionalEmail},time_zone=${input.professionalTimeZone} where workspace_id=${w} and professional_id=${professionalId}`;
  }else{
   professionalId=randomUUID();
   await tx`insert into f5.professionals(workspace_id,id,name,role,location,cadence_anchor) values (${w},${professionalId},${input.professionalName},${input.role},${input.location},${input.startDate})`;
   await tx`insert into f5.contacts(workspace_id,id,name,side,professional_id,email,time_zone) values (${w},${randomUUID()},${input.professionalName},'professional',${professionalId},${input.professionalEmail},${input.professionalTimeZone})`;
  }
  const placementId=id??randomUUID();
  if(id){
   await tx`update f5.placements set owner_id=${input.ownerId},start_date=${input.startDate},trial_end=${input.trialEnd},status=${input.status},trial_decision=${input.trialDecision},version=version+1 where workspace_id=${w} and id=${id}`;
  }else{
   const [count]=await tx`select count(*)::int as total from f5.placements where workspace_id=${w}`;
   if(Number(count?.total)>=100)throw new DomainError('INVALID_RANGE','Workspace limit reached');
   await tx`insert into f5.placements(workspace_id,id,client_id,professional_id,owner_id,start_date,trial_end,status,trial_decision) values (${w},${placementId},${clientId},${professionalId},${input.ownerId},${input.startDate},${input.trialEnd},${input.status},${input.trialDecision})`;
  }
  await tx`insert into f5.activity(workspace_id,id,placement_id,actor_id,type,summary,details) values (${w},${randomUUID()},${placementId},${input.ownerId},${id?'placement_updated':'placement_created'},${id?'Placement details and contact records updated.':`${input.professionalName} joined the placement.`},${tx.json({key,previous:previous?{...previous}:null,next:{...input},version:id?Number(version)+1:1})})`;
  const result={id:placementId,version:id?Number(version)+1:1};
  await tx`insert into f5.mutation_receipts(workspace_id,key,request_hash,result) values (${w},${key},${hash},${tx.json(result)})`;
  return result;
 });
}
