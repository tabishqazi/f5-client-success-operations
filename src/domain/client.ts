import type { HealthStatus, PlacementStatus } from './types';

export type ClientAttentionStatus = HealthStatus | 'inactive';

export interface ClientAttention {
  status: ClientAttentionStatus;
  label: string;
  explanation: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  owner_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  time_zone: string;
  active_placements: number;
  scheduled_placements: number;
  ended_placements: number;
  total_placements: number;
  open_issues: number;
  open_obligations: number;
  next_due_at: string | null;
  last_contact_at: string | null;
  attention: ClientAttention;
}

export interface ClientPlacementSummary {
  id: string;
  professional_name: string;
  role: string;
  location: string;
  status: PlacementStatus;
  start_date: string;
  trial_end: string;
  health: ClientAttention;
}

export interface ClientDetail {
  client: {
    id: string;
    name: string;
    owner_name: string;
    cadence_anchor: string;
    contacts: { id: string; name: string; email: string; phone: string | null; time_zone: string }[];
  };
  attention: ClientAttention;
  placements: ClientPlacementSummary[];
  obligations: { id: string; type: string; due_at: string; next_contact_at: string | null; professional_name: string | null }[];
  interactions: { id: string; direction: string; channel: string; outcome: string; notes: string; occurred_at: string; contact_name: string; professionals: string[] }[];
  feedback: { id: string; assessment: string; rating: number | null; notes: string; received_at: string; channel: string; placement_id: string; professional_name: string }[];
  issues: { id: string; description: string; state: string; severity: string; category: string; placement_id: string; professional_name: string; created_at: string }[];
  seniorReviews: { id: string; issue_id: string; state: string; reason: string; requested_decision: string; evidence: string; due_at: string; owner_name: string; placement_id: string; professional_name: string }[];
}
