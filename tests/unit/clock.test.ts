import { describe, expect, it } from "vitest";
import {
  addBusinessDays, addCalendarDays, businessDaysBetween, businessDeadline,
  dateInTimeZone, getTrialStatus, localDateTimeToInstant, monthlyAnniversary,
  nextBusinessDay, parseDate, resolveClock, responseDeadline, routineDueAt,
  trialReviewDate, validateTimeZone, verificationDeadlines,
} from "../../src/domain/clock";
import { DomainError } from "../../src/domain/errors";

describe("calendar validation", () => {
  it.each(["2026-02-29", "2026-13-01", "2026-1-01", "09/08/2026", "2026-09-08T00:00:00Z"])("rejects invalid date %s", (date) => {
    expect(() => parseDate(date)).toThrow(DomainError);
  });
  it("accepts leap day without local-machine conversion", () => expect(parseDate("2028-02-29").toString()).toBe("2028-02-29"));
  it("crosses month and year boundaries with calendar arithmetic", () => expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01"));
  it.each([1.5, NaN, Infinity, 10001])("rejects unbounded/fractional business offset %s", (offset) => {
    expect(() => addBusinessDays("2026-09-08", offset)).toThrow(DomainError);
  });
});

describe("business dates", () => {
  it("skips the weekend forwards and backwards", () => {
    expect(addBusinessDays("2026-09-11", 2)).toBe("2026-09-15");
    expect(addBusinessDays("2026-09-14", -3)).toBe("2026-09-09");
  });
  it("treats zero as no movement, leaving rolling explicit", () => {
    expect(addBusinessDays("2026-09-12", 0)).toBe("2026-09-12");
    expect(nextBusinessDay("2026-09-12")).toBe("2026-09-14");
    expect(nextBusinessDay("2026-09-14")).toBe("2026-09-14");
  });
  it("excludes the start date and weekends from overdue age", () => {
    expect(businessDaysBetween("2026-09-11", "2026-09-14")).toBe(1);
    expect(businessDaysBetween("2026-09-11", "2026-09-13")).toBe(0);
    expect(businessDaysBetween("2026-09-14", "2026-09-11")).toBe(-1);
    expect(businessDaysBetween("2026-09-14", "2026-09-14")).toBe(0);
  });
  it("does not silently exclude public holidays", () => expect(addBusinessDays("2026-09-04", 1)).toBe("2026-09-07"));
});

describe("monthly anchors", () => {
  it("clamps February but restores the original January 31 anchor in March", () => {
    expect(monthlyAnniversary("2026-01-31", 1)).toBe("2026-02-28");
    expect(monthlyAnniversary("2026-01-31", 2)).toBe("2026-03-31");
  });
  it("handles leap years and year rollover", () => {
    expect(monthlyAnniversary("2028-01-31", 1)).toBe("2028-02-29");
    expect(monthlyAnniversary("2026-12-31", 1)).toBe("2027-01-31");
  });
  it("rolls the occurrence independently of the anchor", () => {
    expect(routineDueAt(monthlyAnniversary("2026-01-31", 1))).toBe("2026-03-02T22:00:00Z");
    expect(routineDueAt(monthlyAnniversary("2026-01-31", 2))).toBe("2026-03-31T21:00:00Z");
  });
  it("rejects negative occurrence indexes", () => expect(() => monthlyAnniversary("2026-01-31", -1)).toThrow(DomainError));
});

describe("trial contracts", () => {
  it("counts three business days back without moving a Sunday trial end", () => expect(trialReviewDate("2026-08-15", "2026-09-13")).toBe("2026-09-09"));
  it("clamps a short trial review to its start date", () => expect(trialReviewDate("2026-09-10", "2026-09-11")).toBe("2026-09-10"));
  it("rejects a trial ending before placement start", () => expect(() => trialReviewDate("2026-09-11", "2026-09-10")).toThrow(DomainError));
  it("does not turn an expired trial into a client acceptance", () => {
    expect(getTrialStatus("2026-08-10", "2026-09-10", "2026-09-09", "pending")).toBe("in_trial");
    expect(getTrialStatus("2026-08-10", "2026-09-10", "2026-09-10", "pending")).toBe("decision_due");
    expect(getTrialStatus("2026-08-10", "2026-09-10", "2026-09-11", "continue")).toBe("continued");
  });
  it("uses the explicit extended date and supports scheduled/ended states", () => {
    expect(getTrialStatus("2026-09-10", "2026-10-25", "2026-10-20", "extend")).toBe("in_trial");
    expect(getTrialStatus("2026-09-10", "2026-10-25", "2026-09-09", "pending")).toBe("not_started");
    expect(getTrialStatus("2026-09-10", "2026-10-25", "2026-10-20", "end_placement")).toBe("ended");
  });
});

describe("time zones and observation windows", () => {
  it("uses the operations day when UTC has already crossed midnight", () => {
    expect(dateInTimeZone("2026-09-09T01:00:00Z")).toBe("2026-09-08");
    expect(dateInTimeZone("2026-09-09T01:00:00Z", "Asia/Kolkata")).toBe("2026-09-09");
  });
  it("preserves the local deadline across spring DST", () => expect(businessDeadline("2026-03-06T22:00:00Z", 1)).toBe("2026-03-09T21:00:00Z"));
  it("preserves the local deadline across autumn DST", () => expect(businessDeadline("2026-10-30T21:00:00Z", 1)).toBe("2026-11-02T22:00:00Z"));
  it("sets routine Saturday work to Monday at 17:00 Eastern", () => expect(routineDueAt("2026-09-12")).toBe("2026-09-14T21:00:00Z"));
  it("starts the response deadline from the first request at the same local time", () => expect(responseDeadline("2026-09-11T14:30:00Z")).toBe("2026-09-15T14:30:00Z"));
  it("creates distinct three- and ten-business-day windows", () => {
    expect(verificationDeadlines("2026-09-11T16:00:00Z")).toEqual({ initial: "2026-09-16T16:00:00Z", sustained: "2026-09-25T16:00:00Z" });
  });
  it.each(["02:30", "25:00", "9:00"])("rejects invalid or nonexistent local time %s", (time) => {
    expect(() => localDateTimeToInstant("2026-03-08", time)).toThrow(DomainError);
  });
  it("rejects the repeated autumn hour instead of guessing", () => expect(() => localDateTimeToInstant("2026-11-01", "01:30")).toThrow(DomainError));
  it.each(["+05:30", "Not/A_Zone", "EST"])("rejects fixed/ambiguous zone %s", (zone) => expect(() => validateTimeZone(zone)).toThrow(DomainError));
  it("rejects timestamps without an explicit offset", () => expect(() => dateInTimeZone("2026-09-08T12:00:00")).toThrow(DomainError));
});

describe("server-owned clock", () => {
  it("uses only the supplied trusted clock for live mode", () => {
    expect(resolveClock({ mode: "live" }, { now: () => "2026-09-09T01:00:00Z" })).toEqual({ mode: "live", instant: "2026-09-09T01:00:00Z", operationsDate: "2026-09-08", timeZone: "America/New_York" });
  });
  it("keeps the demo reproducible without consulting live time", () => {
    const clock = { now: () => { throw new Error("Live clock must not run"); } };
    expect(resolveClock({ mode: "demo", date: "2026-09-08" }, clock).instant).toBe("2026-09-08T13:00:00Z");
    expect(resolveClock({ mode: "demo", date: "2026-12-08" }, clock).instant).toBe("2026-12-08T14:00:00Z");
  });
});
