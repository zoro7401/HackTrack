import { describe, it, expect } from 'vitest';
import {
  URGENCY, parseDate, daysUntil, nextDeadline, urgencyFor,
  sortByUrgency, describeDays, formatDate, todayIso,
} from './dates.js';

// Fixed "now" so these tests don't rot. Local noon, deliberately: the timezone
// bugs this guards against only show up away from UTC midnight.
const NOW = new Date(2026, 2, 10, 12, 0, 0); // 10 Mar 2026

describe('parseDate', () => {
  it('parses an ISO day into local midnight', () => {
    const d = parseDate('2026-03-14');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(0); // local, not UTC-shifted
  });

  it('rejects junk and missing values', () => {
    for (const bad of [null, undefined, '', 'soon', '14/03/2026', '2026-3-4', 42]) {
      expect(parseDate(bad)).toBeNull();
    }
  });

  it('rejects a date that does not exist instead of rolling it forward', () => {
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('counts calendar days, not 24-hour periods', () => {
    // NOW is noon. Tomorrow is 1 day away even though it's only 12h off.
    expect(daysUntil('2026-03-11', NOW)).toBe(1);
    expect(daysUntil('2026-03-10', NOW)).toBe(0);
  });

  it('goes negative for past dates', () => {
    expect(daysUntil('2026-03-07', NOW)).toBe(-3);
  });

  it('returns null with no date', () => {
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('crosses a month boundary correctly', () => {
    expect(daysUntil('2026-04-01', NOW)).toBe(22);
  });
});

describe('nextDeadline', () => {
  it('picks the nearest upcoming date across all fields', () => {
    const h = {
      registration_deadline: '2026-03-20',
      submission_deadline: '2026-03-12',
      event_start: '2026-03-25',
    };
    expect(nextDeadline(h, NOW)).toMatchObject({ field: 'submission_deadline', days: 2 });
  });

  it('ignores a passed registration when submission is still live', () => {
    // The bug this exists to prevent: reading only registration_deadline would
    // call this past, when in fact it's due tomorrow.
    const h = { registration_deadline: '2026-03-01', submission_deadline: '2026-03-11' };
    expect(nextDeadline(h, NOW)).toMatchObject({ field: 'submission_deadline', days: 1 });
  });

  it('falls back to the most recent past date when nothing is upcoming', () => {
    const h = { registration_deadline: '2026-03-01', submission_deadline: '2026-03-05' };
    expect(nextDeadline(h, NOW)).toMatchObject({ field: 'submission_deadline', days: -5 });
  });

  it('returns null when there are no dates at all', () => {
    expect(nextDeadline({ name: 'Someday' }, NOW)).toBeNull();
  });
});

describe('urgencyFor', () => {
  it('is critical today, tomorrow, and at two days', () => {
    for (const d of ['2026-03-10', '2026-03-11', '2026-03-12']) {
      expect(urgencyFor({ registration_deadline: d }, NOW)).toBe(URGENCY.CRITICAL);
    }
  });

  it('is soon from three to seven days', () => {
    for (const d of ['2026-03-13', '2026-03-17']) {
      expect(urgencyFor({ registration_deadline: d }, NOW)).toBe(URGENCY.SOON);
    }
  });

  it('is clear past a week', () => {
    expect(urgencyFor({ registration_deadline: '2026-03-18' }, NOW)).toBe(URGENCY.CLEAR);
  });

  it('is past, not critical, once the deadline has gone', () => {
    // A passed deadline shown in alarm red is noise you learn to ignore.
    expect(urgencyFor({ registration_deadline: '2026-03-09' }, NOW)).toBe(URGENCY.PAST);
  });

  it('is none with no deadline', () => {
    expect(urgencyFor({ name: 'TBD' }, NOW)).toBe(URGENCY.NONE);
  });

  it('never shouts about a finished hackathon', () => {
    const imminent = { registration_deadline: '2026-03-11' };
    expect(urgencyFor({ ...imminent, status: 'completed' }, NOW)).toBe(URGENCY.PAST);
    expect(urgencyFor({ ...imminent, status: 'missed' }, NOW)).toBe(URGENCY.PAST);
    expect(urgencyFor({ ...imminent, status: 'registered' }, NOW)).toBe(URGENCY.CRITICAL);
  });
});

describe('sortByUrgency', () => {
  it('orders by band, then by nearest deadline', () => {
    const list = [
      { name: 'clear', registration_deadline: '2026-04-01' },
      { name: 'past', registration_deadline: '2026-03-01' },
      { name: 'critical', registration_deadline: '2026-03-11' },
      { name: 'none' },
      { name: 'soon', registration_deadline: '2026-03-15' },
    ];
    expect(sortByUrgency(list, NOW).map((h) => h.name))
      .toEqual(['critical', 'soon', 'clear', 'past', 'none']);
  });

  it('sorts within a band by days remaining', () => {
    const list = [
      { name: 'two', registration_deadline: '2026-03-12' },
      { name: 'today', registration_deadline: '2026-03-10' },
      { name: 'one', registration_deadline: '2026-03-11' },
    ];
    expect(sortByUrgency(list, NOW).map((h) => h.name)).toEqual(['today', 'one', 'two']);
  });

  it('does not mutate the input', () => {
    const list = [{ name: 'b', registration_deadline: '2026-04-01' },
                  { name: 'a', registration_deadline: '2026-03-11' }];
    const copy = [...list];
    sortByUrgency(list, NOW);
    expect(list).toEqual(copy);
  });

  it('survives an empty or missing list', () => {
    expect(sortByUrgency([], NOW)).toEqual([]);
    expect(sortByUrgency(undefined, NOW)).toEqual([]);
  });
});

describe('describeDays', () => {
  it('reads naturally at the boundaries', () => {
    expect(describeDays(0)).toBe('Due today');
    expect(describeDays(1)).toBe('Due tomorrow');
    expect(describeDays(5)).toBe('5 days left');
    expect(describeDays(-1)).toBe('Closed yesterday');
    expect(describeDays(-4)).toBe('Closed 4 days ago');
    expect(describeDays(null)).toBe('No deadline');
  });
});

describe('formatDate', () => {
  it('omits the year when it is the current one', () => {
    expect(formatDate('2026-03-14', NOW)).toBe('14 Mar');
  });

  it('includes the year otherwise', () => {
    expect(formatDate('2027-01-05', NOW)).toBe('5 Jan 2027');
  });

  it('renders an em dash for a missing date', () => {
    expect(formatDate(null, NOW)).toBe('—');
  });
});

describe('todayIso', () => {
  it('formats local today, zero-padded', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
