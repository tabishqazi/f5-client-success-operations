import { describe, expect, test } from 'vitest';
import { suggestFollowUpDate } from '../../src/domain/follow-up-date';

describe('follow-up date suggestions', () => {
  const asOf = '2026-09-09';

  test('resolves a bare weekday to the next occurrence', () => {
    expect(suggestFollowUpDate('The client will connect with us on Monday.', asOf)).toEqual({
      date: '2026-09-14', phrase: 'monday', withinAllowedWindow: true,
    });
  });

  test.each([
    ['Please call tomorrow.', '2026-09-10'],
    ['Try again next business day.', '2026-09-10'],
    ['Follow up in 3 business days.', '2026-09-14'],
    ['Reconnect in 2 days.', '2026-09-11'],
    ['They requested September 14.', '2026-09-14'],
    ['They requested 14th of September 2026.', '2026-09-14'],
  ])('resolves %s', (notes, date) => expect(suggestFollowUpDate(notes, asOf)?.date).toBe(date));

  test('marks a parsed date outside the five-business-day confirmation window', () => {
    expect(suggestFollowUpDate('Reconnect in 8 business days.', asOf)).toMatchObject({ date: '2026-09-21', withinAllowedWindow: false });
  });

  test('returns no suggestion for invalid or unrelated notes', () => {
    expect(suggestFollowUpDate('Discussed Monday reporting trends.', asOf)?.date).toBe('2026-09-14');
    expect(suggestFollowUpDate('The client asked for another conversation.', asOf)).toBeNull();
    expect(suggestFollowUpDate('Use February 30.', asOf)).toBeNull();
  });
});
