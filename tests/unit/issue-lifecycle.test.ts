import { describe,expect,test } from 'vitest';
import { escalationCopy,evaluateEscalations,validateIssueCommand,validateIssueCreate } from '../../src/domain/issue-lifecycle';

const id='11111111-1111-4111-8111-111111111111';

describe('issue lifecycle validation',()=>{
 test('accepts reports from either operational side',()=>{
  const base={placementId:id,category:'attendance',severity:'high',description:'Two shift starts were missed.',escalationTrigger:'none'};
  expect(validateIssueCreate({...base,reporterSide:'client'}).reporterSide).toBe('client');
  expect(validateIssueCreate({...base,reporterSide:'professional'}).reporterSide).toBe('professional');
 });
 test('requires a complete action with a current or future target',()=>{
  const action={type:'agree_action',version:1,actionOwner:'Riley',agreedAction:'Confirm each shift start.',verificationCriteria:'No missed starts.',targetDate:'2026-09-07'};
  expect(()=>validateIssueCommand(action,'2026-09-08')).toThrow(/past/i);
  expect(validateIssueCommand({...action,targetDate:'2026-09-08'},'2026-09-08')).toMatchObject({type:'agree_action',actionOwner:'Riley'});
 });
 test('requires evidence for a reported fix and verification',()=>{
  expect(()=>validateIssueCommand({type:'report_fix',version:2,evidence:'   '},'2026-09-08')).toThrow();
  expect(validateIssueCommand({type:'record_verification',version:3,verificationId:id,result:'inconclusive',confirmerSide:'client',evidence:'Client did not have enough observation time.'},'2026-09-08')).toMatchObject({result:'inconclusive'});
 });
});

describe('senior review policy',()=>{
 test('selects explicit, failed and recurrence triggers centrally',()=>{
  expect(evaluateEscalations({explicit:'retention_threat'})).toEqual(['retention_threat']);
  expect(evaluateEscalations({verificationFailed:true,recurrence:true})).toEqual(['failed_intervention']);
 });
 test('escalates an action after two business days without shifting the threshold over a weekend',()=>{
  expect(evaluateEscalations({state:'action_agreed',targetDate:'2026-09-04',asOf:'2026-09-08'})).toEqual(['action_overdue']);
  expect(evaluateEscalations({state:'action_agreed',targetDate:'2026-09-04',asOf:'2026-09-07'})).toEqual([]);
 });
 test('marks retention and authority reviews urgent',()=>{
  expect(escalationCopy('retention_threat').urgent).toBe(true);
  expect(escalationCopy('beyond_authority').urgent).toBe(true);
  expect(escalationCopy('failed_intervention').urgent).toBe(false);
 });
});
