import * as cheerio from 'cheerio';
import { fetchPage } from '../lib/fetcher.mjs';
import { normalizeRow, absoluteUrl, cleanText } from '../lib/normalize.mjs';

/**
 * Devfolio — https://devfolio.co/hackathons
 *
 * Next.js server-rendered, so the listing data is in the `__NEXT_DATA__` script
 * tag as JSON. Reading that is far more stable than matching CSS classes, which
 * on Devfolio are build-hashed and change without warning. The DOM parse stays
 * as a fallback.
 *
 * Public listing page, no login. See .claude/rules/scraper-conventions.md.
 */

export const platform = 'devfolio';
export const listingUrl = 'https://devfolio.co/hackathons';

/**
 * @returns {Promise<Array<{name: string, platform: string, source_url: string, deadline: string|null}>>}
 */
export async function scrape() {
  const page = await fetchPage(listingUrl);
  if (!page.ok) throw new Error(page.reason);

  const fromData = parseNextData(page.body);
  if (fromData.length > 0) return fromData;

  console.warn('  devfolio: __NEXT_DATA__ had no listings, falling back to DOM');
  return parseHtml(page.body);
}

/**
 * @param {string} html
 * @returns {Array<object>}
 */
export function parseNextData(html) {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];

  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch (error) {
    console.warn(`  devfolio: __NEXT_DATA__ was not valid JSON — ${error.message}`);
    return [];
  }

  const rows = [];
  for (const item of collectHackathons(payload?.props?.pageProps)) {
    try {
      const slug = item?.slug;
      const row = normalizeRow({
        name: item?.name ?? item?.title,
        platform,
        source_url: slug
          ? `https://${slug}.devfolio.co/`
          : absoluteUrl(item?.url, listingUrl),
        deadline: item?.apply_close_at ?? item?.ends_at ?? item?.starts_at ?? null,
        // The listing payload only says online-or-not; it doesn't give a city
        // for in-person events, or fee/prize figures — those live on each
        // hackathon's own subdomain, which this scraper doesn't crawl.
        location: item?.is_online === true ? 'Online'
          : item?.is_online === false ? 'In-person' : null,
      });
      if (row) rows.push(row);
    } catch (error) {
      console.warn(`  devfolio: skipped a listing — ${error.message}`);
    }
  }
  return dedupe(rows);
}

/**
 * Devfolio moves the listing array between keys across releases, so find it by
 * shape — an array of objects that have a name and a slug — instead of pinning
 * a path that breaks on their next deploy.
 *
 * @param {unknown} node
 * @param {number} [depth]
 * @returns {Array<object>}
 */
function collectHackathons(node, depth = 0) {
  if (!node || depth > 6) return [];

  if (Array.isArray(node)) {
    const looksRight = node.length > 0
      && node.every((item) => item && typeof item === 'object'
        && ('name' in item || 'title' in item) && ('slug' in item || 'uuid' in item));
    if (looksRight) return node;

    return node.flatMap((child) => collectHackathons(child, depth + 1));
  }

  if (typeof node === 'object') {
    return Object.values(node).flatMap((child) => collectHackathons(child, depth + 1));
  }

  return [];
}

/**
 * DOM fallback. Class names on Devfolio are build-hashed, so this matches on
 * link shape instead, which changes far less often.
 *
 * @param {string} html
 * @returns {Array<object>}
 */
export function parseHtml(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $('a[href*="devfolio.co"]').each((_, element) => {
    try {
      const $el = $(element);
      const href = $el.attr('href') ?? '';
      // Only subdomain links are hackathons; skip devfolio.co's own pages.
      if (!/^https?:\/\/[^.]+\.devfolio\.co/.test(href)) return;

      const name = cleanText($el.find('h1, h2, h3, h4').first().text())
        ?? cleanText($el.attr('title'));
      if (!name) return;

      const row = normalizeRow({
        name,
        platform,
        source_url: href,
        deadline: $el.find('[class*="date"], time').first().attr('datetime')
          ?? $el.find('[class*="date"], time').first().text(),
        location: $el.find('[class*="location"], [class*="venue"]').first().text(),
      });
      if (row) rows.push(row);
    } catch (error) {
      console.warn(`  devfolio: skipped a listing — ${error.message}`);
    }
  });

  return dedupe(rows);
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.source_url)) return false;
    seen.add(row.source_url);
    return true;
  });
}
