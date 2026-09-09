import type { FeedbackAssessment,HealthStatus } from './types';

export interface HealthFacts {latestAssessment?:FeedbackAssessment|null;latestRating?:number|null;hasActiveIssue:boolean;hasCriticalIssue:boolean;hasOverdueFeedback:boolean}
export interface HealthResult {status:HealthStatus;label:string;explanation:string}

export function evaluateHealth(facts:HealthFacts):HealthResult{
 if(facts.latestAssessment==='unsatisfied'||facts.hasCriticalIssue)return {status:'at_risk',label:'At risk',explanation:'Current client evidence or an unresolved serious issue puts this placement at risk.'};
 if(facts.latestAssessment==='concerned'||facts.latestRating===3||facts.hasActiveIssue||facts.hasOverdueFeedback)return {status:'needs_attention',label:'Needs attention',explanation:'Follow-up or an active concern still needs attention.'};
 if(!facts.latestAssessment)return {status:'unknown',label:'Unknown',explanation:'Current client feedback has not been recorded.'};
 return {status:'healthy',label:'Healthy',explanation:'Current client feedback is positive and no active concern is recorded.'};
}
