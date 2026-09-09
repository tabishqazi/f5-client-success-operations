"use client";
import { useState,useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { PlacementInput,PlacementRecord } from '@/domain/placement';
import { useWorkspaceData,api } from './workspace-data';
import { DataState } from './data-state';
type Lookups={operators:{id:string;name:string;role:string}[];clients:{id:string;name:string;contact_name:string;email:string;time_zone:string}[]};
function initial(p?:PlacementRecord):PlacementInput {
 return {clientId:p?.client_id,clientVersion:p?.client_version,professionalId:p?.professional_id,ownerId:p?.owner_id??'',clientName:p?.client_name??'',clientContactName:p?.client_contact_name??'',clientEmail:p?.client_email??'',clientTimeZone:p?.client_time_zone??'America/New_York',professionalName:p?.professional_name??'',role:p?.role??'',location:p?.location??'',professionalEmail:p?.professional_email??'',professionalTimeZone:p?.professional_time_zone??'Asia/Kolkata',startDate:p?.start_date??'',trialEnd:p?.trial_end??'',status:p?.status??'active',trialDecision:p?.trial_decision??'pending'};
}
export function PlacementForm({placement,onSaved}:{placement?:PlacementRecord;onSaved?:()=>void}) {
 const {data,error,loading,reload}=useWorkspaceData<Lookups>('/api/lookups');
 const [form,setForm]=useState<PlacementInput>(()=>initial(placement));const [saving,setSaving]=useState(false);const [saveError,setSaveError]=useState('');const router=useRouter();
 const request=useRef<{body:string;key:string}|undefined>(undefined);
 const ownerId=form.ownerId||data?.operators.find(o=>o.role==='manager')?.id||'';
 function change(key:keyof PlacementInput,value:string){setForm(f=>({...f,[key]:value}));}
 async function submit(e:React.FormEvent){
  e.preventDefault();setSaving(true);setSaveError('');
  const submitted={...form,ownerId}; const body=JSON.stringify(submitted);
  if(request.current?.body!==body)request.current={body,key:crypto.randomUUID()};
  try{
   const result=await api<{id:string}>(placement?`/api/placements/${placement.id}`:'/api/placements',{method:placement?'PATCH':'POST',body:JSON.stringify({placement:submitted,key:request.current!.key,version:placement?.version})});
   request.current=undefined;if(onSaved)onSaved();else router.push(`/placements/${result.id}`);
  }catch(e){setSaveError(e instanceof Error?e.message:'Unable to save. Your entries are still here.');}finally{setSaving(false);}
 }
 function field(label:string,key:keyof PlacementInput,type='text',disabled=false){return <label className="form-field">{label}<input required maxLength={key.includes('Email')?254:180} type={type} value={String(form[key]??'')} onChange={e=>change(key,e.target.value)} disabled={disabled||saving}/></label>;}
 return <><DataState error={error} loading={loading&&!data} retry={()=>void reload()}/>{data&&<form className="placement-form panel" onSubmit={submit}>
 <fieldset disabled={saving}><legend>Client relationship</legend><label className="form-field">Client<select value={form.clientId??''} disabled={Boolean(placement)} onChange={e=>{
  const c=data.clients.find(c=>c.id===e.target.value);setForm(f=>({...f,clientId:c?.id,clientName:c?.name??'',clientContactName:c?.contact_name??'',clientEmail:c?.email??'',clientTimeZone:c?.time_zone??'America/New_York'}));
 }}><option value="">New client</option>{data.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {placement&&<p className="muted">Client contact changes apply to every placement with this client.</p>}{(!form.clientId||placement)&&<div className="form-grid">{field('Company name','clientName')}{field('Contact name','clientContactName')}{field('Contact email','clientEmail','email')}{field('Client time zone','clientTimeZone')}</div>}
 </fieldset><fieldset disabled={saving}><legend>Professional</legend><div className="form-grid">{field('Full name','professionalName')}{field('Role','role')}{field('Location','location')}{field('Email','professionalEmail','email')}{field('Professional time zone','professionalTimeZone')}</div></fieldset>
 <fieldset disabled={saving}><legend>Engagement</legend><div className="form-grid">{field('Start date','startDate','date')}{field('Trial end','trialEnd','date')}
 <label className="form-field">Owner<select value={ownerId} onChange={e=>change('ownerId',e.target.value)}>{data.operators.filter(o=>o.role==='manager').map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <label className="form-field">Status<select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as PlacementInput['status'],trialDecision:e.target.value==='ended'?'end_placement':f.trialDecision==='end_placement'?'pending':f.trialDecision}))}><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="ended">Ended</option></select></label>
 <label className="form-field">Trial decision<select value={form.trialDecision} disabled={form.status==='ended'} onChange={e=>change('trialDecision',e.target.value)}><option value="pending">Decision pending</option><option value="continue">Continue</option><option value="extend">Extend trial</option>{form.status==='ended'&&<option value="end_placement">End placement</option>}</select></label>
 </div></fieldset>{saveError&&<p className="save-error" role="alert">{saveError} Your entries have been kept.</p>}<div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">{saving?'Saving…':placement?'Save changes':'Create placement'}</button>{onSaved&&<button className="button button-secondary" disabled={saving} type="button" onClick={onSaved}>Cancel</button>}</div>
 </form>}</>;
}
