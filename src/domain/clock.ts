import { Temporal } from "@js-temporal/polyfill";
import { DomainError } from "./errors";
import { POLICY } from "./policy";
import type { ClockConfig, ClockSource, ResolvedClock, TrialDecision, TrialStatus } from "./types";

export function parseDate(value: string): Temporal.PlainDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError("INVALID_DATE", "Use an ISO calendar date.");
  try { return Temporal.PlainDate.from(value, { overflow: "reject" }); }
  catch { throw new DomainError("INVALID_DATE", "The calendar date does not exist."); }
}

function integer(value: number, minimum = -10000, maximum = 10000): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DomainError("INVALID_RANGE", "The date offset is outside the supported range.");
  }
}

export function compareDates(a: string, b: string): number {
  return Temporal.PlainDate.compare(parseDate(a), parseDate(b));
}

export function addCalendarDays(value: string, days: number): string {
  integer(days);
  return parseDate(value).add({ days }).toString();
}

export function isBusinessDay(value: string): boolean {
  return parseDate(value).dayOfWeek <= 5;
}

export function addBusinessDays(value: string, amount: number): string {
  integer(amount);
  let date = parseDate(value);
  let remaining = Math.abs(amount);
  const direction = Math.sign(amount);
  while (remaining > 0) {
    date = date.add({ days: direction });
    if (date.dayOfWeek <= 5) remaining--;
  }
  return date.toString();
}

export function nextBusinessDay(value: string): string {
  let date = parseDate(value);
  while (date.dayOfWeek > 5) date = date.add({ days: 1 });
  return date.toString();
}

// Excludes start and includes end. Reverse order returns the negated forward interval.
export function businessDaysBetween(start: string, end: string): number {
  if (compareDates(start, end) > 0) return -businessDaysBetween(end, start);
  let cursor = parseDate(start);
  const last = parseDate(end);
  const span = cursor.until(last).days;
  integer(span, 0, 10000);
  let count = 0;
  while (Temporal.PlainDate.compare(cursor, last) < 0) {
    cursor = cursor.add({ days: 1 });
    if (cursor.dayOfWeek <= 5) count++;
  }
  return count;
}

export function monthlyAnniversary(anchor: string, monthOffset: number): string {
  integer(monthOffset, 0, 1200);
  // Always add to the original anchor, never the previously clamped occurrence.
  return parseDate(anchor).add({ months: monthOffset }, { overflow: "constrain" }).toString();
}

export function validateTimeZone(zone: string): string {
  if (zone !== "UTC" && !/^[A-Za-z_]+\/[A-Za-z_+\-/]+$/.test(zone)) {
    throw new DomainError("INVALID_TIME_ZONE", "A named IANA time zone is required.");
  }
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0); }
  catch { throw new DomainError("INVALID_TIME_ZONE", "Unknown time zone."); }
  return zone;
}

export function localDateTimeToInstant(date: string, time: string, zone: string = POLICY.time.operationsZone): string {
  const day = parseDate(date);
  validateTimeZone(zone);
  if (!/^\d{2}:\d{2}$/.test(time)) throw new DomainError("INVALID_TIME", "Use HH:mm.");
  try {
    const local = day.toPlainDateTime(Temporal.PlainTime.from(time, { overflow: "reject" }));
    // Refuse to silently shift a nonexistent time or pick one side of a repeated hour.
    return local.toZonedDateTime(zone, { disambiguation: "reject" }).toInstant().toString();
  } catch { throw new DomainError("INVALID_TIME", "The local time is invalid or ambiguous."); }
}

function parseInstant(value: string): Temporal.Instant {
  try { return Temporal.Instant.from(value); }
  catch { throw new DomainError("INVALID_INSTANT", "An explicit UTC offset is required."); }
}

export function dateInTimeZone(instant: string, zone: string = POLICY.time.operationsZone): string {
  validateTimeZone(zone);
  return parseInstant(instant).toZonedDateTimeISO(zone).toPlainDate().toString();
}

export function addCalendarDaysToInstant(instant: string, days: number, zone: string = POLICY.time.operationsZone): string {
  integer(days);
  validateTimeZone(zone);
  return parseInstant(instant).toZonedDateTimeISO(zone).add({ days }).toInstant().toString();
}

export function routineDueAt(date: string): string {
  return localDateTimeToInstant(nextBusinessDay(date), POLICY.time.routineDueTime);
}

export function trialReviewDate(start: string, trialEnd: string): string {
  if (compareDates(trialEnd, start) < 0) throw new DomainError("INVALID_RANGE", "Trial end cannot precede the start date.");
  const review = addBusinessDays(trialEnd, -POLICY.trial.reviewLeadBusinessDays);
  return compareDates(review, start) < 0 ? start : review;
}

export function getTrialStatus(start: string, trialEnd: string, asOf: string, decision: TrialDecision): TrialStatus {
  trialReviewDate(start, trialEnd); // Validate the contractual dates.
  if (decision === "end_placement") return "ended";
  if (compareDates(asOf, start) < 0) return "not_started";
  if (decision === "continue") return "continued";
  // "extend" must come with the new explicit trialEnd; expired extensions remain undecided.
  return compareDates(asOf, trialEnd) >= 0 ? "decision_due" : "in_trial";
}

export function businessDeadline(instant: string, businessDays: number, zone: string = POLICY.time.operationsZone): string {
  validateTimeZone(zone);
  const local = parseInstant(instant).toZonedDateTimeISO(zone);
  const date = parseDate(addBusinessDays(local.toPlainDate().toString(), businessDays));
  const result = date.toPlainDateTime(local.toPlainTime()).toZonedDateTime(zone, { disambiguation: "reject" });
  return result.toInstant().toString();
}

export function responseDeadline(firstRequestedAt: string): string {
  return businessDeadline(firstRequestedAt, POLICY.feedback.responseBusinessDays);
}

export function verificationDeadlines(reportedFixAt: string): { initial: string; sustained: string } {
  return {
    initial: businessDeadline(reportedFixAt, POLICY.issues.verificationBusinessDays[0]),
    sustained: businessDeadline(reportedFixAt, POLICY.issues.verificationBusinessDays[1]),
  };
}

export function resolveClock(config: ClockConfig, serverClock: ClockSource): ResolvedClock {
  const instant = config.mode === "demo"
    ? localDateTimeToInstant(config.date, POLICY.time.demoTime)
    : parseInstant(serverClock.now()).toString();
  return { mode: config.mode, instant, operationsDate: dateInTimeZone(instant), timeZone: POLICY.time.operationsZone };
}
