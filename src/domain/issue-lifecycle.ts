import { businessDaysBetween,compareDates,parseDate } from './clock';
import { DomainError } from './errors';
import { POLICY } from './policy';
import { validateId } from './placement';

export const ISSUE_CATEGORIES=['performance','attendance','communication','client_relationship','professional_concern','other'] as const;
export const ISSUE_SEVERITIES=['normal','high','critical'] as const;
export const ESCALATION_REASONS=['retention_threat','failed_intervention','action_overdue','beyond_authority'] as const;
export type IssueCategory=typeof ISSUE_CATEGORIES[number];
export type IssueSeverity=typeof ISSUE_SEVERITIES[number];
export type EscalationReason=typeof ESCALATION_REASONS[number];
export type ReporterSide='client'|'professional';
export type VerificationResult='pass'|'fail'|'inconclusive';

export interface IssueCreateInput {placementId:string;reporterSide:ReporterSide;category:IssueCategory;severity:IssueSeverity;description:string;escalationTrigger:'none'|'retention_threat'|'beyond_authority'}
export type IssueCommand=
 | {type:'agree_action';version:number;actionOwner:string;agreedAction:string;verificationCriteria:string;targetDate:string}
 | {type:'report_fix';version:number;evidence:string}
 | {type:'record_verification';version:number;verificationId:string;result:VerificationResult;confirmerSide:ReporterSide;evidence:string}
 | {type:'reopen';version:number;evidence:string}
 | {type:'acknowledge_escalation';version:number;escalationId:string;escalationVersion:number}
 | {type:'record_senior_decision';version:number;escalationId:string;escalationVersion:number;decision:string;followUpOwner:string;followUpAction:string};

function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new DomainError('INVALID_RANGE','Invalid issue update');return value as Record<string,unknown>}
function text(value:unknown,max=2000):string{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new DomainError('INVALID_RANGE','Required text is missing or too long');return value.trim()}
function version(value:unknown):number{const result=Number(value);if(!Number.isSafeInteger(result)||result<1)throw new DomainError('INVALID_RANGE','Version required');return result}
function oneOf<T extends readonly string[]>(value:unknown,allowed:T):T[number]{if(typeof value!=='string'||!allowed.includes(value))throw new DomainError('INVALID_RANGE','Invalid selection');return value as T[number]}

export function validateIssueCreate(value:unknown):IssueCreateInput{
 const item=record(value);
 return {placementId:validateId(item.placementId),reporterSide:oneOf(item.reporterSide,['client','professional'] as const),category:oneOf(item.category,ISSUE_CATEGORIES),severity:oneOf(item.severity,ISSUE_SEVERITIES),description:text(item.description),escalationTrigger:oneOf(item.escalationTrigger??'none',['none','retention_threat','beyond_authority'] as const)};
}

export function validateIssueCommand(value:unknown,asOf:string):IssueCommand{
 const item=record(value);const type=String(item.type);const issueVersion=version(item.version);
 if(type==='agree_action'){
  const targetDate=parseDate(text(item.targetDate,10)).toString();
  if(compareDates(targetDate,asOf)<0)throw new DomainError('INVALID_RANGE','Action date cannot be in the past');
  return {type,version:issueVersion,actionOwner:text(item.actionOwner,180),agreedAction:text(item.agreedAction),verificationCriteria:text(item.verificationCriteria),targetDate};
 }
 if(type==='report_fix')return {type,version:issueVersion,evidence:text(item.evidence)};
 if(type==='record_verification')return {type,version:issueVersion,verificationId:validateId(item.verificationId),result:oneOf(item.result,['pass','fail','inconclusive'] as const),confirmerSide:oneOf(item.confirmerSide,['client','professional'] as const),evidence:text(item.evidence)};
 if(type==='reopen')return {type,version:issueVersion,evidence:text(item.evidence)};
 if(type==='acknowledge_escalation')return {type,version:issueVersion,escalationId:validateId(item.escalationId),escalationVersion:version(item.escalationVersion)};
 if(type==='record_senior_decision')return {type,version:issueVersion,escalationId:validateId(item.escalationId),escalationVersion:version(item.escalationVersion),decision:text(item.decision),followUpOwner:text(item.followUpOwner,180),followUpAction:text(item.followUpAction)};
 throw new DomainError('INVALID_TRANSITION','Unknown issue action');
}

export interface EscalationFacts {explicit?:'none'|'retention_threat'|'beyond_authority';verificationFailed?:boolean;recurrence?:boolean;state?:string;targetDate?:string|null;asOf?:string}
export function evaluateEscalations(facts:EscalationFacts):EscalationReason[]{
 const reasons=new Set<EscalationReason>();
 if(facts.explicit&&facts.explicit!=='none')reasons.add(facts.explicit);
 if(facts.verificationFailed||facts.recurrence)reasons.add('failed_intervention');
 if(facts.state==='action_agreed'&&facts.targetDate&&facts.asOf&&businessDaysBetween(facts.targetDate,facts.asOf)>=POLICY.issues.overdueEscalationBusinessDays)reasons.add('action_overdue');
 return [...reasons];
}

export function escalationCopy(reason:EscalationReason):{requestedDecision:string;urgent:boolean}{
 if(reason==='retention_threat')return {requestedDecision:'Decide the retention or replacement response and confirm the responsible owner.',urgent:true};
 if(reason==='beyond_authority')return {requestedDecision:'Confirm the senior-led response and responsible owner for this incident.',urgent:true};
 if(reason==='failed_intervention')return {requestedDecision:'Review the failed intervention and approve the next recovery plan.',urgent:false};
 return {requestedDecision:'Review the overdue corrective action and confirm a revised accountable plan.',urgent:false};
}
