import { DomainError } from './errors';
import { parseDate } from './clock';
import { FEEDBACK_ASSESSMENTS,INTERACTION_OUTCOMES, type ContactChannel,type FeedbackAssessment,type InteractionDirection,type InteractionOutcome } from './types';
import { validateId } from './placement';

export interface FeedbackOutcomeInput {placementId:string;assessment:FeedbackAssessment;rating:number|null;notes:string}
export interface ContactOutcomeInput {
 contactId:string;direction:InteractionDirection;channel:ContactChannel;outcome:InteractionOutcome;notes:string;
 obligationIds:string[];rescheduleDate?:string;feedback:FeedbackOutcomeInput[];
}

function requiredText(value:unknown,max:number){
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new DomainError('INVALID_RANGE','Required text is missing or too long');
 return value.trim();
}

export function validateContactOutcome(value:unknown):ContactOutcomeInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new DomainError('INVALID_RANGE','Invalid contact outcome');
 const item=value as Record<string,unknown>;
 if(item.direction!=='inbound'&&item.direction!=='outbound')throw new DomainError('INVALID_RANGE','Invalid direction');
 if(!['phone','email','meeting','other'].includes(String(item.channel)))throw new DomainError('INVALID_RANGE','Invalid channel');
 if(!INTERACTION_OUTCOMES.includes(item.outcome as InteractionOutcome))throw new DomainError('INVALID_RANGE','Invalid outcome');
 if(item.outcome==='no_answer'&&item.direction!=='outbound')throw new DomainError('INVALID_TRANSITION','An inbound contact cannot be unanswered');
 if(!Array.isArray(item.obligationIds)||item.obligationIds.length>50)throw new DomainError('INVALID_RANGE','Invalid obligation selection');
 const obligationIds=[...new Set(item.obligationIds.map(validateId))];
 if(obligationIds.length!==item.obligationIds.length)throw new DomainError('INVALID_RANGE','Duplicate obligation selection');
 const feedbackRaw=Array.isArray(item.feedback)?item.feedback:[];
 if(feedbackRaw.length>20)throw new DomainError('INVALID_RANGE','Too many feedback records');
 const feedback=feedbackRaw.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DomainError('INVALID_RANGE','Invalid feedback');
  const entry=raw as Record<string,unknown>;const placementId=validateId(entry.placementId);
  if(!FEEDBACK_ASSESSMENTS.includes(entry.assessment as FeedbackAssessment))throw new DomainError('INVALID_RANGE','Invalid feedback');
  const rating=entry.rating===null||entry.rating===undefined||entry.rating===''?null:Number(entry.rating);
  if(rating!==null&&(!Number.isSafeInteger(rating)||rating<1||rating>5))throw new DomainError('INVALID_RANGE','Invalid rating');
  return {placementId,assessment:entry.assessment as FeedbackAssessment,rating,notes:requiredText(entry.notes,2000)};
 });
 if(new Set(feedback.map(entry=>entry.placementId)).size!==feedback.length)throw new DomainError('INVALID_RANGE','Duplicate feedback');
 if(item.outcome!=='reached'&&feedback.length)throw new DomainError('INVALID_TRANSITION','Feedback requires a reached contact');
 let rescheduleDate: string|undefined;
 if(item.outcome==='rescheduled')rescheduleDate=parseDate(requiredText(item.rescheduleDate,10)).toString();
 else if(item.rescheduleDate)throw new DomainError('INVALID_RANGE','Unexpected reschedule date');
 return {contactId:validateId(item.contactId),direction:item.direction as InteractionDirection,channel:item.channel as ContactChannel,outcome:item.outcome as InteractionOutcome,notes:requiredText(item.notes,2000),obligationIds,rescheduleDate,feedback};
}
