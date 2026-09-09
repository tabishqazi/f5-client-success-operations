export const PLACEMENT_STATUSES = ["scheduled", "active", "ended"] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const TRIAL_DECISIONS = ["pending", "continue", "extend", "end_placement"] as const;
export type TrialDecision = (typeof TRIAL_DECISIONS)[number];
export type TrialStatus = "not_started" | "in_trial" | "decision_due" | "continued" | "ended";

export const CONTACT_SIDES = ["client", "professional", "senior"] as const;
export type ContactSide = (typeof CONTACT_SIDES)[number];
export const INTERACTION_OUTCOMES = ["reached", "no_answer", "rescheduled"] as const;
export type InteractionOutcome = (typeof INTERACTION_OUTCOMES)[number];
export type InteractionDirection = "inbound" | "outbound";
export type ContactChannel = "phone" | "email" | "meeting" | "other";

export const FEEDBACK_ASSESSMENTS = ["satisfied", "concerned", "unsatisfied"] as const;
export type FeedbackAssessment = (typeof FEEDBACK_ASSESSMENTS)[number];
export type HealthStatus = "at_risk" | "needs_attention" | "unknown" | "healthy";

export const ISSUE_STATES = ["open", "action_agreed", "monitoring", "reopened", "verified_closed"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];
export const ISSUE_CATEGORIES = ["performance", "attendance", "communication", "client_relationship", "professional_concern", "other"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type VerificationResult = "pass" | "fail" | "inconclusive";
export type VerificationWindow = "initial" | "sustained";
export type EscalationState = "pending_acknowledgment" | "acknowledged" | "decision_recorded";
export type EscalationReason = "retention_threat" | "failed_intervention" | "action_overdue" | "beyond_authority";

export const OBLIGATION_TYPES = ["trial_review", "client_feedback", "client_monthly", "professional_monthly", "issue_triage", "corrective_action", "verification", "senior_review"] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];
export type ObligationState = "open" | "satisfied" | "superseded" | "canceled";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type RuleId = "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08";

export type ClockConfig = { mode: "live" } | { mode: "demo"; date: string };
export interface ClockSource { now(): string }
export interface ResolvedClock {
  mode: ClockConfig["mode"];
  instant: string;
  operationsDate: string;
  timeZone: string;
}

// The evaluator produces evidence-bearing reasons rather than an opaque score.
export interface PriorityReason {
  ruleId: RuleId;
  priority: Priority;
  explanation: string;
  obligationId: string;
}
