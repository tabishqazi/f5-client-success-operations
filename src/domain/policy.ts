import type { Priority, RuleId } from "./types";

export const POLICY = {
  version: "v1",
  time: { operationsZone: "America/New_York", routineDueTime: "17:00", demoTime: "09:00", holidaysExcluded: false },
  demo: { referenceDate: "2026-09-08", sessionLifetimeDays: 7 },
  trial: { sampleLengthCalendarDays: 30, reviewLeadBusinessDays: 3 },
  feedback: { earlyCareCalendarDays: 90, earlyOffsets: [3, 7, 14, 28, 42, 56, 70, 84], responseBusinessDays: 2, silenceUrgentBusinessDays: 5, lowRatingMaximum: 2, clarificationRating: 3 },
  checkIns: { intervalMonths: 1, earlyCoverageCalendarDays: 7 },
  issues: { triageBusinessDays: 1, verificationBusinessDays: [3, 10], overdueEscalationBusinessDays: 2 },
  rescheduling: { maximumBusinessDays: 2, overduePromotionBusinessDays: 5 },
  scheduling: { forwardHorizonCalendarDays: 45 },
} as const;

export const PRIORITIES: ReadonlyArray<{ id: Priority; label: string; description: string }> = [
  { id: "P0", label: "Immediate", description: "Cancellation, replacement or departure intent; serious service interruption; urgent senior review." },
  { id: "P1", label: "Urgent", description: `Trial risk, failed verification, action overdue by ${POLICY.issues.overdueEscalationBusinessDays} business days, or client silence after ${POLICY.feedback.silenceUrgentBusinessDays} business days.` },
  { id: "P2", label: "Follow up", description: "Overdue feedback and monthly calls, or corrective actions and verification due today." },
  { id: "P3", label: "Routine", description: "Scheduled feedback, monthly check-ins and trial reviews due today without a higher-risk reason." },
];

export interface OperatingRule { id: RuleId; title: string; summary: string; details: readonly string[] }

// Both the read-only Rules view and future services use this same versioned policy.
export function getOperatingRules(): OperatingRule[] {
  return [
    { id: "A01", title: "One operating calendar", summary: "Due work follows U.S. Eastern time. Contact times stay local.", details: [
      `Routine deadlines are ${POLICY.time.routineDueTime} U.S. Eastern time. Business days are Monday to Friday, including public holidays.`,
      "Routine weekend dates move to Monday. Monthly check-ins keep their original day, or the last day of a shorter month. Trial end dates do not move.",
    ] },
    { id: "A02", title: "Closer attention at the start", summary: `Extra attention for the first ${POLICY.feedback.earlyCareCalendarDays} days, with a separate trial deadline.`, details: [
      `Use the trial end recorded for each placement. Review it ${POLICY.trial.reviewLeadBusinessDays} business days beforehand, or on the start date for shorter trials.`,
      "A trial ends with a recorded decision to continue, extend or end the placement. Passing the date alone does not imply client approval. Ended placements stop future routine work and retain unresolved issue history.",
    ] },
    { id: "A03", title: "Feedback on a schedule", summary: "A contact attempt never counts as received feedback.", details: [
      `Early feedback is due ${POLICY.feedback.earlyOffsets.join(", ")} calendar days after the start. After day ${POLICY.feedback.earlyCareCalendarDays}, use monthly placement anniversaries.`,
      `Before a request is sent, missed collection is outreach overdue. After the first request, allow ${POLICY.feedback.responseBusinessDays} business days for a response. At ${POLICY.feedback.silenceUrgentBusinessDays} business days without a response, raise urgency. Reminders do not restart this clock.`,
      "Missed feedback remains due. Discuss related follow-ups in the same call and record which ones were addressed.",
    ] },
    { id: "A04", title: "Health needs evidence", summary: "No complaint does not automatically mean a healthy placement.", details: [
      "Record client, placement, date, channel, exact feedback and a satisfaction assessment. Feedback for one professional does not cover the entire client account.",
      `Ratings 1-${POLICY.feedback.lowRatingMaximum} or explicit concerns start triage. A rating of ${POLICY.feedback.clarificationRating} needs clarification. Positive feedback may support verification, but cannot automatically close an issue.`,
      "Show At risk for unresolved dissatisfaction, Needs attention for overdue work or operational concerns, Unknown when feedback is absent, and Healthy only for current positive feedback with no active concern.",
    ] },
    { id: "A05", title: "Make time for both sides", summary: "Client and professional monthly check-ins are separate obligations.", details: [
      `Check in every ${POLICY.checkIns.intervalMonths} month from the relationship start date. A conversation can cover overdue check-ins or those due within ${POLICY.checkIns.earlyCoverageCalendarDays} calendar days when their subjects were actually discussed.`,
      "One client call may cover multiple placements with separate feedback for each. It cannot complete a professional's one-to-one. Late completion does not move future anniversaries.",
    ] },
    { id: "A06", title: "Verify that the fix holds", summary: `Check a reported fix after ${POLICY.issues.verificationBusinessDays[0]} and ${POLICY.issues.verificationBusinessDays[1]} business days.`, details: [
      `Review concerns within ${POLICY.issues.triageBusinessDays} business day, or today for a serious interruption. Agree who is responsible, what must change, the due date and how improvement will be checked.`,
      "Fix reported begins monitoring. Each check needs its own observation and evidence; no response stays inconclusive. The final check requires confirmation from the affected side.",
      "Close only after both checks confirm the latest fix held. If the problem returns, reopen the issue and arrange fresh checks after the next fix.",
    ] },
    { id: "A07", title: "Escalate with a reason", summary: "First complaints stay with the manager. Failed intervention needs senior review.", details: [
      `Escalate cancellation, replacement or departure intent; failed intervention or recurrence; an action ${POLICY.issues.overdueEscalationBusinessDays} business days overdue without a revised plan; or an incident explicitly beyond the manager's authority.`,
      "Assign urgent cases today and other senior reviews by the next business day. Record the evidence and decision needed. The manager retains responsibility until handoff is acknowledged; escalation never closes an issue.",
    ] },
    { id: "A08", title: "Keep priorities explainable", summary: "Show the reason, original deadline and next action for every contact.", details: [
      `Prioritize Immediate, Urgent, Follow up, then Routine; within a band, use deadline and age. Promote ordinary overdue work after ${POLICY.rescheduling.overduePromotionBusinessDays} business days.`,
      `Normal rescheduling requires a reason and a time within ${POLICY.rescheduling.maximumBusinessDays} business days. Keep the original deadline. It cannot hide immediate work, erase silence, or move a trial end.`,
      "A single call can address several follow-ups, but each needs its own recorded outcome. A new urgent concern may require contact before an existing appointment.",
    ] },
  ];
}
