"use client";

import Link from 'next/link';
import { useRef,useState } from 'react';
import type { PlacementRecord } from '@/domain/placement';
import { DataState } from './data-state';
import { api,displayDate,useWorkspaceData } from './workspace-data';

type Attempt={result:string;observed_at:string;evidence:string};
type Verification={id:string;fix_cycle:number;window_name:'initial'|'sustained';due_at:string;result:string|null;observed_at:string|null;evidence:string|null;canceled_reason:string|null;attempts:Attempt[]};
type ActionHistory={fix_cycle:number;action_owner:string;agreed_action:string;verification_criteria:string;target_at:string;fix_reported_at:string|null;fix_evidence:string|null};
type Escalation={id:string;fix_cycle:number;reason:string;state:string;requested_decision:string;evidence:string;due_at:string;owner_name:string;acknowledged_at:string|null;decision:string|null;decided_at:string|null;follow_up_owner:string|null;follow_up_action:string|null;version:number};
type Issue={id:string;description:string;state:string;severity:string;category:string;action_owner:string|null;agreed_action:string|null;verification_criteria:string|null;target_at:string|null;fix_reported_at:string|null;fix_evidence:string|null;fix_cycle:number;version:number;closed_at:string|null;closure_evidence:string|null;professional_name:string;client_id:string;client_name:string;placement_id:string;owner_name:string;reporter_name:string;reporter_side:string;next_verification:string|null;verifications:Verification[];actions:ActionHistory[];escalation:Escalation|null};
type IssueResponse={items:Issue[];asOf:string};
type PlacementPage={items:PlacementRecord[]};
type ActiveForm='action'|'fix'|'reopen'|`verification:${string}`|'decision'|null;

const stateLabel=(value:string)=>value.replaceAll('_',' ');
const reasonLabel:Record<string,string>={retention_threat:'Retention or replacement risk',failed_intervention:'Intervention failed or concern recurred',action_overdue:'Corrective action overdue',beyond_authority:'Senior authority required'};

function useMutation(onSaved:()=>void){
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const request=useRef<{body:string;key:string}|null>(null);
 async function mutate(path:string,method:'POST'|'PATCH',payload:Record<string,unknown>){
  setSaving(true);setError('');const body=JSON.stringify(payload);
  if(request.current?.body!==body)request.current={body,key:crypto.randomUUID()};
  try{await api(path,{method,body:JSON.stringify({...payload,key:request.current.key})});request.current=null;onSaved();}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to save this update.');}
  finally{setSaving(false);}
 }
 return {saving,error,mutate};
}

function CreateIssueForm({placements,onCancel,onSaved}:{placements:PlacementRecord[];onCancel:()=>void;onSaved:()=>void}){
 const [placementId,setPlacementId]=useState(placements[0]?.id??''),[reporterSide,setReporterSide]=useState('client'),[category,setCategory]=useState('performance'),[severity,setSeverity]=useState('normal'),[description,setDescription]=useState(''),[escalationTrigger,setEscalationTrigger]=useState('none');
 const {saving,error,mutate}=useMutation(onSaved);
 return <form className="panel issue-form" onSubmit={event=>{event.preventDefault();void mutate('/api/issues','POST',{issue:{placementId,reporterSide,category,severity,description,escalationTrigger}});}}>
  <div className="outcome-heading"><div><h2>Report an issue</h2><p>Record the concern, its source, and whether senior review is already required.</p></div><button type="button" className="text-button" onClick={onCancel}>Close</button></div>
  <fieldset disabled={saving}><div className="form-grid">
   <label className="form-field">Placement<select required value={placementId} onChange={e=>setPlacementId(e.target.value)}>{placements.map(p=><option key={p.id} value={p.id}>{p.professional_name} · {p.client_name}</option>)}</select></label>
   <label className="form-field">Reported by<select value={reporterSide} onChange={e=>setReporterSide(e.target.value)}><option value="client">Client</option><option value="professional">Professional</option></select></label>
   <label className="form-field">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="performance">Performance</option><option value="attendance">Attendance</option><option value="communication">Communication</option><option value="client_relationship">Client relationship</option><option value="professional_concern">Professional concern</option><option value="other">Other</option></select></label>
   <label className="form-field">Impact<select value={severity} onChange={e=>setSeverity(e.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
   <label className="form-field form-span">Senior involvement<select value={escalationTrigger} onChange={e=>setEscalationTrigger(e.target.value)}><option value="none">Manager can handle this</option><option value="retention_threat">Cancellation, replacement, or departure risk</option><option value="beyond_authority">Requires senior authority</option></select></label>
  </div><label className="form-field">What happened<textarea required rows={4} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Record the observed problem and its impact."/></label></fieldset>
  {error&&<p className="save-error" role="alert">{error} Your entries have been kept.</p>}<div className="form-actions"><button className="button button-primary" disabled={saving}>{saving?'Saving…':'Create issue'}</button><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button></div>
 </form>;
}

function IssueCommandForm({issue,form,asOf,onCancel,onSaved}:{issue:Issue;form:Exclude<ActiveForm,null>;asOf:string;onCancel:()=>void;onSaved:()=>void}){
 const [actionOwner,setActionOwner]=useState(issue.action_owner??issue.professional_name),[agreedAction,setAgreedAction]=useState(issue.agreed_action??''),[criteria,setCriteria]=useState(issue.verification_criteria??''),[targetDate,setTargetDate]=useState(''),[evidence,setEvidence]=useState(''),[result,setResult]=useState('pass'),[confirmerSide,setConfirmerSide]=useState(issue.reporter_side),[decision,setDecision]=useState(''),[followUpOwner,setFollowUpOwner]=useState(issue.owner_name),[followUpAction,setFollowUpAction]=useState('');
 const {saving,error,mutate}=useMutation(onSaved);
 const verification=form.startsWith('verification:')?issue.verifications.find(item=>item.id===form.slice(13)):undefined;
 function submit(event:React.FormEvent){event.preventDefault();let command:Record<string,unknown>;
  if(form==='action')command={type:'agree_action',version:issue.version,actionOwner,agreedAction,verificationCriteria:criteria,targetDate};
  else if(form==='fix')command={type:'report_fix',version:issue.version,evidence};
  else if(form==='reopen')command={type:'reopen',version:issue.version,evidence};
  else if(form==='decision')command={type:'record_senior_decision',version:issue.version,escalationId:issue.escalation?.id,escalationVersion:issue.escalation?.version,decision,followUpOwner,followUpAction};
  else command={type:'record_verification',version:issue.version,verificationId:verification?.id,result,confirmerSide,evidence};
  void mutate(`/api/issues/${issue.id}`,'PATCH',{command});
 }
 const title=form==='action'?'Agree corrective action':form==='fix'?'Report the fix':form==='reopen'?'Record recurrence':form==='decision'?'Record senior decision':`Record ${verification?.window_name} verification`;
 return <form className="issue-command-form" onSubmit={submit}><div className="outcome-heading"><h3>{title}</h3><button type="button" className="text-button" onClick={onCancel}>Close</button></div><fieldset disabled={saving}>
  {form==='action'&&<><div className="form-grid"><label className="form-field">Responsible person<input required maxLength={180} value={actionOwner} onChange={e=>setActionOwner(e.target.value)}/></label><label className="form-field">Target date<input required type="date" min={asOf} value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label></div><label className="form-field">Expected change<textarea required rows={3} maxLength={2000} value={agreedAction} onChange={e=>setAgreedAction(e.target.value)}/></label><label className="form-field">How improvement will be verified<textarea required rows={3} maxLength={2000} value={criteria} onChange={e=>setCriteria(e.target.value)}/></label></>}
  {(form==='fix'||form==='reopen')&&<label className="form-field">Evidence<textarea required rows={4} maxLength={2000} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder={form==='fix'?'What changed, and what shows the fix is in place?':'What happened again, and what evidence confirms recurrence?'}/></label>}
  {verification&&<><p className="form-context">Observation window: {displayDate(verification.due_at)}</p><div className="form-grid"><label className="form-field">Result<select value={result} onChange={e=>setResult(e.target.value)}><option value="pass">Passed</option><option value="fail">Failed</option><option value="inconclusive">Inconclusive</option></select></label><label className="form-field">Confirmed by<select value={confirmerSide} onChange={e=>setConfirmerSide(e.target.value)}><option value="client">Client</option><option value="professional">Professional</option></select></label></div><label className="form-field">Verification evidence<textarea required rows={4} maxLength={2000} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Record what was observed and who confirmed it."/></label></>}
  {form==='decision'&&<><label className="form-field">Decision<textarea required rows={3} maxLength={2000} value={decision} onChange={e=>setDecision(e.target.value)}/></label><div className="form-grid"><label className="form-field">Follow-up owner<input required maxLength={180} value={followUpOwner} onChange={e=>setFollowUpOwner(e.target.value)}/></label><label className="form-field">Responsible follow-up<textarea required rows={3} maxLength={2000} value={followUpAction} onChange={e=>setFollowUpAction(e.target.value)}/></label></div></>}
 </fieldset>{error&&<p className="save-error" role="alert">{error} Your entries have been kept.</p>}<div className="form-actions"><button className="button button-primary" disabled={saving}>{saving?'Saving…':'Save update'}</button><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button></div></form>;
}

function IssueCard({issue,asOf,onSaved}:{issue:Issue;asOf:string;onSaved:()=>void}){
 const [form,setForm]=useState<ActiveForm>(null);const {saving,error,mutate}=useMutation(onSaved);
 const currentChecks=issue.verifications.filter(check=>check.fix_cycle===issue.fix_cycle);
 function acknowledge(){if(!issue.escalation)return;void mutate(`/api/issues/${issue.id}`,'PATCH',{command:{type:'acknowledge_escalation',version:issue.version,escalationId:issue.escalation.id,escalationVersion:issue.escalation.version}});}
 return <article className={`panel issue-card ${issue.escalation&&issue.escalation.state!=='decision_recorded'?'has-escalation':''}`} id={`issue-${issue.id}`}>
  <div className="card-top"><div className="issue-statuses"><span className={`status-pill ${issue.severity==='critical'?'critical':''}`}>{stateLabel(issue.state)}</span><span className="status-pill">Cycle {issue.fix_cycle}</span></div><span className="muted">Owner: {issue.owner_name}</span></div>
  <h2>{issue.description}</h2><p className="issue-context">{issue.reporter_name} ({issue.reporter_side}) · {stateLabel(issue.category)}</p><div className="issue-links"><Link className="text-link" href={`/clients/${issue.client_id}`}>{issue.client_name}</Link><Link className="text-link" href={`/placements/${issue.placement_id}`}>{issue.professional_name} →</Link></div>
  {!issue.escalation&&issue.state!=='verified_closed'&&<p className="manager-owned"><strong>Manager owned.</strong> No cancellation, failed-intervention, overdue-action, or senior-authority trigger is currently recorded.</p>}
  {issue.agreed_action&&<section className="issue-detail-block"><h3>Current corrective action</h3><p><strong>{issue.action_owner}</strong> · due {displayDate(issue.target_at)}</p><p>{issue.agreed_action}</p><p className="muted">Success measure: {issue.verification_criteria}</p>{issue.fix_evidence&&<p className="evidence-note">Fix evidence: {issue.fix_evidence}</p>}</section>}
  {currentChecks.length>0&&<section className="issue-detail-block"><h3>Recovery checks</h3>{currentChecks.map(check=><div className="verification-row" key={check.id}><div><strong>{check.window_name==='initial'?'Initial check':'Sustained check'}</strong><span>{displayDate(check.due_at)}</span></div><span className="status-pill">{check.canceled_reason?'canceled':check.result??'pending'}</span>{check.evidence&&<p>{check.evidence}</p>}{check.canceled_reason&&<p>{check.canceled_reason}</p>}{check.attempts.filter(a=>a.result==='inconclusive').map((attempt,index)=><p className="muted" key={`${attempt.observed_at}-${index}`}>Inconclusive {displayDate(attempt.observed_at)}: {attempt.evidence}</p>)}{!check.result&&!check.canceled_reason&&<button className="button button-secondary" onClick={()=>setForm(`verification:${check.id}`)}>Record verification</button>}</div>)}</section>}
  {issue.escalation&&<section className="senior-review"><div className="section-heading-inline"><h3>Senior review</h3><span className="status-pill">{stateLabel(issue.escalation.state)}</span></div><p><strong>{reasonLabel[issue.escalation.reason]??stateLabel(issue.escalation.reason)}</strong></p><p>{issue.escalation.requested_decision}</p><p className="muted">{issue.escalation.owner_name} · due {displayDate(issue.escalation.due_at)}</p>{issue.escalation.decision&&<><p className="evidence-note">Decision: {issue.escalation.decision}</p><p>Follow-up: <strong>{issue.escalation.follow_up_owner}</strong> · {issue.escalation.follow_up_action}</p></>}{issue.escalation.state==='pending_acknowledgment'&&<button className="button button-secondary" disabled={saving} onClick={acknowledge}>{saving?'Saving…':'Acknowledge review'}</button>}{issue.escalation.state==='acknowledged'&&<button className="button button-secondary" onClick={()=>setForm('decision')}>Record decision</button>}{error&&<p className="save-error" role="alert">{error}</p>}</section>}
  {issue.closed_at&&<section className="issue-detail-block"><h3>Verified closure</h3><p>{displayDate(issue.closed_at)} · {issue.closure_evidence}</p></section>}
  <div className="issue-actions">{(issue.state==='open'||issue.state==='reopened')&&<button className="button button-primary" onClick={()=>setForm('action')}>Agree recovery plan</button>}{issue.state==='action_agreed'&&<button className="button button-primary" onClick={()=>setForm('fix')}>Report fix</button>}{issue.state==='verified_closed'&&<button className="button button-secondary" onClick={()=>setForm('reopen')}>Report recurrence</button>}</div>
  {form&&<IssueCommandForm issue={issue} form={form} asOf={asOf} onCancel={()=>setForm(null)} onSaved={()=>{setForm(null);onSaved();}}/>}
  {issue.actions.length>1&&<details className="action-history"><summary>Previous recovery plans</summary>{issue.actions.slice(1).map(action=><div key={action.fix_cycle}><strong>Cycle {action.fix_cycle}: {action.action_owner}</strong><p>{action.agreed_action}</p><p className="muted">{action.verification_criteria}</p></div>)}</details>}
 </article>;
}

export function IssuesList({selectedIssueId}:{selectedIssueId?:string}){
 const {data,error,loading,reload}=useWorkspaceData<IssueResponse>('/api/issues');const placements=useWorkspaceData<PlacementPage>('/api/placements?pageSize=100');const [creating,setCreating]=useState(false),[filter,setFilter]=useState('active');
 const items=data?.items??[];const focused=selectedIssueId?items.filter(issue=>issue.id===selectedIssueId):null;const filtered=focused??items.filter(issue=>filter==='monitoring'?issue.state==='monitoring':filter==='escalated'?Boolean(issue.escalation&&issue.escalation.state!=='decision_recorded'):filter==='closed'?issue.state==='verified_closed':issue.state!=='verified_closed');
 const filters:[string,string][]=[['active','Active'],['monitoring','Monitoring'],['escalated','Senior review'],['closed','Verified closed']];
 return <>{selectedIssueId?<div className="issue-toolbar"><p className="muted">Showing the selected issue and its current recovery workflow.</p><Link className="button button-secondary" href="/issues">View all issues</Link></div>:<div className="issue-toolbar"><div className="queue-tabs" aria-label="Issue filter">{filters.map(([value,label])=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><button className="button button-primary" onClick={()=>setCreating(value=>!value)}>{creating?'Close form':'Report issue'}</button></div>}
  <DataState error={error||placements.error} loading={(loading&&!data)||(placements.loading&&!placements.data)} retry={()=>{void reload();void placements.reload();}}/>
  {!selectedIssueId&&creating&&placements.data&&<CreateIssueForm placements={placements.data.items} onCancel={()=>setCreating(false)} onSaved={()=>{setCreating(false);void reload();}}/>}
  {data&&<div className="issue-list">{filtered.map(issue=><IssueCard issue={issue} asOf={data.asOf} onSaved={()=>void reload()} key={issue.id}/>)}{!filtered.length&&<div className="panel data-message"><h2>{selectedIssueId?'Issue not found':'No issues in this view'}</h2><p>{selectedIssueId?'This issue is not available in the current workspace.':'Choose another status or report a new concern.'}</p>{selectedIssueId&&<Link className="button button-secondary" href="/issues">View all issues</Link>}</div>}</div>}</>;
}
