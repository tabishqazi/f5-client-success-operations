import { describe, expect, test } from 'vitest';
import { validatePlacement, type PlacementInput } from '../../src/domain/placement';
import { addCalendarDaysToInstant } from '../../src/domain/clock';
import { validatePlacementListQuery } from '../../src/domain/pagination';

const valid:PlacementInput={ownerId:'6d8c0961-f826-4d7c-b0db-7465d3a17c88',clientName:'Company',clientContactName:'Contact',clientEmail:'client@company.example',clientTimeZone:'America/New_York',professionalName:'Professional',role:'Engineer',location:'Pune',professionalEmail:'professional@talent.example',professionalTimeZone:'Asia/Kolkata',startDate:'2026-09-01',trialEnd:'2026-09-30',status:'active',trialDecision:'pending'};
describe('placement validation',()=>{
 test('preserves a valid contract and trims required text',()=>{
  expect(validatePlacement({...valid,professionalName:'  Professional  '},'2026-09-08')).toEqual(valid);
 });
 test.each([
  {trialEnd:'2026-08-31'}, {startDate:'2026-09-31'}, {startDate:'2026-09-09'},
  {clientEmail:'invalid'}, {professionalName:' '}, {professionalTimeZone:'Asia/Unknown'},
  {ownerId:'forged'}, {status:'unknown'}, {status:'ended'}, {trialDecision:'end_placement'},
 ])('rejects invalid input %j',change=>{expect(()=>validatePlacement({...valid,...change},'2026-09-08')).toThrow();});
 test('allows scheduled future starts and an explicit ended engagement',()=>{
  expect(validatePlacement({...valid,status:'scheduled',startDate:'2026-09-10'},'2026-09-08').status).toBe('scheduled');
  expect(validatePlacement({...valid,status:'ended',trialDecision:'end_placement'},'2026-09-08').status).toBe('ended');
 });
 test('session calendar expiry preserves local time through DST',()=>{
  expect(addCalendarDaysToInstant('2026-03-07T15:00:00Z',7)).toBe('2026-03-14T14:00:00Z');
 });
});
describe('placement list query',()=>{
 test('uses bounded defaults and trims search',()=>{
  expect(validatePlacementListQuery({search:'  client  '})).toEqual({page:1,pageSize:9,search:'client'});
 });
 test.each([{page:0},{page:'one'},{pageSize:101},{search:'x'.repeat(121)}])('rejects an unsafe list query %j',query=>{
  expect(()=>validatePlacementListQuery(query)).toThrow();
 });
});
