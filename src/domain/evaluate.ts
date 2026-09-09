import { Temporal } from '@js-temporal/polyfill';
import { POLICY } from './policy';
import { addCalendarDays, businessDaysBetween, compareDates, dateInTimeZone, monthlyAnniversary, parseDate, trialReviewDate } from './clock';
import type { ContactSide, ObligationType, Priority, PriorityReason } from './types';

export interface ScheduledOccurrence { date:string; key:string }

export function feedbackOccurrences(start:string,through:string):ScheduledOccurrence[] {
  parseDate(start);parseDate(through);
  const results=POLICY.feedback.earlyOffsets.map(offset=>({date:addCalendarDays(start,offset),key:`early-${offset}`})).filter(item=>compareDates(item.date,through)<=0);
  for(let month=1;month<=1200;month++){
    const date=monthlyAnniversary(start,month);
    if(compareDates(date,through)>0)break;
    if(compareDates(date,addCalendarDays(start,POLICY.feedback.earlyCareCalendarDays))>0)results.push({date,key:`month-${month}`});
  }
  return results;
}

export function monthlyOccurrences(anchor:string,through:string):ScheduledOccurrence[] {
  const results:ScheduledOccurrence[]=[];
  for(let month=1;month<=1200;month++){
    const date=monthlyAnniversary(anchor,month);
    if(compareDates(date,through)>0)break;
    results.push({date,key:`month-${month}`});
  }
  return results;
}

export interface QueueFact {
  obligationId:string; type:ObligationType; dueAt:string; asOf:string;
  trialEnd?:string|null; trialStart?:string|null; trialDecision?:string|null;
  firstRequestedAt?:string|null; responseDeadline?:string|null;
  issueSeverity?:string|null; escalationReason?:string|null;
}

const typeLabel:Record<ObligationType,string>={
  trial_review:'Trial decision review',client_feedback:'Client feedback',client_monthly:'Client relationship check-in',professional_monthly:'Professional check-in',
  issue_triage:'Issue triage',corrective_action:'Corrective action',verification:'Recovery verification',senior_review:'Senior review',
};
const rank:Record<Priority,number>={P0:0,P1:1,P2:2,P3:3};
export function higherPriority(a:Priority,b:Priority):Priority{return rank[a]<=rank[b]?a:b;}

export function evaluateObligation(fact:QueueFact):PriorityReason {
  const dueDate=dateInTimeZone(fact.dueAt);
  const overdue=compareDates(dueDate,fact.asOf)<0;
  const overdueDays=overdue?businessDaysBetween(dueDate,fact.asOf):0;
  let priority:Priority=overdue?'P2':'P3';
  let explanation=overdue?`${typeLabel[fact.type]} is ${overdueDays} business day${overdueDays===1?'':'s'} overdue.`:`${typeLabel[fact.type]} is scheduled for ${dueDate}.`;

  if(fact.type==='client_feedback'&&!fact.firstRequestedAt){
    explanation=overdue
      ? `Outreach is ${overdueDays} business day${overdueDays===1?'':'s'} overdue; placement-specific client feedback has not been requested.`
      : `Request placement-specific client feedback by ${dueDate}.`;
  }

  if(fact.type==='senior_review'){
    priority=fact.escalationReason==='retention_threat'||fact.escalationReason==='beyond_authority'?'P0':'P1';
    explanation=fact.escalationReason==='retention_threat'?'Senior review is required because the client requested cancellation or replacement.':'Senior review is required for an intervention that did not hold.';
  } else if(fact.type==='issue_triage'&&fact.issueSeverity==='critical'){
    priority='P0';explanation='The reported issue threatens the client relationship and needs immediate triage.';
  } else if(fact.type==='client_feedback'&&fact.firstRequestedAt){
    const requestDate=dateInTimeZone(fact.firstRequestedAt);
    const silenceDays=businessDaysBetween(requestDate,fact.asOf);
    if(silenceDays>=POLICY.feedback.silenceUrgentBusinessDays){priority='P1';explanation=`Client feedback is still missing ${silenceDays} business days after the first request.`;}
    else if(fact.responseDeadline&&compareDates(dateInTimeZone(fact.responseDeadline),fact.asOf)<0){
      priority=higherPriority(priority,'P2');explanation='The client response window has passed and feedback is still missing.';
    } else if(fact.responseDeadline) explanation=`Client feedback was requested; a response is due by ${dateInTimeZone(fact.responseDeadline)}.`;
  }
  if(fact.type==='client_feedback'&&fact.trialStart&&fact.trialEnd&&fact.trialDecision==='pending'&&compareDates(fact.asOf,trialReviewDate(fact.trialStart,fact.trialEnd))>=0){
    priority=higherPriority(priority,'P1');explanation+=` The trial decision is due by ${fact.trialEnd}.`;
  }
  if(fact.type==='corrective_action'&&overdueDays>=POLICY.issues.overdueEscalationBusinessDays){priority=higherPriority(priority,'P1');explanation=`The corrective action is ${overdueDays} business days overdue.`;}
  if(overdueDays>=POLICY.rescheduling.overduePromotionBusinessDays&&priority!=='P0')priority='P1';
  return {ruleId: fact.type==='senior_review'?'A07':fact.type==='client_feedback'?'A03':fact.type==='trial_review'?'A02':fact.type==='client_monthly'||fact.type==='professional_monthly'?'A05':fact.type==='issue_triage'||fact.type==='corrective_action'||fact.type==='verification'?'A06':'A08',priority,explanation,obligationId:fact.obligationId};
}

export function localContactState(instant:string,zone:string):{bucket:'now'|'later'|'upcoming';localTime:string} {
  const zoned=Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
  const localDate=zoned.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  const localClock=zoned.toLocaleString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  const localTime=`${localDate} · ${localClock}`;
  if(zoned.dayOfWeek<=5&&zoned.hour>=9&&zoned.hour<17)return {bucket:'now',localTime};
  if(zoned.dayOfWeek<=5&&zoned.hour<9)return {bucket:'later',localTime};
  return {bucket:'upcoming',localTime};
}

export interface QueueItem {
  obligationId:string;type:ObligationType;dueAt:string;scheduledAt:string;priority:Priority;reason:string;
  contactId:string;contactName:string;contactSide:ContactSide;contactEmail:string;contactZone:string;
  clientId:string|null;clientName:string|null;professionalName:string|null;placementId:string|null;trialEnd:string|null;
  bucket:'now'|'later'|'upcoming';localTime:string;
}
export interface QueueCard {
  id:string;contactId:string;contactName:string;contactSide:ContactSide;contactEmail:string;contactZone:string;
  clientId:string|null;clientName:string|null;professionalNames:string[];placementId:string|null;trialEnd:string|null;
  priority:Priority;bucket:'now'|'later'|'upcoming';localTime:string;oldestDueAt:string;nextContactAt:string|null;
  reasons:{obligationId:string;type:ObligationType;text:string;placementId:string|null;professionalName:string|null;dueAt:string}[];
}
export function groupQueue(items:QueueItem[]):QueueCard[]{
  const groups=new Map<string,QueueCard>();
  for(const item of items){
    const key=`${item.contactId}:${item.bucket}`;
    const current=groups.get(key);
    if(!current){groups.set(key,{id:key,contactId:item.contactId,contactName:item.contactName,contactSide:item.contactSide,contactEmail:item.contactEmail,contactZone:item.contactZone,clientId:item.clientId,clientName:item.clientName,professionalNames:item.professionalName?[item.professionalName]:[],placementId:item.placementId,trialEnd:item.trialEnd,priority:item.priority,bucket:item.bucket,localTime:item.localTime,oldestDueAt:item.dueAt,nextContactAt:item.scheduledAt===item.dueAt?null:item.scheduledAt,reasons:[{obligationId:item.obligationId,type:item.type,text:item.reason,placementId:item.placementId,professionalName:item.professionalName,dueAt:item.dueAt}]});continue;}
    current.priority=higherPriority(current.priority,item.priority);
    if(Temporal.Instant.compare(Temporal.Instant.from(item.dueAt),Temporal.Instant.from(current.oldestDueAt))<0)current.oldestDueAt=item.dueAt;
    if(item.professionalName&&!current.professionalNames.includes(item.professionalName))current.professionalNames.push(item.professionalName);
    current.reasons.push({obligationId:item.obligationId,type:item.type,text:item.reason,placementId:item.placementId,professionalName:item.professionalName,dueAt:item.dueAt});
    if(item.scheduledAt!==item.dueAt&&(!current.nextContactAt||Temporal.Instant.compare(Temporal.Instant.from(item.scheduledAt),Temporal.Instant.from(current.nextContactAt))<0))current.nextContactAt=item.scheduledAt;
    if(!current.placementId&&item.placementId)current.placementId=item.placementId;
    if(!current.trialEnd&&item.trialEnd)current.trialEnd=item.trialEnd;
  }
  return [...groups.values()].sort((a,b)=>rank[a.priority]-rank[b.priority]||Temporal.Instant.compare(Temporal.Instant.from(a.oldestDueAt),Temporal.Instant.from(b.oldestDueAt))||a.contactId.localeCompare(b.contactId));
}
