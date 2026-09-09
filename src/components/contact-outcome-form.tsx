"use client";
import { useMemo,useRef,useState } from 'react';
import { addBusinessDays } from '@/domain/clock';
import type { QueueCard } from '@/domain/evaluate';
import type { ContactChannel,FeedbackAssessment,InteractionDirection,InteractionOutcome,ObligationType } from '@/domain/types';
import { api,displayDate } from './workspace-data';

const coverable=new Set<ObligationType>(['client_feedback','client_monthly','professional_monthly']);
const labels:Record<ObligationType,string>={trial_review:'Trial review',client_feedback:'Client feedback',client_monthly:'Client relationship check-in',professional_monthly:'Professional one-to-one',issue_triage:'Issue triage',corrective_action:'Corrective action',verification:'Recovery verification',senior_review:'Senior review'};
type FeedbackDraft={assessment:FeedbackAssessment;rating:string;notes:string};

export function ContactOutcomeForm({card,asOf,onCancel,onSaved}:{card:QueueCard;asOf:string;onCancel:()=>void;onSaved:()=>void}){
 const eligible=useMemo(()=>card.reasons.filter(reason=>coverable.has(reason.type)),[card.reasons]);
 const [selected,setSelected]=useState<string[]>([]);const [direction,setDirection]=useState<InteractionDirection>('outbound');const [channel,setChannel]=useState<ContactChannel>('phone');const [outcome,setOutcome]=useState<InteractionOutcome>('reached');const [notes,setNotes]=useState('');const [rescheduleDate,setRescheduleDate]=useState('');
 const [feedback,setFeedback]=useState<Record<string,FeedbackDraft>>({});const [saving,setSaving]=useState(false);const [error,setError]=useState('');const request=useRef<{body:string;key:string}|undefined>(undefined);
 function toggle(id:string,checked:boolean){setSelected(items=>checked?[...items,id]:items.filter(item=>item!==id));}
 function feedbackDraft(id:string){return feedback[id]??{assessment:'satisfied',rating:'5',notes:''};}
 function updateFeedback(id:string,change:Partial<FeedbackDraft>){setFeedback(current=>({...current,[id]:{...feedbackDraft(id),...change}}));}
 async function submit(event:React.FormEvent){
  event.preventDefault();setSaving(true);setError('');
  const selectedPlacements=[...new Map(eligible.filter(reason=>reason.type==='client_feedback'&&reason.placementId&&selected.includes(reason.obligationId)).map(reason=>[reason.placementId!,reason])).values()];
  const feedbackRows=outcome==='reached'?selectedPlacements.map(reason=>{const draft=feedbackDraft(reason.placementId!);return {placementId:reason.placementId!,assessment:draft.assessment,rating:draft.rating?Number(draft.rating):null,notes:draft.notes};}):[];
  const payload={contactId:card.contactId,direction,channel,outcome,notes,obligationIds:selected,rescheduleDate:outcome==='rescheduled'?rescheduleDate:undefined,feedback:feedbackRows};
  const body=JSON.stringify(payload);if(request.current?.body!==body)request.current={body,key:crypto.randomUUID()};
  try{await api('/api/interactions',{method:'POST',body:JSON.stringify({outcome:payload,key:request.current!.key})});request.current=undefined;onSaved();}
  catch(reason){setError(reason instanceof Error?reason.message:'Unable to save this outcome.');}
  finally{setSaving(false);}
 }
 return <form className="outcome-form" onSubmit={submit}>
  <div className="outcome-heading"><div><h4>Record outcome</h4><p>{card.contactName} · {card.contactEmail}</p></div><button type="button" className="text-button" onClick={onCancel}>Close</button></div>
  <fieldset disabled={saving}><legend>Conversation</legend><div className="form-grid compact-grid">
   <label className="form-field">Direction<select value={direction} onChange={event=>setDirection(event.target.value as InteractionDirection)}><option value="outbound">Outgoing</option><option value="inbound">Incoming</option></select></label>
   <label className="form-field">Channel<select value={channel} onChange={event=>setChannel(event.target.value as ContactChannel)}><option value="phone">Phone</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="other">Other</option></select></label>
   <label className="form-field">Outcome<select value={outcome} onChange={event=>{const value=event.target.value as InteractionOutcome;setOutcome(value);if(value==='no_answer')setDirection('outbound');}}><option value="reached">Reached</option><option value="no_answer">No answer</option><option value="rescheduled">Rescheduled</option></select></label>
   {outcome==='rescheduled'&&<label className="form-field">New contact date<input required type="date" min={asOf} max={addBusinessDays(asOf,2)} value={rescheduleDate} onChange={event=>setRescheduleDate(event.target.value)}/></label>}
  </div><label className="form-field">Conversation notes<textarea required maxLength={2000} rows={3} value={notes} onChange={event=>setNotes(event.target.value)} placeholder={outcome==='no_answer'?'Record the attempt and any useful context.':outcome==='rescheduled'?'Record why the contact moved.':'Record what was discussed and agreed.'}/></label></fieldset>
  <fieldset disabled={saving}><legend>Work addressed</legend>{eligible.length?<div className="coverage-list">{eligible.map(reason=><label className="coverage-option" key={reason.obligationId}><input type="checkbox" checked={selected.includes(reason.obligationId)} onChange={event=>toggle(reason.obligationId,event.target.checked)}/><span><strong>{labels[reason.type]}</strong>{reason.professionalName&&<small>{reason.professionalName}</small>}<small>Original deadline {displayDate(reason.dueAt)}</small></span></label>)}</div>:<p className="muted">This conversation will be recorded. The open operational item remains in its dedicated workflow.</p>}</fieldset>
  {outcome==='reached'&&[...new Map(eligible.filter(reason=>reason.type==='client_feedback'&&reason.placementId&&selected.includes(reason.obligationId)).map(reason=>[reason.placementId!,reason])).values()].map(reason=>{const placementId=reason.placementId!;const draft=feedbackDraft(placementId);return <fieldset disabled={saving} className="feedback-fields" key={placementId}><legend>Feedback · {reason.professionalName??'Placement'}</legend><div className="form-grid compact-grid"><label className="form-field">Assessment<select value={draft.assessment} onChange={event=>updateFeedback(placementId,{assessment:event.target.value as FeedbackAssessment})}><option value="satisfied">Satisfied</option><option value="concerned">Concerned</option><option value="unsatisfied">Unsatisfied</option></select></label><label className="form-field">Rating<select value={draft.rating} onChange={event=>updateFeedback(placementId,{rating:event.target.value})}><option value="">Not provided</option>{[5,4,3,2,1].map(value=><option value={value} key={value}>{value} / 5</option>)}</select></label></div><label className="form-field">Feedback evidence<textarea required maxLength={2000} rows={3} value={draft.notes} onChange={event=>updateFeedback(placementId,{notes:event.target.value})} placeholder="Record the client’s placement-specific feedback."/></label></fieldset>;})}
  {error&&<p className="save-error" role="alert">{error} Your entries have been kept.</p>}<div className="form-actions"><button type="submit" className="button button-primary" disabled={saving}>{saving?'Saving…':'Save outcome'}</button><button type="button" className="button button-secondary" disabled={saving} onClick={onCancel}>Cancel</button></div>
 </form>;
}
