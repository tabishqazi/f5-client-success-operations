import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { db, scoped } from '@/server/db';
import { createWorkspace, resolveSession, tokenHash, rateLimit, workspaceSummary } from '@/server/context';
import { seedWorkspace, resetWorkspace, seedId } from '@/server/seed';
import { listIssues, listPlacements, listPlacementsPage, getPlacement, savePlacement } from '@/server/placements';
import type { PlacementInput, PlacementRecord } from '@/domain/placement';
import { reconcileWorkspace } from '@/server/reconcile';
import { getQueue } from '@/server/queue';
import { addCalendarDays,dateInTimeZone,localDateTimeToInstant,routineDueAt,trialReviewDate } from '@/domain/clock';
import { createIssue,recordContactOutcome,updateIssue } from '@/server/mutations';
import { getClient, listClientsPage } from '@/server/clients';

const admin=postgres(process.env.TEST_DATABASE_URL!,{max:1,onnotice:()=>{}});
let a:Awaited<ReturnType<typeof createWorkspace>>;
let b:Awaited<ReturnType<typeof createWorkspace>>;
const date='2026-09-08';
function input(p:PlacementRecord):PlacementInput {
 return {clientId:p.client_id,clientVersion:p.client_version,professionalId:p.professional_id,ownerId:p.owner_id,
  clientName:p.client_name,clientContactName:p.client_contact_name,clientEmail:p.client_email,clientTimeZone:p.client_time_zone,
  professionalName:p.professional_name,role:p.role,location:p.location,professionalEmail:p.professional_email,professionalTimeZone:p.professional_time_zone,
  startDate:p.start_date,trialEnd:p.trial_end,status:p.status,trialDecision:p.trial_decision};
}
async function freshInput():Promise<PlacementInput>{
 const result=input((await listPlacements(a.workspaceId)).find(p=>p.status==='active')!);
 delete result.clientId;delete result.clientVersion;delete result.professionalId;
 return {...result,clientName:'Example Operations',professionalName:'Taylor Reed',startDate:'2026-08-01',trialEnd:'2026-08-31',trialDecision:'continue'};
}
beforeAll(async()=>{
 a=await createWorkspace(date);b=await createWorkspace(date);
},30000);
afterAll(async()=>{
 for(const workspace of [a,b])if(workspace)await admin`delete from f5.workspaces where id=${workspace.workspaceId}`;
 await db().end();await admin.end();
});

describe('real PostgreSQL persistence and isolation',()=>{
 test('runtime is not owner, superuser or RLS-bypass role',async()=>{
  const [role]=await db()`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
  expect(role).toMatchObject({rolsuper:false,rolbypassrls:false});
  const [table]=await db()`select tableowner=current_user as owns from pg_tables where schemaname='f5' and tablename='placements'`;
  expect(table?.owns).toBe(false);
 });
 test('seed has 30 placements, 12 shared clients, mixed status and date-only values',async()=>{
  expect(await workspaceSummary(a.workspaceId)).toEqual({placements:30,active:28,scheduled:1,ended:1});
  const rows=await listPlacements(a.workspaceId);
  expect(new Set(rows.map(p=>p.client_id)).size).toBe(12);
  expect(rows.every(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.start_date))).toBe(true);
  expect(rows.find(p=>p.professional_name==='Daniel Reyes')?.trial_end).toBe('2026-09-11');
 });
 test('placement pagination is stable, bounded and searches the full workspace',async()=>{
  const first=await listPlacementsPage(a.workspaceId,{page:1,pageSize:9});
  const second=await listPlacementsPage(a.workspaceId,{page:2,pageSize:9});
  expect(first).toMatchObject({total:30,page:1,pageSize:9,totalPages:4});
  expect(first.items).toHaveLength(9);expect(second.items).toHaveLength(9);
  expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(18);
  const match=await listPlacementsPage(a.workspaceId,{search:'Daniel Reyes',page:1,pageSize:9});
  expect(match.total).toBe(1);expect(match.items[0]?.professional_name).toBe('Daniel Reyes');
 });
 test('client pagination searches the complete workspace and client detail rejects foreign scope',async()=>{
  const first=await listClientsPage(a.workspaceId,{page:1,pageSize:9},'2026-09-08T14:00:00Z');
  const second=await listClientsPage(a.workspaceId,{page:2,pageSize:9},'2026-09-08T14:00:00Z');
  expect(first).toMatchObject({total:12,page:1,pageSize:9,totalPages:2});
  expect(first.items).toHaveLength(9);expect(second.items).toHaveLength(3);
  expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(12);
  const match=await listClientsPage(a.workspaceId,{search:'Daniel Reyes',page:1,pageSize:9},'2026-09-08T14:00:00Z');
  expect(match.total).toBe(1);expect(match.items[0]?.active_placements).toBeGreaterThan(0);
  await expect(getClient(b.workspaceId,match.items[0]!.id,'2026-09-08T14:00:00Z')).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 test('session survives repeated resolution and stores only a hash',async()=>{
  expect(await resolveSession(a.token)).toBe(a.workspaceId);
  expect(await resolveSession(a.token)).toBe(a.workspaceId);
  const [session]=await admin`select token_hash from f5.sessions where workspace_id=${a.workspaceId}`;
  expect(session?.token_hash).toBe(tokenHash(a.token));expect(session?.token_hash).not.toBe(a.token);
  await expect(resolveSession('invalid')).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 test('foreign reads and writes are rejected, including valid related IDs',async()=>{
  const foreign=(await listPlacements(b.workspaceId))[1]!;
  await expect(getPlacement(a.workspaceId,foreign.id)).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(savePlacement(a.workspaceId,input(foreign),randomUUID(),foreign.id,foreign.version)).rejects.toMatchObject({code:'NOT_FOUND'});
  const proposed=await freshInput();
  await expect(savePlacement(a.workspaceId,{...proposed,clientId:foreign.client_id},randomUUID())).rejects.toMatchObject({code:'NOT_FOUND'});
  const unchanged=await getPlacement(b.workspaceId,foreign.id);expect(unchanged.placement.version).toBe(1);
 });
 test('RLS denies unscoped reads and cross-scope writes; composite FK blocks foreign references',async()=>{
  expect(await db()`select id from f5.placements`).toHaveLength(0);
  await expect(scoped(a.workspaceId,tx=>tx`insert into f5.professionals(workspace_id,id,name,role,location,cadence_anchor) values (${b.workspaceId},${randomUUID()},'Foreign','Role','City','2026-01-01')`)).rejects.toMatchObject({code:'42501'});
  await expect(scoped(a.workspaceId,tx=>tx`insert into f5.clients(workspace_id,id,name,owner_id,cadence_anchor) values (${a.workspaceId},${randomUUID()},'Foreign owner',${seedId(b.workspaceId,'manager')},'2026-01-01')`)).rejects.toMatchObject({code:'23503'});
  expect(await db()`select id from f5.placements`).toHaveLength(0);
 });
 test('simultaneous create retries persist exactly one placement and activity',async()=>{
  const data=await freshInput(),key=randomUUID();
  const results=await Promise.all([savePlacement(a.workspaceId,data,key),savePlacement(a.workspaceId,data,key)]);
  expect(results[0]).toEqual(results[1]);
  const detail=await getPlacement(a.workspaceId,results[0]!.id);
  expect(detail.placement.professional_name).toBe(data.professionalName);expect(detail.activity).toHaveLength(1);
  expect((await workspaceSummary(a.workspaceId))?.placements).toBe(31);
  await expect(savePlacement(a.workspaceId,{...data,role:'Different role'},key)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 });
 test('edits persist and simultaneous competing edits cannot silently overwrite',async()=>{
  const p=(await getPlacement(a.workspaceId,seedId(a.workspaceId,'placement-0'))).placement;
  const changes={...input(p),professionalName:'Daniel Updated',clientContactName:'Maya Updated'};
  const attempts=await Promise.allSettled([
   savePlacement(a.workspaceId,changes,randomUUID(),p.id,p.version),
   savePlacement(a.workspaceId,{...changes,professionalName:'Competing edit'},randomUUID(),p.id,p.version),
  ]);
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(attempts.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}});
  const saved=await getPlacement(a.workspaceId,p.id);expect(saved.placement.version).toBe(2);
  expect(saved.placement.client_contact_name).toBe('Maya Updated');expect(saved.activity).toHaveLength(2);
  const other=await getPlacement(a.workspaceId,seedId(a.workspaceId,'placement-12'));
  expect(other.placement.client_contact_name).toBe('Maya Updated');
  await expect(savePlacement(a.workspaceId,{...input(other.placement),clientVersion:1},randomUUID(),other.placement.id,other.placement.version)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 });
 test('failure rolls back new client/contact rows and leaves no receipt',async()=>{
  const [before]=await scoped(a.workspaceId,tx=>tx`select count(*)::int n from f5.clients`);
  const key=randomUUID();
  await expect(savePlacement(a.workspaceId,{...await freshInput(),professionalId:randomUUID()},key)).rejects.toMatchObject({code:'INVALID_RANGE'});
  const [after]=await scoped(a.workspaceId,tx=>tx`select count(*)::int n from f5.clients`);
  expect(after?.n).toBe(before?.n);
  expect(await scoped(a.workspaceId,tx=>tx`select key from f5.mutation_receipts where key=${key}`)).toHaveLength(0);
 });
 test('database uniqueness preserves an obligation occurrence',async()=>{
  await expect(scoped(a.workspaceId,tx=>tx`insert into f5.obligations(workspace_id,id,type,placement_id,contact_id,occurrence_key,policy_version,due_at)
   select workspace_id,${randomUUID()},type,placement_id,contact_id,occurrence_key,policy_version,due_at from f5.obligations where id=${seedId(a.workspaceId,'missing-feedback')}`)).rejects.toMatchObject({code:'23505'});
 });
 test('concurrent reconciliation creates one record per occurrence and every schedule family',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  await scoped(a.workspaceId,async tx=>{await tx`update f5.obligations set state='open',state_reason=null,satisfied_at=null where id=${seedId(a.workspaceId,'completed-professional-monthly-2')}`;await tx`update f5.workspaces set seed_version='v1' where id=${a.workspaceId}`;});
  await Promise.all([reconcileWorkspace(a.workspaceId,date),reconcileWorkspace(a.workspaceId,date),reconcileWorkspace(a.workspaceId,date)]);
  const [upgraded]=await scoped(a.workspaceId,tx=>tx`select w.seed_version,o.state from f5.workspaces w join f5.obligations o on o.workspace_id=w.id and o.id=${seedId(a.workspaceId,'completed-professional-monthly-2')} where w.id=${a.workspaceId}`);
  expect(upgraded).toMatchObject({seed_version:'v2',state:'satisfied'});
  const rows=await scoped(a.workspaceId,tx=>tx`select type,count(*)::int total,count(distinct occurrence_key)::int unique_total from f5.obligations group by type order by type`);
  expect(rows.every(row=>row.total===row.unique_total)).toBe(true);
  expect(rows.map(row=>row.type)).toEqual(expect.arrayContaining(['trial_review','client_feedback','client_monthly','professional_monthly','issue_triage','corrective_action','verification','senior_review']));
  const before=rows.reduce((total,row)=>total+Number(row.total),0);
  await reconcileWorkspace(a.workspaceId,date);
  const [after]=await scoped(a.workspaceId,tx=>tx`select count(*)::int total from f5.obligations`);
  expect(after?.total).toBe(before);
 });
 test('queue ranks recorded retention risk first and keeps trial and monthly reasons separate',async()=>{
  const queue=await getQueue(a.workspaceId,'2026-09-08T14:00:00Z',date,'today');
  expect(queue.cards[0]?.priority).toBe('P0');
  expect(queue.cards).toContainEqual(expect.objectContaining({contactName:'Jordan Lee',priority:'P0'}));
  const northstar=queue.cards.find(card=>card.contactName==='Maya Chen');
  expect(northstar?.priority).toBe('P1');
  expect(northstar?.reasons.some(reason=>reason.text.includes('trial decision'))).toBe(true);
  expect(queue.cards.some(card=>card.contactSide==='professional'&&card.reasons.some(reason=>reason.type==='professional_monthly'))).toBe(true);
 expect(queue.cards.some(card=>card.contactSide==='client'&&card.reasons.some(reason=>reason.type==='client_monthly'))).toBe(true);
 });
 test('editing a contractual date supersedes the old review and creates the new occurrence',async()=>{
  const detail=await getPlacement(a.workspaceId,seedId(a.workspaceId,'placement-0'));
  const oldEnd=detail.placement.trial_end;
  const nextEnd=addCalendarDays(oldEnd,5);
  await savePlacement(a.workspaceId,{...input(detail.placement),trialEnd:nextEnd},randomUUID(),detail.placement.id,detail.placement.version);
  await reconcileWorkspace(a.workspaceId,date);
  const rows=await scoped(a.workspaceId,tx=>tx`select state,occurrence_key from f5.obligations where placement_id=${detail.placement.id} and type='trial_review' order by occurrence_key`);
  expect(rows.filter(row=>row.state==='open')).toHaveLength(1);
  expect(rows.find(row=>row.state==='open')?.occurrence_key).toContain(trialReviewDate(detail.placement.start_date,nextEnd));
  expect(rows.some(row=>row.state==='superseded'&&row.occurrence_key.includes(trialReviewDate(detail.placement.start_date,oldEnd)))).toBe(true);
 });
 test('advancing the operating date catches up once without duplicating older obligations',async()=>{
  const [before]=await scoped(a.workspaceId,tx=>tx`select count(*)::int total from f5.obligations`);
  const tomorrow=addCalendarDays(date,1);
  await Promise.all([reconcileWorkspace(a.workspaceId,tomorrow),reconcileWorkspace(a.workspaceId,tomorrow)]);
  const [after]=await scoped(a.workspaceId,tx=>tx`select count(*)::int total,count(distinct (type,occurrence_key))::int unique_total from f5.obligations`);
  expect(after?.total).toBeGreaterThanOrEqual(before?.total);expect(after?.unique_total).toBe(after?.total);
  const upcoming=await getQueue(a.workspaceId,'2026-09-09T14:00:00Z',tomorrow,'upcoming');
  expect(upcoming.cards.length).toBeGreaterThan(0);
 });
 test('outbound no-answer attempts start one feedback clock and never satisfy the work',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await reconcileWorkspace(a.workspaceId,date);
  const [work]=await scoped(a.workspaceId,tx=>tx`select o.id,o.contact_id from f5.obligations o left join f5.feedback_requests r on r.workspace_id=o.workspace_id and r.obligation_id=o.id where o.type='client_feedback' and o.state='open' and o.due_at<${routineDueAt(date)} and r.id is null order by o.due_at limit 1`);
  expect(work).toBeTruthy();if(!work)throw new Error('Expected overdue feedback work');
  const times=['2026-09-08T14:00:00Z','2026-09-09T14:00:00Z','2026-09-10T14:00:00Z'];
  for(const occurredAt of times)await recordContactOutcome(a.workspaceId,{contactId:work.contact_id,direction:'outbound',channel:'phone',outcome:'no_answer',notes:'Called for scheduled client feedback; no answer.',obligationIds:[work.id],feedback:[]},randomUUID(),occurredAt);
  const [result]=await scoped(a.workspaceId,tx=>tx`select o.state,r.first_requested_at,(select count(*)::int from f5.interactions i where i.contact_id=o.contact_id and i.notes like 'Called for scheduled%') attempts from f5.obligations o join f5.feedback_requests r on r.workspace_id=o.workspace_id and r.obligation_id=o.id where o.id=${work.id}`);
  expect(result).toBeTruthy();if(!result)throw new Error('Expected feedback request result');expect(result.state).toBe('open');expect(new Date(result.first_requested_at).toISOString()).toBe(new Date(times[0]!).toISOString());expect(result.attempts).toBe(3);
 });
 test('an inbound client check-in completes only the selected monthly obligation',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await reconcileWorkspace(a.workspaceId,date);
  const [clientWork]=await scoped(a.workspaceId,tx=>tx`select id,contact_id from f5.obligations where type='client_monthly' and state='open' order by due_at limit 1`);
  const [professionalWork]=await scoped(a.workspaceId,tx=>tx`select id from f5.obligations where type='professional_monthly' and state='open' order by due_at limit 1`);
  if(!clientWork||!professionalWork)throw new Error('Expected independent monthly work');
  await recordContactOutcome(a.workspaceId,{contactId:clientWork.contact_id,direction:'inbound',channel:'phone',outcome:'reached',notes:'Client called and completed the monthly relationship review.',obligationIds:[clientWork.id],feedback:[]},randomUUID(),'2026-09-08T14:00:00Z');
  const rows=await scoped(a.workspaceId,tx=>tx`select id,state from f5.obligations where id in ${tx([clientWork.id,professionalWork.id])}`);
  expect(rows.find(row=>row.id===clientWork.id)?.state).toBe('satisfied');expect(rows.find(row=>row.id===professionalWork.id)?.state).toBe('open');
 });
 test('client-only monthly contact remains visible in the complete client history',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await reconcileWorkspace(a.workspaceId,date);
  const [monthly]=await scoped(a.workspaceId,tx=>tx`select ob.id,ob.client_id,ob.contact_id from f5.obligations ob where ob.type='client_monthly' and ob.state='open' order by ob.due_at limit 1`);
  if(!monthly)throw new Error('Expected client monthly work');
  const note='Completed the client relationship review and confirmed the next monthly cadence.';
  const result=await recordContactOutcome(a.workspaceId,{contactId:monthly.contact_id,direction:'inbound',channel:'phone',outcome:'reached',notes:note,obligationIds:[monthly.id],feedback:[]},randomUUID(),'2026-09-08T15:00:00Z');
  const detail=await getClient(a.workspaceId,monthly.client_id,'2026-09-08T15:05:00Z');
  expect(detail.interactions.find(interaction=>interaction.id===result.interactionId)).toMatchObject({notes:note,outcome:'reached',professionals:[]});
  expect(detail.obligations.some(obligation=>obligation.id===monthly.id)).toBe(false);
 });
 test('urgent work remains in Today after a confirmed five-business-day follow-up',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await reconcileWorkspace(a.workspaceId,date);
  const before=await getQueue(a.workspaceId,'2026-09-08T14:00:00Z',date,'today');
  const urgent=before.cards.find(card=>card.priority==='P1'&&card.reasons.some(reason=>reason.type==='client_feedback'));
  if(!urgent)throw new Error('Expected urgent client feedback');
  const reason=urgent.reasons.find(item=>item.type==='client_feedback')!;
  await recordContactOutcome(a.workspaceId,{contactId:urgent.contactId,direction:'outbound',channel:'phone',outcome:'rescheduled',notes:'The client confirmed a follow-up in five business days.',obligationIds:[reason.obligationId],rescheduleDate:'2026-09-15',feedback:[]},randomUUID(),'2026-09-08T14:00:00Z');
  const after=await getQueue(a.workspaceId,'2026-09-08T14:05:00Z',date,'today');
  expect(after.cards.some(card=>card.priority==='P1'&&card.reasons.some(item=>item.obligationId===reason.obligationId))).toBe(true);
  const [stored]=await scoped(a.workspaceId,tx=>tx`select due_at,next_contact_at from f5.obligations where id=${reason.obligationId}`);
  if(!stored)throw new Error('Expected rescheduled obligation');
  expect(new Date(stored.next_contact_at).toISOString()).toBe(new Date(routineDueAt('2026-09-15')).toISOString());
  expect(new Date(stored.due_at).toISOString()).toBe(new Date(reason.dueAt).toISOString());
 });
 test('one client conversation covers chosen placements and leaves the third feedback item open',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  const placements=await scoped(a.workspaceId,tx=>tx`select p.id,p.professional_id,ct.id contact_id from f5.placements p join f5.contacts ct on ct.workspace_id=p.workspace_id and ct.client_id=p.client_id where p.client_id=${seedId(a.workspaceId,'client-0')} and p.status='active' order by p.id`);
  expect(placements).toHaveLength(3);const [firstPlacement,secondPlacement,thirdPlacement]=placements;if(!firstPlacement||!secondPlacement||!thirdPlacement)throw new Error('Expected three client placements');const contactId=firstPlacement.contact_id;const firstId=randomUUID(),secondId=randomUUID(),thirdId=randomUUID(),monthlyId=randomUUID();
  const custom=[{id:firstId,placement:firstPlacement},{id:secondId,placement:secondPlacement},{id:thirdId,placement:thirdPlacement}];
  await scoped(a.workspaceId,async tx=>{for(let index=0;index<custom.length;index++){const item=custom[index]!;await tx`insert into f5.obligations(workspace_id,id,type,placement_id,contact_id,occurrence_key,policy_version,due_at) values (${a.workspaceId},${item.id},'client_feedback',${item.placement.id},${contactId},${`test:feedback:${index}`},'v1',${routineDueAt(date)})`;}await tx`insert into f5.obligations(workspace_id,id,type,client_id,contact_id,occurrence_key,policy_version,due_at) values (${a.workspaceId},${monthlyId},'client_monthly',${seedId(a.workspaceId,'client-0')},${contactId},'test:client-monthly','v1',${routineDueAt(date)})`;});
  const before=await scoped(a.workspaceId,tx=>tx`select id,state from f5.issues order by id`);
  const key=randomUUID();const payload={contactId,direction:'outbound',channel:'meeting',outcome:'reached',notes:'Reviewed the relationship and two current placements.',obligationIds:[firstId,secondId,monthlyId],feedback:[{placementId:firstPlacement.id,assessment:'satisfied',rating:5,notes:'Delivery and communication are both strong.'},{placementId:secondPlacement.id,assessment:'satisfied',rating:4,notes:'The client is satisfied with current progress.'}]};
  const first=await recordContactOutcome(a.workspaceId,payload,key,'2026-09-08T15:00:00Z');const retry=await recordContactOutcome(a.workspaceId,payload,key,'2026-09-08T15:00:00Z');expect(retry).toEqual(first);
  const states=await scoped(a.workspaceId,tx=>tx`select id,state from f5.obligations where id=${firstId} or id=${secondId} or id=${thirdId} or id=${monthlyId}`);
  expect(states.filter(row=>row.state==='satisfied')).toHaveLength(3);expect(states.find(row=>row.id===thirdId)?.state).toBe('open');
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.feedback_responses where id in (select feedback_id from f5.interaction_coverage where interaction_id=${first.interactionId})`)).toHaveLength(2);
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.interactions where id=${first.interactionId}`)).toHaveLength(1);
  expect(await scoped(a.workspaceId,tx=>tx`select id,state from f5.issues order by id`)).toEqual(before);
 });
 test('neutral feedback creates clarification triage atomically and rescheduling retains the original deadline',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await reconcileWorkspace(a.workspaceId,date);
  const [feedbackWork]=await scoped(a.workspaceId,tx=>tx`select id,contact_id,placement_id from f5.obligations where type='client_feedback' and state='open' order by due_at limit 1`);
  if(!feedbackWork)throw new Error('Expected feedback work');
  await recordContactOutcome(a.workspaceId,{contactId:feedbackWork.contact_id,direction:'inbound',channel:'phone',outcome:'reached',notes:'Client provided a neutral delivery rating.',obligationIds:[feedbackWork.id],feedback:[{placementId:feedbackWork.placement_id,assessment:'satisfied',rating:3,notes:'The last deliverable needed additional quality review.'}]},randomUUID(),'2026-09-08T14:00:00Z');
  const [issue]=await scoped(a.workspaceId,tx=>tx`select state,description from f5.issues where placement_id=${feedbackWork.placement_id} and description='The last deliverable needed additional quality review.'`);
  expect(issue).toMatchObject({state:'open'});expect((await getQueue(a.workspaceId,'2026-09-08T15:00:00Z',date,'today')).cards.some(card=>card.reasons.some(reason=>reason.type==='issue_triage'))).toBe(true);
  const [monthly]=await scoped(a.workspaceId,tx=>tx`select id,contact_id,due_at from f5.obligations where type='professional_monthly' and state='open' order by due_at limit 1`);
  if(!monthly)throw new Error('Expected professional monthly work');
  const original=new Date(monthly.due_at).toISOString();const movedDate=addCalendarDays(date,1);
  await recordContactOutcome(a.workspaceId,{contactId:monthly.contact_id,direction:'outbound',channel:'phone',outcome:'rescheduled',notes:'Professional requested tomorrow after their shift.',obligationIds:[monthly.id],rescheduleDate:movedDate,feedback:[]},randomUUID(),'2026-09-08T14:00:00Z');
  const [moved]=await scoped(a.workspaceId,tx=>tx`select state,due_at,next_contact_at,state_reason from f5.obligations where id=${monthly.id}`);
  if(!moved)throw new Error('Expected rescheduled work');expect(moved.state).toBe('open');expect(new Date(moved.due_at).toISOString()).toBe(original);expect(new Date(moved.next_contact_at).toISOString()).toBe(new Date(localDateTimeToInstant(movedDate,'17:00')).toISOString());expect(moved.state_reason).toContain('Professional requested');
 });
 test('client issue remains monitoring through two evidenced observation windows before verified closure',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  const placementId=seedId(a.workspaceId,'placement-7');
  const created=await createIssue(a.workspaceId,{placementId,reporterSide:'client',category:'performance',severity:'high',description:'Two scheduled deliverables missed the agreed review date.',escalationTrigger:'none'},randomUUID(),'2026-09-08T14:00:00Z');
  await expect(updateIssue(a.workspaceId,created.id,{type:'report_fix',version:created.version,evidence:'A claimed fix without an agreed action.'},randomUUID(),'2026-09-08T14:30:00Z')).rejects.toMatchObject({code:'INVALID_TRANSITION'});
  const action=await updateIssue(a.workspaceId,created.id,{type:'agree_action',version:created.version,actionOwner:'Aarav Joshi',agreedAction:'Submit work one business day before the client deadline.',verificationCriteria:'The next two deliverables reach the client review queue on time.',targetDate:'2026-09-09'},randomUUID(),'2026-09-08T15:00:00Z');
  const fixed=await updateIssue(a.workspaceId,created.id,{type:'report_fix',version:action.version,evidence:'A shared deadline tracker and earlier internal review are now active.'},randomUUID(),'2026-09-09T14:00:00Z');
  expect(fixed.state).toBe('monitoring');
  const checks=await scoped(a.workspaceId,tx=>tx`select id,window_name,due_at from f5.verifications where issue_id=${created.id} order by due_at`);
  expect(checks).toHaveLength(2);const [initial,sustained]=checks;if(!initial||!sustained)throw new Error('Expected both verification windows');
  await expect(updateIssue(a.workspaceId,created.id,{type:'record_verification',version:fixed.version,verificationId:initial.id,result:'pass',confirmerSide:'client',evidence:'Attempted too early.'},randomUUID(),'2026-09-10T14:00:00Z')).rejects.toMatchObject({code:'INVALID_TRANSITION'});
  const initialAt=new Date(initial.due_at).toISOString();await reconcileWorkspace(a.workspaceId,dateInTimeZone(initialAt));
  expect((await getQueue(a.workspaceId,initialAt,dateInTimeZone(initialAt),'today')).cards.some(card=>card.reasons.some(reason=>reason.type==='verification'))).toBe(true);
  const inconclusive=await updateIssue(a.workspaceId,created.id,{type:'record_verification',version:fixed.version,verificationId:initial.id,result:'inconclusive',confirmerSide:'client',evidence:'The client had reviewed only one deliverable so far.'},randomUUID(),initialAt);
  const [stillOpen]=await scoped(a.workspaceId,tx=>tx`select v.result,o.state,o.next_contact_at from f5.verifications v join f5.obligations o on o.workspace_id=v.workspace_id and o.issue_id=v.issue_id and o.occurrence_key=${`issue:${created.id}:cycle:1:verification:initial`} where v.id=${initial.id}`);
  expect(stillOpen).toMatchObject({result:null,state:'open'});expect(stillOpen?.next_contact_at).toBeTruthy();
  const initialPassed=await updateIssue(a.workspaceId,created.id,{type:'record_verification',version:inconclusive.version,verificationId:initial.id,result:'pass',confirmerSide:'client',evidence:'The client confirmed the first two tracked deadlines were met.'},randomUUID(),new Date(new Date(initialAt).getTime()+60_000).toISOString());
  expect(initialPassed.state).toBe('monitoring');const sustainedAt=new Date(sustained.due_at).toISOString();
  await expect(updateIssue(a.workspaceId,created.id,{type:'record_verification',version:initialPassed.version,verificationId:sustained.id,result:'pass',confirmerSide:'professional',evidence:'Professional confirmed the process remained active.'},randomUUID(),sustainedAt)).rejects.toMatchObject({code:'EVIDENCE_REQUIRED'});
  const closed=await updateIssue(a.workspaceId,created.id,{type:'record_verification',version:initialPassed.version,verificationId:sustained.id,result:'pass',confirmerSide:'client',evidence:'The client confirmed both observation periods passed without another missed deadline.'},randomUUID(),sustainedAt);
  expect(closed.state).toBe('verified_closed');
  const listed=(await listIssues(a.workspaceId)).find(issue=>issue.id===created.id);expect(listed).toMatchObject({state:'verified_closed',closure_evidence:'The client confirmed both observation periods passed without another missed deadline.'});
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.verification_attempts where verification_id=${initial.id}`)).toHaveLength(2);
 });
 test('failed professional verification reopens one new cycle and concurrent fix reports create one check pair',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  const created=await createIssue(a.workspaceId,{placementId:seedId(a.workspaceId,'placement-8'),reporterSide:'professional',category:'attendance',severity:'normal',description:'Connectivity interrupted two shift starts.',escalationTrigger:'none'},randomUUID(),'2026-09-08T14:00:00Z');
  const action=await updateIssue(a.workspaceId,created.id,{type:'agree_action',version:created.version,actionOwner:'Sofia Garcia',agreedAction:'Use a wired backup connection before each shift.',verificationCriteria:'Every scheduled shift starts on time.',targetDate:'2026-09-09'},randomUUID(),'2026-09-08T15:00:00Z');
  const command={type:'report_fix',version:action.version,evidence:'The backup connection was installed and tested.'};const firstKey=randomUUID(),secondKey=randomUUID();
  const concurrent=await Promise.allSettled([updateIssue(a.workspaceId,created.id,command,firstKey,'2026-09-09T14:00:00Z'),updateIssue(a.workspaceId,created.id,command,secondKey,'2026-09-09T14:00:00Z')]);
  expect(concurrent.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(concurrent.filter(result=>result.status==='rejected')).toHaveLength(1);
  const successful=concurrent.find(result=>result.status==='fulfilled');if(!successful||successful.status!=='fulfilled')throw new Error('Expected one successful fix report');
  expect(await updateIssue(a.workspaceId,created.id,command,firstKey,'2026-09-09T14:00:00Z').catch(()=>updateIssue(a.workspaceId,created.id,command,secondKey,'2026-09-09T14:00:00Z'))).toEqual(successful.value);
  const [initial]=await scoped(a.workspaceId,tx=>tx`select id,due_at from f5.verifications where issue_id=${created.id} and fix_cycle=1 and window_name='initial'`);if(!initial)throw new Error('Expected initial check');
  const reopened=await updateIssue(a.workspaceId,created.id,{type:'record_verification',version:successful.value.version,verificationId:initial.id,result:'fail',confirmerSide:'professional',evidence:'Another scheduled shift began late after the backup failed.'},randomUUID(),new Date(initial.due_at).toISOString());
  expect(reopened).toMatchObject({state:'reopened'});
  const afterFailure=await scoped(a.workspaceId,tx=>tx`select id,state,fix_cycle from f5.issues where id=${created.id}`);expect(afterFailure[0]).toMatchObject({state:'reopened',fix_cycle:2});
  const oldChecks=await scoped(a.workspaceId,tx=>tx`select window_name,result,canceled_reason from f5.verifications where issue_id=${created.id} and fix_cycle=1 order by window_name`);
  expect(oldChecks.find(check=>check.window_name==='initial')?.result).toBe('fail');expect(oldChecks.find(check=>check.window_name==='sustained')?.canceled_reason).toContain('new corrective-action cycle');
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.escalations where issue_id=${created.id} and fix_cycle=2 and reason='failed_intervention'`)).toHaveLength(1);
  const nextAction=await updateIssue(a.workspaceId,created.id,{type:'agree_action',version:reopened.version,actionOwner:'Sofia Garcia',agreedAction:'Move the shift workstation to a stable wired network.',verificationCriteria:'All shifts start on time across both new windows.',targetDate:'2026-09-16'},randomUUID(),'2026-09-15T14:00:00Z');
  await updateIssue(a.workspaceId,created.id,{type:'report_fix',version:nextAction.version,evidence:'The workstation is now connected to the stable wired network.'},randomUUID(),'2026-09-16T14:00:00Z');
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.verifications where issue_id=${created.id}`)).toHaveLength(4);
  expect(await scoped(a.workspaceId,tx=>tx`select fix_cycle from f5.issue_actions where issue_id=${created.id} order by fix_cycle`)).toEqual([{fix_cycle:1},{fix_cycle:2}]);
 });
 test('retention escalation is deduplicated, ranks P0 and acknowledgment or decision never closes the issue',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await reconcileWorkspace(a.workspaceId,date);
  const placementId=seedId(a.workspaceId,'placement-0');const beforeRoutine=await scoped(a.workspaceId,tx=>tx`select count(*)::int total from f5.obligations where placement_id=${placementId} and type in ('client_feedback','professional_monthly') and state='open'`);
  const key=randomUUID(),input={placementId,reporterSide:'client',category:'client_relationship',severity:'critical',description:'The client requested an immediate replacement after missed commitments.',escalationTrigger:'retention_threat'};
  const created=await createIssue(a.workspaceId,input,key,'2026-09-08T14:00:00Z');expect(await createIssue(a.workspaceId,input,key,'2026-09-08T14:00:00Z')).toEqual(created);
  await reconcileWorkspace(a.workspaceId,date);await reconcileWorkspace(a.workspaceId,date);
  const escalations=await scoped(a.workspaceId,tx=>tx`select * from f5.escalations where issue_id=${created.id}`);expect(escalations).toHaveLength(1);const escalation=escalations[0]!;
  const queue=await getQueue(a.workspaceId,'2026-09-08T15:00:00Z',date,'today');expect(queue.cards.some(card=>card.priority==='P0'&&card.reasons.some(reason=>reason.type==='senior_review'))).toBe(true);
  expect(await scoped(a.workspaceId,tx=>tx`select count(*)::int total from f5.obligations where placement_id=${placementId} and type in ('client_feedback','professional_monthly') and state='open'`)).toEqual(beforeRoutine);
  const action=await updateIssue(a.workspaceId,created.id,{type:'agree_action',version:created.version,actionOwner:'Daniel Reyes',agreedAction:'Maintain delivery while the replacement plan is reviewed.',verificationCriteria:'No additional missed commitment during both observation windows.',targetDate:'2026-09-09'},randomUUID(),'2026-09-08T15:05:00Z');
  const fixed=await updateIssue(a.workspaceId,created.id,{type:'report_fix',version:action.version,evidence:'A daily delivery checkpoint is active while senior review continues.'},randomUUID(),'2026-09-09T14:00:00Z');await reconcileWorkspace(a.workspaceId,'2026-09-09');
  const acknowledged=await updateIssue(a.workspaceId,created.id,{type:'acknowledge_escalation',version:fixed.version,escalationId:escalation.id,escalationVersion:escalation.version},randomUUID(),'2026-09-09T15:30:00Z');
  expect((await scoped(a.workspaceId,tx=>tx`select state from f5.issues where id=${created.id}`))[0]?.state).toBe('monitoring');
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.obligations where issue_id=${created.id} and type='verification' and state='open'`)).toHaveLength(2);
  const [ack]=await scoped(a.workspaceId,tx=>tx`select * from f5.escalations where id=${escalation.id}`);if(!ack)throw new Error('Expected acknowledged senior review');expect(ack.state).toBe('acknowledged');
  await updateIssue(a.workspaceId,created.id,{type:'record_senior_decision',version:acknowledged.version,escalationId:escalation.id,escalationVersion:ack.version,decision:'Proceed with a managed replacement while stabilizing service.',followUpOwner:'Alex Morgan',followUpAction:'Share the transition plan with the client by end of day.'},randomUUID(),'2026-09-09T16:00:00Z');
  const [finalIssue]=await scoped(a.workspaceId,tx=>tx`select state from f5.issues where id=${created.id}`);const [finalEscalation]=await scoped(a.workspaceId,tx=>tx`select state,follow_up_owner,follow_up_action from f5.escalations where id=${escalation.id}`);
  expect(finalIssue?.state).toBe('monitoring');expect(finalEscalation).toMatchObject({state:'decision_recorded',follow_up_owner:'Alex Morgan'});expect(finalEscalation?.follow_up_action).toContain('transition plan');
  expect((await scoped(a.workspaceId,tx=>tx`select state from f5.obligations where issue_id=${created.id} and type='senior_review'`))[0]?.state).toBe('satisfied');
  expect(await scoped(a.workspaceId,tx=>tx`select id from f5.obligations where issue_id=${created.id} and type='verification' and state='open'`)).toHaveLength(2);
 });
 test('overdue corrective action creates one senior review after the policy threshold',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  const created=await createIssue(a.workspaceId,{placementId:seedId(a.workspaceId,'placement-9'),reporterSide:'client',category:'communication',severity:'normal',description:'Daily delivery updates have not been sent consistently.',escalationTrigger:'none'},randomUUID(),'2026-09-08T13:00:00Z');
  await updateIssue(a.workspaceId,created.id,{type:'agree_action',version:created.version,actionOwner:'Neha Desai',agreedAction:'Send a written update before the client workday ends.',verificationCriteria:'Updates arrive on each scheduled workday.',targetDate:'2026-09-08'},randomUUID(),'2026-09-08T14:00:00Z');
  await reconcileWorkspace(a.workspaceId,'2026-09-09');expect(await scoped(a.workspaceId,tx=>tx`select id from f5.escalations where issue_id=${created.id} and reason='action_overdue'`)).toHaveLength(0);
  await reconcileWorkspace(a.workspaceId,'2026-09-10');await reconcileWorkspace(a.workspaceId,'2026-09-10');expect(await scoped(a.workspaceId,tx=>tx`select id from f5.escalations where issue_id=${created.id} and reason='action_overdue'`)).toHaveLength(1);
 });
 test('issue commands reject valid record identifiers from another workspace',async()=>{
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));await scoped(b.workspaceId,tx=>resetWorkspace(tx,b.workspaceId,date));
  const foreignPlacement=seedId(b.workspaceId,'placement-10');
  await expect(createIssue(a.workspaceId,{placementId:foreignPlacement,reporterSide:'client',category:'other',severity:'normal',description:'This relationship belongs to another workspace.',escalationTrigger:'none'},randomUUID(),'2026-09-08T14:00:00Z')).rejects.toMatchObject({code:'NOT_FOUND'});
  const own=await createIssue(a.workspaceId,{placementId:seedId(a.workspaceId,'placement-10'),reporterSide:'professional',category:'professional_concern',severity:'normal',description:'The professional requested a change to the working arrangement.',escalationTrigger:'none'},randomUUID(),'2026-09-08T14:00:00Z');
  await expect(updateIssue(b.workspaceId,own.id,{type:'agree_action',version:own.version,actionOwner:'Owner',agreedAction:'Review the working arrangement.',verificationCriteria:'The professional confirms the arrangement works.',targetDate:'2026-09-09'},randomUUID(),'2026-09-08T15:00:00Z')).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 test('repeat seed and scoped reset preserve counts, restore scenario IDs, and retain the other workspace',async()=>{
  await scoped(a.workspaceId,tx=>seedWorkspace(tx,a.workspaceId,date));
  expect((await workspaceSummary(a.workspaceId))?.placements).toBe(30);
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  await scoped(a.workspaceId,tx=>resetWorkspace(tx,a.workspaceId,date));
  expect(await workspaceSummary(a.workspaceId)).toEqual({placements:30,active:28,scheduled:1,ended:1});
  expect((await getPlacement(a.workspaceId,seedId(a.workspaceId,'placement-0'))).placement.professional_name).toBe('Daniel Reyes');
  expect((await workspaceSummary(b.workspaceId))?.placements).toBe(30);
  const counts=await scoped(a.workspaceId,tx=>tx`select (select count(*)::int from f5.contacts) contacts,(select count(*)::int from f5.professionals) professionals,(select count(*)::int from f5.activity) activity`);
  expect(counts[0]).toMatchObject({contacts:43,professionals:30,activity:30});
 });
 test('expired authorization keeps workspace records and refuses further access',async()=>{
  await admin`update f5.sessions set expires_at=now()-interval '1 second' where workspace_id=${b.workspaceId}`;
  await expect(resolveSession(b.token)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await admin`select id from f5.workspaces where id=${b.workspaceId}`)).toHaveLength(1);
  expect((await workspaceSummary(b.workspaceId))?.placements).toBe(30);
 });
 test('persistent rate limits permit the budget and reject excess',async()=>{
  const bucket=`test:${randomUUID()}`;
  try{await rateLimit(bucket,2,60);await rateLimit(bucket,2,60);await expect(rateLimit(bucket,2,60)).rejects.toMatchObject({code:'RATE_LIMITED'});}
  finally{await admin`delete from f5.rate_limits where bucket=${bucket}`;}
 });
});
