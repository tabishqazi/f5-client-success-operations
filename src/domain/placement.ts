import { DomainError } from './errors';
import { parseDate, trialReviewDate, validateTimeZone, compareDates } from './clock';
import { PLACEMENT_STATUSES, TRIAL_DECISIONS, type PlacementStatus, type TrialDecision } from './types';

export interface PlacementInput {
 clientId?: string; clientVersion?: number; professionalId?: string; ownerId: string;
 clientName: string; clientContactName: string; clientEmail: string; clientTimeZone: string;
 professionalName: string; role: string; location: string; professionalEmail: string; professionalTimeZone: string;
 startDate: string; trialEnd: string; status: PlacementStatus; trialDecision: TrialDecision;
}
export interface PlacementRecord {
 id: string; client_id: string; client_version: number; professional_id: string; owner_id: string;
 start_date: string; trial_end: string; status: PlacementStatus; trial_decision: TrialDecision; version: number;
 client_name: string; professional_name: string; role: string; location: string; owner_name: string;
 client_contact_name: string; client_email: string; client_time_zone: string;
 professional_email: string; professional_time_zone: string;
}
export function validateId(value: unknown): string {
 if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new DomainError('INVALID_RANGE','Invalid identifier');
 return value;
}
function text(value: unknown, max=180): string {
 if (typeof value !== 'string' || !value.trim() || value.trim().length>max) throw new DomainError('INVALID_RANGE','Required text is missing or too long');
 return value.trim();
}
function email(value: unknown): string {
 const result=text(value,254);
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new DomainError('INVALID_RANGE','Invalid email');
 return result;
}
export function validatePlacement(value: unknown, asOf: string): PlacementInput {
 if (!value || typeof value!=='object' || Array.isArray(value)) throw new DomainError('INVALID_RANGE','Invalid placement');
 const v=value as Record<string,unknown>;
 if (!PLACEMENT_STATUSES.includes(v.status as PlacementStatus) || !TRIAL_DECISIONS.includes(v.trialDecision as TrialDecision)) throw new DomainError('INVALID_RANGE','Invalid status');
 const startDate=parseDate(text(v.startDate)).toString(); const trialEnd=parseDate(text(v.trialEnd)).toString();
 trialReviewDate(startDate,trialEnd);
 if (v.status==='active' && compareDates(startDate,asOf)>0) throw new DomainError('INVALID_RANGE','A future placement must be scheduled');
 if ((v.status==='ended') !== (v.trialDecision==='end_placement')) throw new DomainError('INVALID_RANGE','Ended placement must record its end decision');
 return {
  clientId:v.clientId ? validateId(v.clientId):undefined, professionalId:v.professionalId ? validateId(v.professionalId):undefined, ownerId:validateId(v.ownerId),
  clientVersion: Number.isSafeInteger(v.clientVersion) && Number(v.clientVersion)>0 ? Number(v.clientVersion) : undefined,
  clientName:text(v.clientName),clientContactName:text(v.clientContactName),clientEmail:email(v.clientEmail),clientTimeZone:validateTimeZone(text(v.clientTimeZone)),
  professionalName:text(v.professionalName),role:text(v.role),location:text(v.location),professionalEmail:email(v.professionalEmail),professionalTimeZone:validateTimeZone(text(v.professionalTimeZone)),
  startDate,trialEnd,status:v.status as PlacementStatus,trialDecision:v.trialDecision as TrialDecision,
 };
}
