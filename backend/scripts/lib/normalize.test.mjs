import { describe, it, expect } from 'vitest';
import { toIsoDate, cleanText, absoluteUrl, normalizeRow } from './normalize.mjs';

const NOW = new Date(2026, 2, 10); // 10 Mar 2026

describe('toIsoDate', () => {
  it('passes ISO dates through, with or without a time', () => {
    expect(toIsoDate('2026-03-14')).toBe('2026-03-14');
    expect(toIsoDate('2026-03-14T18:30:00Z')).toBe('2026-03-14');
    expect(toIsoDate('2026-03-14 18:30:00')).toBe('2026-03-14');
  });

  it('reads day-first formats', () => {
    expect(toIsoDate('14 Mar 2026', NOW)).toBe('2026-03-14');
    expect(toIsoDate('14 March 2026', NOW)).toBe('2026-03-14');
    expect(toIsoDate('1 Apr 2026', NOW)).toBe('2026-04-01');
  });

  it('reads month-first formats', () => {
    expect(toIsoDate('Mar 14, 2026', NOW)).toBe('2026-03-14');
    expect(toIsoDate('March 14 2026', NOW)).toBe('2026-03-14');
    expect(toIsoDate('Apr 1st, 2026', NOW)).toBe('2026-04-01');
  });

  it('infers the next occurrence for a year-less date', () => {
    // Later this year — stays in 2026.
    expect(toIsoDate('14 Mar', NOW)).toBe('2026-03-14');
    expect(toIsoDate('20 Dec', NOW)).toBe('2026-12-20');
    // Already gone this year — rolls to 2027.
    expect(toIsoDate('1 Feb', NOW)).toBe('2027-02-01');
  });

  it('reads epoch seconds and milliseconds', () => {
    const ms = new Date(2026, 2, 14).getTime();
    expect(toIsoDate(ms)).toBe('2026-03-14');
    expect(toIsoDate(Math.floor(ms / 1000))).toBe('2026-03-14');
  });

  it('returns null rather than guessing', () => {
    // The whole point: a wrong date renders as a confident wrong urgency.
    for (const junk of [
      null, undefined, '', '   ', 'TBA', 'soon', 'rolling', 'Coming soon',
      'next month', {}, [], true,
    ]) {
      expect(toIsoDate(junk, NOW)).toBeNull();
    }
  });

  it('rejects impossible dates instead of rolling them forward', () => {
    expect(toIsoDate('2026-02-31')).toBeNull();
    expect(toIsoDate('31 Feb 2026', NOW)).toBeNull();
    expect(toIsoDate('2026-13-01')).toBeNull();
  });

  it('rejects years outside a sane range', () => {
    expect(toIsoDate('1899-01-01')).toBeNull();
    expect(toIsoDate('2200-01-01')).toBeNull();
  });
});

describe('cleanText', () => {
  it('collapses scraped whitespace', () => {
    expect(cleanText('  Smart   India\n\n  Hackathon  ')).toBe('Smart India Hackathon');
  });

  it('handles non-breaking spaces', () => {
    expect(cleanText('Hack the North')).toBe('Hack the North');
  });

  it('returns null for nothing useful', () => {
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(null)).toBeNull();
    expect(cleanText(42)).toBeNull();
  });
});

describe('absoluteUrl', () => {
  it('resolves a relative href against the listing page', () => {
    expect(absoluteUrl('/hackathons/abc', 'https://unstop.com/hackathons'))
      .toBe('https://unstop.com/hackathons/abc');
  });

  it('leaves an absolute URL alone', () => {
    expect(absoluteUrl('https://x.devfolio.co/', 'https://devfolio.co/hackathons'))
      .toBe('https://x.devfolio.co/');
  });

  it('returns null for junk', () => {
    expect(absoluteUrl(null, 'https://unstop.com')).toBeNull();
    expect(absoluteUrl('', 'https://unstop.com')).toBeNull();
  });
});

describe('normalizeRow', () => {
  const base = {
    name: '  Hack the Mountains  ',
    platform: 'unstop',
    source_url: 'https://unstop.com/o/abc123',
    deadline: '14 Mar 2026',
  };

  it('shapes a good row', () => {
    expect(normalizeRow({ ...base })).toEqual({
      name: 'Hack the Mountains',
      platform: 'unstop',
      source_url: 'https://unstop.com/o/abc123',
      deadline: '2026-03-14',
      location: null,
      entryFee: null,
      prizeMoney: null,
    });
  });

  it('cleans location, entry fee and prize money when given', () => {
    const row = normalizeRow({
      ...base,
      location: '  Bengaluru,  Karnataka  ',
      entryFee: '₹500',
      prizeMoney: '₹1,50,000',
    });
    expect(row.location).toBe('Bengaluru, Karnataka');
    expect(row.entryFee).toBe('₹500');
    expect(row.prizeMoney).toBe('₹1,50,000');
  });

  it('keeps the row when only the deadline is unreadable', () => {
    // A listing without a parseable date is still worth surfacing.
    expect(normalizeRow({ ...base, deadline: 'TBA' })?.deadline).toBeNull();
  });

  it('drops a row with no name', () => {
    expect(normalizeRow({ ...base, name: '   ' })).toBeNull();
    expect(normalizeRow({ ...base, name: null })).toBeNull();
  });

  it('drops a row with no usable URL — it is the upsert key', () => {
    expect(normalizeRow({ ...base, source_url: null })).toBeNull();
    expect(normalizeRow({ ...base, source_url: 'not a url' })).toBeNull();
  });

  it('truncates an absurdly long name', () => {
    const row = normalizeRow({ ...base, name: 'x'.repeat(500) });
    expect(row.name).toHaveLength(300);
  });
});
