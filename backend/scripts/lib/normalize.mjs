/**
 * Shared normalizers for scraper output.
 *
 * Each site states dates its own way. This is where they all become
 * `YYYY-MM-DD` or `null` — and where an unparseable date becomes `null` rather
 * than a guess, because a wrong deadline renders as a confident wrong urgency,
 * which is worse than no deadline at all.
 *
 * Pure functions, so they are tested without touching the network.
 */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Best-effort parse of the date formats these listing sites actually use.
 *
 * @param {unknown} input
 * @param {Date} [now] reference point for two-digit and year-less dates
 * @returns {string|null} `YYYY-MM-DD`, or null when it cannot be read confidently
 */
export function toIsoDate(input, now = new Date()) {
  if (!input) return null;

  // Epoch milliseconds or seconds, as several JSON APIs return.
  if (typeof input === 'number' && Number.isFinite(input)) {
    const ms = input > 1e12 ? input : input * 1000;
    return fromDate(new Date(ms));
  }

  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  // Already ISO, possibly with a time component.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(text);
  if (iso) return validate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // "14 Mar 2026", "14 March 2026", "14 Mar"
  const dmy = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:\s+(\d{4}))?/.exec(text);
  if (dmy) {
    const month = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    if (month) return withInferredYear(Number(dmy[1]), month, dmy[3], now);
  }

  // "Mar 14, 2026", "March 14 2026", "Mar 14"
  const mdy = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:(?:st|nd|rd|th)?,?\s+(\d{4}))?/.exec(text);
  if (mdy) {
    const month = MONTHS[mdy[1].slice(0, 3).toLowerCase()];
    if (month) return withInferredYear(Number(mdy[2]), month, mdy[3], now);
  }

  // "2026/03/14"
  const slashed = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (slashed) return validate(Number(slashed[1]), Number(slashed[2]), Number(slashed[3]));

  // Anything with a Z or an offset is a real timestamp; let Date have it.
  if (/\d{4}.*(?:Z|[+-]\d{2}:?\d{2})/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return fromDate(parsed);
  }

  // Deliberately no fallback to `new Date(text)`. It accepts far too much and
  // silently invents dates — exactly the failure this function exists to avoid.
  return null;
}

/**
 * Year-less dates ("closes 14 Mar") mean the next such date in the future.
 */
function withInferredYear(day, month, yearText, now) {
  if (yearText) return validate(Number(yearText), month, day);

  const year = now.getFullYear();
  const candidate = validate(year, month, day);
  if (!candidate) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (new Date(year, month - 1, day) >= today) return candidate;
  return validate(year + 1, month, day);
}

/** Rejects 31 February and friends rather than letting Date roll them forward. */
function validate(year, month, day) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return fromDate(date);
}

function fromDate(date) {
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Collapse scraped whitespace and trim. Listing markup is full of newlines and
 * non-breaking spaces that render as ugly gaps in a card.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function cleanText(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
  return text || null;
}

/**
 * Resolve a possibly-relative href against its listing page.
 *
 * @param {string|null|undefined} href
 * @param {string} base
 * @returns {string|null}
 */
export function absoluteUrl(href, base) {
  if (!href || typeof href !== 'string') return null;
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return null;
  }
}

/**
 * Shape and validate one scraped row. Returns null for anything unusable, so a
 * single malformed listing skips itself instead of failing the run.
 *
 * `location`, `entryFee` and `prizeMoney` are free text, not typed amounts —
 * each platform states them differently ("Free", "₹500", "Online", "$5,000 in
 * prizes"), and a listing missing one of them is normal, not an error.
 *
 * @param {{name: unknown, platform: string, source_url: unknown, deadline: unknown,
 *   location?: unknown, entryFee?: unknown, prizeMoney?: unknown}} row
 * @returns {{name: string, platform: string, source_url: string, deadline: string|null,
 *   location: string|null, entryFee: string|null, prizeMoney: string|null}|null}
 */
export function normalizeRow({
  name, platform, source_url: sourceUrl, deadline, location, entryFee, prizeMoney,
}) {
  const cleanName = cleanText(name);
  const cleanUrl = typeof sourceUrl === 'string' ? sourceUrl.trim() : null;

  // No name or no URL means no row: the URL is the upsert key, and a nameless
  // card is useless on the dashboard.
  if (!cleanName || !cleanUrl) return null;

  try {
    new URL(cleanUrl);
  } catch {
    return null;
  }

  return {
    name: cleanName.slice(0, 300),
    platform,
    source_url: cleanUrl,
    deadline: toIsoDate(deadline),
    location: cleanText(location),
    entryFee: cleanText(entryFee),
    prizeMoney: cleanText(prizeMoney),
  };
}
