/**
 * Polite HTTP for the scrapers: robots.txt, rate limiting, and an honest
 * User-Agent, in one place so no scraper module can skip them by accident.
 *
 * Every scraper goes through `fetchPage()`. Calling `fetch` directly in a
 * scraper module is a bug — see .claude/rules/scraper-conventions.md.
 */

const USER_AGENT =
  'HackathonTracker/1.0 (personal hackathon tracker; +https://github.com/zoro/hackathon-tracker)';

/** Minimum gap between requests to the same host. Deliberately unhurried. */
const RATE_LIMIT_MS = 2000;

const REQUEST_TIMEOUT_MS = 15000;

/** host → timestamp of the last request, so the delay is per-site. */
const lastRequestAt = new Map();

/** host → parsed robots rules, fetched at most once per run. */
const robotsCache = new Map();

/**
 * Wait out the remaining rate-limit window for a host.
 * @param {string} host
 */
async function throttle(host) {
  const last = lastRequestAt.get(host);
  if (last !== undefined) {
    const wait = RATE_LIMIT_MS - (Date.now() - last);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt.set(host, Date.now());
}

/**
 * Fetch and parse robots.txt for a host. Cached per run.
 *
 * Parses the `*` group only — that is the group that applies to us, and a
 * scraper that reads a more permissive named group is reading rules meant for
 * somebody else.
 *
 * @param {string} origin e.g. "https://unstop.com"
 * @returns {Promise<{disallow: string[], allow: string[], crawlDelayMs: number}>}
 */
async function fetchRobots(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);

  const rules = { disallow: [], allow: [], crawlDelayMs: 0 };

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      let inStarGroup = false;

      for (const line of (await response.text()).split(/\r?\n/)) {
        const clean = line.split('#')[0].trim();
        if (!clean) continue;

        const [rawKey, ...rest] = clean.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();

        if (key === 'user-agent') {
          inStarGroup = value === '*';
          continue;
        }
        if (!inStarGroup) continue;

        if (key === 'disallow' && value) rules.disallow.push(value);
        else if (key === 'allow' && value) rules.allow.push(value);
        else if (key === 'crawl-delay') {
          const seconds = Number.parseFloat(value);
          if (Number.isFinite(seconds)) rules.crawlDelayMs = seconds * 1000;
        }
      }
    }
    // A missing or erroring robots.txt means no stated restrictions. We still
    // rate limit, because that is about being a good guest, not about rules.
  } catch (error) {
    console.warn(`  robots.txt unreadable for ${origin}: ${error.message}`);
  }

  robotsCache.set(origin, rules);
  return rules;
}

/**
 * Is this path allowed by the host's robots.txt?
 * Longest matching rule wins, with Allow beating Disallow at equal length —
 * the standard precedence.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isAllowed(url) {
  const { origin, pathname } = new URL(url);
  const rules = await fetchRobots(origin);

  let verdict = true;
  let bestLength = -1;

  for (const [list, allowed] of [[rules.allow, true], [rules.disallow, false]]) {
    for (const rule of list) {
      if (!pathname.startsWith(rule)) continue;
      if (rule.length > bestLength || (rule.length === bestLength && allowed)) {
        bestLength = rule.length;
        verdict = allowed;
      }
    }
  }

  return verdict;
}

/**
 * Fetch a page, having checked robots.txt and waited out the rate limit.
 *
 * @param {string} url
 * @param {{accept?: string}} [options]
 * @returns {Promise<{ok: true, body: string} | {ok: false, reason: string}>}
 */
export async function fetchPage(url, options = {}) {
  const { host, origin } = new URL(url);

  if (!(await isAllowed(url))) {
    return { ok: false, reason: `robots.txt at ${origin} disallows ${url}` };
  }

  const { crawlDelayMs } = await fetchRobots(origin);
  if (crawlDelayMs > RATE_LIMIT_MS) {
    // The site asked for more room than our default. Give it to them.
    await new Promise((resolve) => setTimeout(resolve, crawlDelayMs - RATE_LIMIT_MS));
  }
  await throttle(host);

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: options.accept ?? 'text/html,application/xhtml+xml,application/json',
        'accept-language': 'en',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 429 and 403 are the site saying no. Respect it — do not retry.
    if (response.status === 429 || response.status === 403) {
      return {
        ok: false,
        reason: `${host} returned ${response.status} — backing off and leaving it alone`,
      };
    }
    if (!response.ok) {
      return { ok: false, reason: `${host} returned ${response.status}` };
    }

    return { ok: true, body: await response.text() };
  } catch (error) {
    const reason = error.name === 'TimeoutError'
      ? `${host} timed out after ${REQUEST_TIMEOUT_MS}ms`
      : `${host}: ${error.message}`;
    return { ok: false, reason };
  }
}

/** Convenience wrapper for JSON endpoints. */
export async function fetchJson(url) {
  const result = await fetchPage(url, { accept: 'application/json' });
  if (!result.ok) return result;

  try {
    return { ok: true, data: JSON.parse(result.body) };
  } catch (error) {
    return { ok: false, reason: `${url} did not return JSON: ${error.message}` };
  }
}

export { USER_AGENT, RATE_LIMIT_MS };
