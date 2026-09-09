import 'server-only';
import { createHash } from 'node:crypto';
import type { Tx } from './db';
import { addCalendarDays, addBusinessDays, localDateTimeToInstant, verificationDeadlines, responseDeadline, routineDueAt } from '@/domain/clock';
import { monthlyOccurrences } from '@/domain/evaluate';
import { POLICY } from '@/domain/policy';

export function seedId(workspaceId:string, key:string):string {
 const h=createHash('sha256').update(`${workspaceId}:${key}`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
const clients=['Northstar Construction','Cedar Accounting','Harbor Health','Atlas Design','Maple Insurance','Summit Software','Brookline Logistics','Clearview Retail','Pioneer Engineering','Oakridge Property','Bluebird Support','Riverbend Media'];
const contacts=['Maya Chen','Olivia Brooks','Noah Williams','Emma Sullivan','Ethan Parker','Sophia Martinez','Liam Foster','Ava Bennett','James Reed','Charlotte Morgan','Lucas Hayes','Amelia Scott'];
const names=['Daniel Reyes','Priya Shah','Miguel Santos','Ananya Rao','Arjun Patel','Isabella Cruz','Rohan Mehta','Aarav Joshi','Sofia Garcia','Neha Desai','Kabir Singh','Marco Rivera','Ishaan Nair','Kavya Iyer','Camila Flores','Aditya Kulkarni','Meera Kapoor','Rafael Mendoza','Vikram Shah','Diya Verma','Elena Ramos','Nikhil Jain','Sana Khan','Gabriel Torres','Rahul Menon','Tara Sethi','Lucia Diaz','Dev Sharma','Asha Bhat','Paolo Aquino'];
const roles=['Construction Estimator','Bookkeeper','Client Support Specialist','CAD Designer','Operations Coordinator','Software Engineer'];

export async function seedWorkspace(tx:Tx,w:string,asOf:string) {
 const [workspace]=await tx`select seed_version from f5.workspaces where id=${w} for update`;
 if (!workspace) throw new Error('Workspace missing');
 if (workspace.seed_version) return;
 const id=(key:string)=>seedId(w,key);
 const day=(offset:number)=>addCalendarDays(asOf,offset);
 const at=(offset:number)=>localDateTimeToInstant(day(offset),'10:00');
 const manager=id('manager'),senior=id('senior');
 await tx`insert into f5.operators ${tx([{workspace_id:w,id:manager,name:'Alex Morgan',role:'manager'},{workspace_id:w,id:senior,name:'Jordan Lee',role:'senior'}])}`;
 await tx`insert into f5.clients ${tx(clients.map((name,i)=>({workspace_id:w,id:id(`client-${i}`),name,owner_id:manager,cadence_anchor:day(-210-i*3)})))}`;
 await tx`insert into f5.contacts ${tx(clients.map((_,i)=>({workspace_id:w,id:id(`client-contact-${i}`),name:contacts[i]!,side:'client',client_id:id(`client-${i}`),email:`contact${i+1}@client.example`,time_zone:i%2?'America/Chicago':'America/New_York'})))}`;
 await tx`insert into f5.contacts(workspace_id,id,name,side,operator_id,email,time_zone) values (${w},${id('senior-contact')},'Jordan Lee','senior',${senior},'operations@f5.example','America/New_York')`;
 const starts=names.map((_,i)=>i===0?-27:i===1?-3:i===2?-180:i===28?5:i===29?-260:-(35+i*6));
 await tx`insert into f5.professionals ${tx(names.map((name,i)=>({workspace_id:w,id:id(`professional-${i}`),name,role:roles[i%roles.length]!,location:i%3===0?'Manila, Philippines':i%2?'Pune, India':'Rajkot, India',cadence_anchor:day(starts[i]!)})))}`;
 await tx`insert into f5.contacts ${tx(names.map((name,i)=>({workspace_id:w,id:id(`professional-contact-${i}`),name,side:'professional',professional_id:id(`professional-${i}`),email:`professional${i+1}@talent.example`,time_zone:i%3===0?'Asia/Manila':'Asia/Kolkata'})))}`;
 await tx`insert into f5.placements ${tx(names.map((_,i)=>({workspace_id:w,id:id(`placement-${i}`),client_id:id(`client-${i%12}`),professional_id:id(`professional-${i}`),owner_id:manager,start_date:day(starts[i]!),trial_end:day(starts[i]!+(i===3?14:i===4?45:30)),status:i===28?'scheduled':i===29?'ended':'active',trial_decision:i===29?'end_placement':starts[i]! < -45?'continue':'pending'})))}`;
 await tx`update f5.clients c set cadence_anchor=(select min(p.start_date) from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='active') where c.workspace_id=${w}`;
 const completedMonthly:{workspace_id:string;id:string;type:string;placement_id?:string;client_id?:string;professional_id?:string;contact_id:string;occurrence_key:string;policy_version:string;due_at:string;state:string;state_reason:string;satisfied_at:string}[]=[];
 for(let i=0;i<28;i++){
  if(i===5)continue;
  const occurrence=monthlyOccurrences(day(starts[i]!),asOf).at(-1);
  if(occurrence)completedMonthly.push({workspace_id:w,id:id(`completed-professional-monthly-${i}`),type:'professional_monthly',placement_id:id(`placement-${i}`),professional_id:id(`professional-${i}`),contact_id:id(`professional-contact-${i}`),occurrence_key:`professional:${id(`professional-${i}`)}:monthly:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date),state:'satisfied',state_reason:'Monthly one-to-one completed.',satisfied_at:at(-1)});
 }
 for(let clientIndex=0;clientIndex<12;clientIndex++){
  if(clientIndex===1)continue;
  const clientStarts=starts.filter((_,placementIndex)=>placementIndex<28&&placementIndex%12===clientIndex);
  const anchor=day(Math.min(...clientStarts));
  const occurrence=monthlyOccurrences(anchor,asOf).at(-1);
  if(occurrence)completedMonthly.push({workspace_id:w,id:id(`completed-client-monthly-${clientIndex}`),type:'client_monthly',client_id:id(`client-${clientIndex}`),contact_id:id(`client-contact-${clientIndex}`),occurrence_key:`client:${id(`client-${clientIndex}`)}:monthly:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date),state:'satisfied',state_reason:'Monthly client check-in completed.',satisfied_at:at(-1)});
 }
 if(completedMonthly.length)await tx`insert into f5.obligations ${tx(completedMonthly.map(item=>({...item,placement_id:item.placement_id??null,client_id:item.client_id??null,professional_id:item.professional_id??null})),'workspace_id','id','type','placement_id','client_id','professional_id','contact_id','occurrence_key','policy_version','due_at','state','state_reason','satisfied_at')}`;
 await tx`insert into f5.activity ${tx(names.map((name,i)=>({workspace_id:w,id:id(`created-${i}`),placement_id:id(`placement-${i}`),actor_id:manager,type:'placement_created',summary:`${name} assigned to ${clients[i%12]}.`,occurred_at:at(Math.min(0,starts[i]!))})))}`;
 for(let i=0;i<28;i++) {
  if(i===0 || i===1 || i===2) continue;
  const note=i===4?'Client requested a replacement after repeated missed deadlines.':i===5?'Deliverables need clearer quality checks before submission.':'Work is meeting expectations. Communication and delivery are consistent.';
  await tx`insert into f5.feedback_responses(workspace_id,id,placement_id,contact_id,assessment,rating,notes,received_at,channel) values
   (${w},${id(`feedback-${i}`)},${id(`placement-${i}`)},${id(`client-contact-${i%12}`)},${i===4?'unsatisfied':i===5?'concerned':'satisfied'},${i===4?1:i===5?3:5},${note},${at(-2)},'phone')`;
 }
 // Historical unanswered request; reconciliation generates future recurrence.
 await tx`insert into f5.obligations(workspace_id,id,type,placement_id,contact_id,occurrence_key,policy_version,due_at) values
 (${w},${id('missing-feedback')},'client_feedback',${id('placement-0')},${id('client-contact-0')},${`placement-0:feedback:${day(-7)}`},${POLICY.version},${at(-7)})`;
 await tx`insert into f5.feedback_requests(workspace_id,id,placement_id,obligation_id,first_requested_at,response_deadline,channel) values
 (${w},${id('request-0')},${id('placement-0')},${id('missing-feedback')},${at(-7)},${responseDeadline(at(-7))},'email')`;
 for(const offset of [-7,-4]) await tx`insert into f5.interactions(workspace_id,id,placement_id,contact_id,actor_id,direction,channel,outcome,notes,occurred_at) values
 (${w},${id(`attempt-${offset}`)},${id('placement-0')},${id('client-contact-0')},${manager},'outbound','phone','no_answer','No response; client feedback is still needed.',${at(offset)})`;
 const issues=[
  {i:3,state:'monitoring',category:'attendance',reporter:'professional',description:'Intermittent connectivity caused missed shift starts.',action:'Use the backup connection and confirm attendance at shift start.',criteria:'No missed starts across both observation windows.'},
  {i:4,state:'open',category:'client_relationship',reporter:'client',description:'Client requested replacement after repeated late submissions.',action:null,criteria:null},
  {i:5,state:'action_agreed',category:'performance',reporter:'client',description:'Two deliverables required significant rework.',action:'Review each deliverable against the client checklist.',criteria:'Client accepts the next two deliverables without rework.'},
  {i:6,state:'reopened',category:'attendance',reporter:'professional',description:'Missed shift start recurred after the connection fix.',action:null,criteria:null},
 ];
 for(const issue of issues) {
  const fix=localDateTimeToInstant(addBusinessDays(asOf,-3),'10:00');
  const fixEvidence=issue.state==='monitoring'?'The backup connection was installed and the professional confirmed readiness.':null;
  await tx`insert into f5.issues(workspace_id,id,placement_id,reporter_contact_id,owner_id,category,severity,description,state,action_owner,agreed_action,verification_criteria,target_at,fix_reported_at,fix_evidence,fix_cycle,created_at) values
  (${w},${id(`issue-${issue.i}`)},${id(`placement-${issue.i}`)},${id(`${issue.reporter}-contact-${issue.i}`)},${manager},${issue.category},${issue.i===4?'critical':'normal'},${issue.description},${issue.state},${issue.action?'Alex Morgan':null},${issue.action},${issue.criteria},${issue.action?(issue.state==='monitoring'?fix:at(-1)):null},${issue.state==='monitoring'?fix:null},${fixEvidence},${issue.i===6?2:1},${at(-10)})`;
  if(issue.action)await tx`insert into f5.issue_actions(workspace_id,id,issue_id,fix_cycle,action_owner,agreed_action,verification_criteria,target_at,fix_reported_at,fix_evidence) values
   (${w},${id(`issue-action-${issue.i}`)},${id(`issue-${issue.i}`)},1,'Alex Morgan',${issue.action},${issue.criteria},${issue.state==='monitoring'?fix:at(-1)},${issue.state==='monitoring'?fix:null},${fixEvidence})`;
  if(issue.state==='monitoring') {
   const deadlines=verificationDeadlines(fix);
   for(const [window,due] of Object.entries(deadlines)) await tx`insert into f5.verifications(workspace_id,id,issue_id,fix_cycle,window_name,due_at) values (${w},${id(`check-${window}`)},${id('issue-3')},1,${window},${due})`;
  }
  if(issue.i===6){
   const oldFix=localDateTimeToInstant(addBusinessDays(asOf,-6),'10:00');
   const deadlines=verificationDeadlines(oldFix);
   await tx`insert into f5.issue_actions(workspace_id,id,issue_id,fix_cycle,action_owner,agreed_action,verification_criteria,target_at,fix_reported_at,fix_evidence) values
   (${w},${id('issue-action-6-cycle-1')},${id('issue-6')},1,'Rohan Mehta','Use the backup connection and confirm attendance before every shift.','Attend every agreed shift on time.',${oldFix},${oldFix},'The backup connection was installed and tested before the next shift.')`;
   await tx`insert into f5.verifications(workspace_id,id,issue_id,fix_cycle,window_name,due_at,result,confirmer_id,observed_at,evidence) values
   (${w},${id('recurred-initial')},${id('issue-6')},1,'initial',${deadlines.initial},'fail',${id('professional-contact-6')},${deadlines.initial},'Another shift start was missed after the backup connection was introduced.')`;
   await tx`insert into f5.verifications(workspace_id,id,issue_id,fix_cycle,window_name,due_at,canceled_reason) values
   (${w},${id('recurred-sustained')},${id('issue-6')},1,'sustained',${deadlines.sustained},'Initial verification failed; a new corrective action is required.')`;
  }
  if(issue.i===4 || issue.i===6) await tx`insert into f5.escalations(workspace_id,id,issue_id,fix_cycle,owner_id,reason,requested_decision,evidence,due_at) values
  (${w},${id(`escalation-${issue.i}`)},${id(`issue-${issue.i}`)},${issue.i===6?2:1},${senior},${issue.i===4?'retention_threat':'failed_intervention'},'Agree the recovery plan and responsible owner.',${issue.description},${at(0)})`;
 }
 await tx`update f5.workspaces set seed_version='v2',seed_date=${asOf} where id=${w}`;
}

// Preserves existing browser workspaces while adding routine history required by
// the queue. This is scoped, idempotent and never resets user records.
export async function upgradeSeedWorkspace(tx:Tx,w:string,asOf:string){
 const [workspace]=await tx`select seed_version from f5.workspaces where id=${w}`;
 if(workspace?.seed_version!=='v1')return;
 const completed:{workspace_id:string;id:string;type:string;placement_id?:string;client_id?:string;professional_id?:string;contact_id:string;occurrence_key:string;policy_version:string;due_at:string;state:string;state_reason:string;satisfied_at:string}[]=[];
 const placements=await tx`select p.id,p.professional_id,p.start_date,ct.id contact_id from f5.placements p join f5.contacts ct on ct.workspace_id=p.workspace_id and ct.professional_id=p.professional_id where p.workspace_id=${w} and p.status='active' and p.id<>${seedId(w,'placement-5')}`;
 for(const placement of placements){
  const occurrence=monthlyOccurrences(placement.start_date,asOf).at(-1);
  if(occurrence)completed.push({workspace_id:w,id:seedId(w,`completed-professional-monthly:${placement.id}`),type:'professional_monthly',placement_id:placement.id,professional_id:placement.professional_id,contact_id:placement.contact_id,occurrence_key:`professional:${placement.professional_id}:monthly:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date),state:'satisfied',state_reason:'Monthly one-to-one completed.',satisfied_at:localDateTimeToInstant(addBusinessDays(asOf,-1),'10:00')});
 }
 const clientRows=await tx`select c.id,c.cadence_anchor,ct.id contact_id from f5.clients c join f5.contacts ct on ct.workspace_id=c.workspace_id and ct.client_id=c.id where c.workspace_id=${w} and c.id<>${seedId(w,'client-1')} and exists(select 1 from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='active')`;
 for(const client of clientRows){
  const occurrence=monthlyOccurrences(client.cadence_anchor,asOf).at(-1);
  if(occurrence)completed.push({workspace_id:w,id:seedId(w,`completed-client-monthly:${client.id}`),type:'client_monthly',client_id:client.id,contact_id:client.contact_id,occurrence_key:`client:${client.id}:monthly:${occurrence.key}:${occurrence.date}`,policy_version:POLICY.version,due_at:routineDueAt(occurrence.date),state:'satisfied',state_reason:'Monthly client check-in completed.',satisfied_at:localDateTimeToInstant(addBusinessDays(asOf,-1),'10:00')});
 }
 if(completed.length){
  const normalized=completed.map(item=>({...item,placement_id:item.placement_id??null,client_id:item.client_id??null,professional_id:item.professional_id??null}));
  await tx`insert into f5.obligations ${tx(normalized,'workspace_id','id','type','placement_id','client_id','professional_id','contact_id','occurrence_key','policy_version','due_at','state','state_reason','satisfied_at')}
   on conflict(workspace_id,type,occurrence_key) do update set state='satisfied',state_reason=excluded.state_reason,satisfied_at=excluded.satisfied_at`;
 }
 await tx`update f5.workspaces set seed_version='v2' where id=${w} and seed_version='v1'`;
}

// Development/test-only primitive; deliberately has no product API route.
export async function resetWorkspace(tx:Tx,w:string,asOf:string) {
 await tx`select id from f5.workspaces where id=${w} for update`;
 const tables=['interaction_coverage','mutation_receipts','activity','verification_attempts','escalations','verifications','issue_actions','feedback_requests','feedback_responses','interactions','obligations','issues','placements','contacts','professionals','clients','operators'];
 for(const table of tables) await tx.unsafe(`delete from f5.${table} where workspace_id=$1`, [w]);
 await tx`update f5.workspaces set seed_version=null where id=${w}`;
 await seedWorkspace(tx,w,asOf);
}
