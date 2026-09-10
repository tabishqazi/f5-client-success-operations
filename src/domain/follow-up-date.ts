import { Temporal } from '@js-temporal/polyfill';
import { addBusinessDays, addCalendarDays, compareDates, parseDate } from './clock';
import { POLICY } from './policy';

export interface FollowUpDateSuggestion {
  date: string;
  phrase: string;
  withinAllowedWindow: boolean;
}

const weekdays: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const months: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

function result(date: string, phrase: string, asOf: string): FollowUpDateSuggestion {
  const latest = addBusinessDays(asOf, POLICY.rescheduling.maximumBusinessDays);
  return { date, phrase, withinAllowedWindow: compareDates(date, asOf) >= 0 && compareDates(date, latest) <= 0 };
}

function explicitDate(month: number, day: number, year: number | undefined, asOf: string): string | null {
  const base = parseDate(asOf);
  const firstYear = year ?? base.year;
  try {
    let date = Temporal.PlainDate.from({ year: firstYear, month, day }, { overflow: 'reject' });
    if (year === undefined && Temporal.PlainDate.compare(date, base) < 0) date = date.add({ years: 1 });
    return date.toString();
  } catch {
    return null;
  }
}

export function suggestFollowUpDate(notes: string, asOf: string): FollowUpDateSuggestion | null {
  parseDate(asOf);
  if (!notes.trim()) return null;
  const text = notes.toLowerCase().replace(/[’']/g, "'");

  const nextBusiness = text.match(/\bnext business day\b/);
  if (nextBusiness) return result(addBusinessDays(asOf, 1), nextBusiness[0], asOf);

  const businessDays = text.match(/\bin\s+([1-9]|[12]\d|30)\s+business days?\b/);
  if (businessDays) return result(addBusinessDays(asOf, Number(businessDays[1])), businessDays[0], asOf);

  const calendarDays = text.match(/\bin\s+([1-9]|[12]\d|30)\s+(?:calendar\s+)?days?\b/);
  if (calendarDays) return result(addCalendarDays(asOf, Number(calendarDays[1])), calendarDays[0], asOf);

  const tomorrow = text.match(/\btomorrow\b/);
  if (tomorrow) return result(addCalendarDays(asOf, 1), tomorrow[0], asOf);

  const today = text.match(/\btoday\b/);
  if (today) return result(asOf, today[0], asOf);

  const weekday = text.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekday) {
    const base = parseDate(asOf);
    const target = weekdays[weekday[2]!]!;
    const explicitlyNext = Boolean(weekday[1]);
    let days = explicitlyNext
      ? (8 - base.dayOfWeek) + (target - 1)
      : (target - base.dayOfWeek + 7) % 7;
    if (!explicitlyNext && days === 0) days = 7;
    return result(base.add({ days }).toString(), weekday[0], asOf);
  }

  const monthFirst = text.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/);
  if (monthFirst) {
    const date = explicitDate(months[monthFirst[1]!]!, Number(monthFirst[2]), monthFirst[3] ? Number(monthFirst[3]) : undefined, asOf);
    if (date) return result(date, monthFirst[0], asOf);
  }

  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:,?\s+(20\d{2}))?\b/);
  if (dayFirst) {
    const date = explicitDate(months[dayFirst[2]!]!, Number(dayFirst[1]), dayFirst[3] ? Number(dayFirst[3]) : undefined, asOf);
    if (date) return result(date, dayFirst[0], asOf);
  }

  return null;
}
