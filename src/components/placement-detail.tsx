"use client";
import Link from 'next/link';
import { useState } from 'react';
import type { PlacementRecord } from '@/domain/placement';
import { useWorkspaceData,displayDate } from './workspace-data';
import { DataState } from './data-state';
import { PlacementForm } from './placement-form';
type Detail={placement:PlacementRecord;health:{status:string;label:string;explanation:string};feedback:{assessment:string;notes:string;received_at:string}[];activity:{type:string;summary:string;occurred_at:string}[];issues:{id:string;description:string;state:string}[];obligations:{id:string;type:string;due_at:string;next_contact_at?:string|null}[]};
export function PlacementDetail({id}:{id:string}){
 const {data,error,loading,reload}=useWorkspaceData<Detail>(`/api/placements/${id}`);const [editing,setEditing]=useState(false);
 return <><Link className="text-link" href="/placements">← All placements</Link><DataState error={error} loading={loading&&!data} retry={()=>void reload()}/>{data&&<>
 <div className="page-heading"><div><h1>{data.placement.professional_name}</h1><p className="page-description">{data.placement.role} · <Link className="text-link" href={`/clients/${data.placement.client_id}`}>{data.placement.client_name}</Link></p></div><button className="button button-primary" onClick={()=>setEditing(!editing)}>{editing?'Back to details':'Edit placement'}</button></div>
 {editing?<PlacementForm placement={data.placement} onSaved={()=>{setEditing(false);void reload();}}/>:<>
 <section className="panel detail-section"><div className="section-heading-inline"><h2>Engagement</h2><span className={`health-badge health-${data.health.status}`}>{data.health.label}</span></div><p className="health-explanation">{data.health.explanation}</p><dl className="detail-grid">{[['Status',data.placement.status],['Start date',displayDate(data.placement.start_date)],['Trial end',displayDate(data.placement.trial_end)],['Trial decision',data.placement.trial_decision.replaceAll('_',' ')],['Owner',data.placement.owner_name],['Location',data.placement.location]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
 <section className="panel detail-section"><h2>Contacts</h2><div className="contact-grid"><div><h3>{data.placement.client_contact_name}</h3><p>{data.placement.client_email}</p><p>{data.placement.client_time_zone}</p></div><div><h3>{data.placement.professional_name}</h3><p>{data.placement.professional_email}</p><p>{data.placement.professional_time_zone}</p></div></div></section>
 <div className="detail-columns"><section className="panel detail-section"><h2>Due and upcoming</h2>{data.obligations.length?data.obligations.map(o=><article className="timeline-entry" key={o.id}><span className="status-pill">{o.type.replaceAll('_',' ')}</span><p>Original deadline {displayDate(o.due_at)}</p>{o.next_contact_at&&<p className="muted">Next contact {displayDate(o.next_contact_at)}</p>}</article>):<p className="muted">No open follow-ups.</p>}</section><section className="panel detail-section"><h2>Issues</h2>{data.issues.length?data.issues.map(i=><article className="timeline-entry" key={i.id}><span className="status-pill">{i.state.replaceAll('_',' ')}</span><p>{i.description}</p><Link className="text-link" href={`/issues#issue-${i.id}`}>Manage issue →</Link></article>):<p className="muted">No issues recorded.</p>}</section></div>
 <section className="panel detail-section"><h2>Client feedback</h2>{data.feedback.length?data.feedback.map((f,i)=><article className="timeline-entry" key={i}><span className="status-pill">{f.assessment}</span><p>{f.notes}</p><time>{displayDate(f.received_at)}</time></article>):<p className="muted">No client feedback recorded.</p>}</section>
 <section className="panel detail-section"><h2>Activity</h2>{data.activity.map((a,i)=><article className="timeline-entry" key={i}><time>{displayDate(a.occurred_at)}</time><p>{a.summary}</p></article>)}</section>
 </>}
 </>}</>;
}
