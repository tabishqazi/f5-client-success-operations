import { describe,expect,test } from 'vitest';
import { evaluateObligation,feedbackOccurrences,groupQueue,localContactState,monthlyOccurrences,type QueueItem } from '../../src/domain/evaluate';

describe('schedule occurrence identity',()=>{
 test('keeps every early feedback milestone and starts mature cadence strictly after day 90',()=>{
  const results=feedbackOccurrences('2026-01-31','2026-06-01');
  expect(results.slice(0,8).map(item=>item.key)).toEqual(['early-3','early-7','early-14','early-28','early-42','early-56','early-70','early-84']);
  expect(results.at(-1)).toEqual({date:'2026-05-31',key:'month-4'});
 });
 test('derives short-month occurrences from the original anchor',()=>{
  expect(monthlyOccurrences('2026-01-31','2026-03-31')).toEqual([{date:'2026-02-28',key:'month-1'},{date:'2026-03-31',key:'month-2'}]);
 });
});

describe('priority explanations',()=>{
 const base={obligationId:'o1',dueAt:'2026-09-01T21:00:00Z',asOf:'2026-09-08'} as const;
 test('distinguishes outreach overdue from client silence',()=>{
  expect(evaluateObligation({...base,type:'client_feedback'})).toMatchObject({priority:'P1',explanation:expect.stringContaining('overdue')});
  expect(evaluateObligation({...base,type:'client_feedback',firstRequestedAt:'2026-09-01T14:00:00Z'})).toMatchObject({priority:'P1',explanation:expect.stringContaining('after the first request')});
 });
 test('places retention senior review ahead of routine work',()=>{
  expect(evaluateObligation({...base,type:'senior_review',escalationReason:'retention_threat'})).toMatchObject({priority:'P0'});
  expect(evaluateObligation({...base,type:'professional_monthly',dueAt:'2026-09-08T21:00:00Z'})).toMatchObject({priority:'P3'});
 });
 test('raises missing trial feedback and overdue corrective action',()=>{
  expect(evaluateObligation({...base,type:'client_feedback',trialStart:'2026-08-12',trialEnd:'2026-09-11',trialDecision:'pending'}).priority).toBe('P1');
  expect(evaluateObligation({...base,type:'corrective_action'}).priority).toBe('P1');
 });
});

test('grouping retains every obligation and uses the highest priority',()=>{
 const common={contactId:'c1',contactName:'Maya Chen',contactSide:'client',contactEmail:'maya@example.test',contactZone:'America/New_York',clientName:'Northstar',professionalName:'Daniel',placementId:'p1',trialEnd:'2026-09-11',bucket:'now',localTime:'Tue, 10:00 AM'} as const;
 const items:QueueItem[]=[{...common,obligationId:'o1',type:'client_feedback',dueAt:'2026-09-01T21:00:00Z',scheduledAt:'2026-09-01T21:00:00Z',priority:'P1',reason:'Feedback missing.'},{...common,obligationId:'o2',type:'client_monthly',dueAt:'2026-09-05T21:00:00Z',scheduledAt:'2026-09-05T21:00:00Z',priority:'P2',reason:'Monthly review overdue.'}];
 const [card]=groupQueue(items);expect(card?.priority).toBe('P1');expect(card?.reasons.map(r=>r.obligationId)).toEqual(['o1','o2']);expect(card?.oldestDueAt).toBe(items[0]!.dueAt);
});

test('contact availability uses the contact zone',()=>{
 expect(localContactState('2026-09-08T14:00:00Z','America/New_York').bucket).toBe('now');
 expect(localContactState('2026-09-08T10:00:00Z','America/New_York').bucket).toBe('later');
 expect(localContactState('2026-09-12T14:00:00Z','America/New_York').bucket).toBe('upcoming');
});
