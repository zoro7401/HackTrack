/**
 * Deadline urgency and date formatting.
 *
 * This is the one piece of real logic in the app, and the one most likely to be
 * quietly wrong — so it lives here as pure functions with tests, not inline in
 * a component.
 *
 * Everything is a `YYYY-MM-DD` string. Dates are compared by calendar day in
 * local time, never as instants: "due tomorrow" must mean tomorrow on the wall
 * calendar regardless of what hour it is.
 */

/** Urgency bands, in the order the dashboard sorts them. */
export const URGENCY = {
  CRITICAL: 'critical', // today or within 2 days
  SOON: 'soon',         // within 7 days
  CLEAR: 'clear',       // further out
  PAST: 'past',         // already gone
  NONE: 'none',         // no deadline recorded
};

/**
 * Parse `YYYY-MM-DD` into a local-midnight Date.
 * `new Date('2026-03-01')` parses as UTC midnight, which is the previous day in
 * every timezone west of Greenwich — the classic off-by-one. Build it by parts.
 *
 * @param {string|null|undefined} iso
 * @returns {Date|null}
 */
export function parseDate(iso) {
  if (typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // Rejects 2026-02-31 and friends, which Date would silently roll forward.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1
      || date.getDate() !== Number(d)) {
    return null;
  }
  return date;
}

/** Local midnight today, so day math is calendar math. */
function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Whole days from today to `iso`. Negative means it has passed.
 *
 * @param {string|null|undefined} iso
 * @param {Date} [now]
 * @returns {number|null} null when there is no parseable date
 */
export function daysUntil(iso, now = new Date()) {
  const target = parseDate(iso);
  if (!target) return null;
  const MS_PER_DAY = 86400000;
  return Math.round((target - startOfToday(now)) / MS_PER_DAY);
}

/**
 * The nearest deadline that hasn't passed, across every deadline field.
 *
 * Deliberately not "whichever field is set": a hackathon whose registration
 * closed last week but whose submission is tomorrow is urgent, and reading only
 * `registration_deadline` would call it past.
 *
 * @param {object} hackathon
 * @param {Date} [now]
 * @returns {{ date: string, days: number, field: string }|null}
 */
export function nextDeadline(hackathon, now = new Date()) {
  const fields = ['registration_deadline', 'submission_deadline', 'event_start', 'event_end'];

  const upcoming = fields
    .map((field) => ({ field, date: hackathon?.[field], days: daysUntil(hackathon?.[field], now) }))
    .filter((entry) => entry.days !== null && entry.days >= 0)
    .sort((a, b) => a.days - b.days);

  if (upcoming.length > 0) return upcoming[0];

  // Nothing upcoming — fall back to the most recent past deadline so the card
  // can say "closed 3 days ago" rather than showing nothing at all.
  const past = fields
    .map((field) => ({ field, date: hackathon?.[field], days: daysUntil(hackathon?.[field], now) }))
    .filter((entry) => entry.days !== null)
    .sort((a, b) => b.days - a.days);

  return past[0] ?? null;
}

/**
 * Urgency band for a hackathon, from its nearest upcoming deadline.
 *
 * A deadline that has already passed is PAST, not CRITICAL. Shouting in red
 * about something you can no longer act on is noise, and noise is what makes a
 * dashboard stop working.
 *
 * @param {object} hackathon
 * @param {Date} [now]
 * @returns {string} one of URGENCY
 */
export function urgencyFor(hackathon, now = new Date()) {
  // Finished states are never urgent, whatever their dates say.
  if (hackathon?.status === 'completed' || hackathon?.status === 'missed') {
    return URGENCY.PAST;
  }

  const next = nextDeadline(hackathon, now);
  if (!next) return URGENCY.NONE;
  if (next.days < 0) return URGENCY.PAST;
  if (next.days <= 2) return URGENCY.CRITICAL;
  if (next.days <= 7) return URGENCY.SOON;
  return URGENCY.CLEAR;
}

/** Sort weight — most urgent first, undated last. */
const URGENCY_RANK = {
  [URGENCY.CRITICAL]: 0,
  [URGENCY.SOON]: 1,
  [URGENCY.CLEAR]: 2,
  [URGENCY.PAST]: 3,
  [URGENCY.NONE]: 4,
};

/**
 * Sort by urgency band, then by nearest deadline inside the band.
 * Returns a new array; does not mutate.
 *
 * @param {Array<object>} hackathons
 * @param {Date} [now]
 * @returns {Array<object>}
 */
export function sortByUrgency(hackathons, now = new Date()) {
  return [...(hackathons ?? [])].sort((a, b) => {
    const rankDiff = URGENCY_RANK[urgencyFor(a, now)] - URGENCY_RANK[urgencyFor(b, now)];
    if (rankDiff !== 0) return rankDiff;

    const aDays = nextDeadline(a, now)?.days;
    const bDays = nextDeadline(b, now)?.days;
    if (aDays == null && bDays == null) return (a.name ?? '').localeCompare(b.name ?? '');
    if (aDays == null) return 1;
    if (bDays == null) return -1;
    return aDays - bDays;
  });
}

/**
 * Human phrasing for a day count. Says the number, so urgency is never carried
 * by colour alone.
 *
 * @param {number|null} days
 * @returns {string}
 */
export function describeDays(days) {
  if (days === null || days === undefined) return 'No deadline';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return 'Closed yesterday';
  if (days < 0) return `Closed ${Math.abs(days)} days ago`;
  return `${days} days left`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-03-14` → `14 Mar 2026`. Year omitted when it's the current one.
 *
 * @param {string|null|undefined} iso
 * @param {Date} [now]
 * @returns {string}
 */
export function formatDate(iso, now = new Date()) {
  const date = parseDate(iso);
  if (!date) return '—';
  const sameYear = date.getFullYear() === now.getFullYear();
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return sameYear ? base : `${base} ${date.getFullYear()}`;
}

/** Field name → the label shown on a card. */
export const DEADLINE_LABELS = {
  registration_deadline: 'Registration',
  submission_deadline: 'Submission',
  event_start: 'Starts',
  event_end: 'Ends',
};

/** Today as `YYYY-MM-DD`, for form defaults. */
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
