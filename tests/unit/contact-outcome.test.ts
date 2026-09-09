import { describe,expect,test } from 'vitest';
import { validateContactOutcome } from '../../src/domain/contact-outcome';
import { evaluateHealth } from '../../src/domain/health';

const contactId='11111111-1111-4111-8111-111111111111';
const obligationId='22222222-2222-4222-8222-222222222222';
const placementId='33333333-3333-4333-8333-333333333333';
const base={contactId,direction:'outbound',channel:'phone',outcome:'reached',notes:'Discussed current delivery.',obligationIds:[obligationId],feedback:[]} as const;

describe('contact outcome validation',()=>{
 test('accepts explicit placement feedback and preserves evidence',()=>{
  const result=validateContactOutcome({...base,feedback:[{placementId,assessment:'satisfied',rating:5,notes:'The client confirmed delivery is strong.'}]});
  expect(result.feedback[0]).toMatchObject({assessment:'satisfied',rating:5});
 });
 test('allows an incoming reached conversation',()=>expect(validateContactOutcome({...base,direction:'inbound'}).direction).toBe('inbound'));
 test('rejects an inbound no-answer outcome',()=>expect(()=>validateContactOutcome({...base,direction:'inbound',outcome:'no_answer'})).toThrow(/inbound/i));
 test('requires a valid reschedule date and unique coverage',()=>{
  expect(()=>validateContactOutcome({...base,outcome:'rescheduled'})).toThrow();
  expect(()=>validateContactOutcome({...base,obligationIds:[obligationId,obligationId]})).toThrow(/duplicate/i);
 });
 test('rejects feedback unless the contact was reached',()=>expect(()=>validateContactOutcome({...base,outcome:'no_answer',feedback:[{placementId,assessment:'satisfied',rating:5,notes:'Evidence'}]})).toThrow(/reached/i));
});

describe('placement health',()=>{
 test('marks current positive evidence with no open concern healthy',()=>expect(evaluateHealth({latestAssessment:'satisfied',hasActiveIssue:false,hasCriticalIssue:false,hasOverdueFeedback:false}).status).toBe('healthy'));
 test('keeps a neutral rating in follow-up even with a satisfied assessment',()=>expect(evaluateHealth({latestAssessment:'satisfied',latestRating:3,hasActiveIssue:false,hasCriticalIssue:false,hasOverdueFeedback:false}).status).toBe('needs_attention'));
 test('does not infer health without feedback',()=>expect(evaluateHealth({hasActiveIssue:false,hasCriticalIssue:false,hasOverdueFeedback:false}).status).toBe('unknown'));
 test('makes dissatisfaction at risk and overdue work attention',()=>{
  expect(evaluateHealth({latestAssessment:'unsatisfied',hasActiveIssue:false,hasCriticalIssue:false,hasOverdueFeedback:false}).status).toBe('at_risk');
  expect(evaluateHealth({latestAssessment:'satisfied',hasActiveIssue:false,hasCriticalIssue:false,hasOverdueFeedback:true}).status).toBe('needs_attention');
 });
});
