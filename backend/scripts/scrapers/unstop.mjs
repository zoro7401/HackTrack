import * as cheerio from 'cheerio';
import { fetchJson, fetchPage } from '../lib/fetcher.mjs';
import { normalizeRow, absoluteUrl } from '../lib/normalize.mjs';

/**
 * Unstop — https://unstop.com/hackathons
 *
 * The listing page is a client-rendered app backed by a public JSON API, so we
 * ask the API rather than parsing a shell of HTML. Less traffic for them, less
 * brittle for us. If the API shape changes, `parseHtml` is the fallback.
 *
 * Public listing page, no login. See .claude/rules/scraper-conventions.md.
 */

export const platform = 'unstop';
export const listingUrl = 'https://unstop.com/hackathons';

const API_URL =
  'https://unstop.com/api/public/opportunity/search-result'
  + '?opportunity=hackathons&per_page=30&oppstatus=open';

/**
 * @returns {Promise<Array<{name: string, platform: string, source_url: string, deadline: string|null}>>}
 */
export async function scrape() {
  const api = await fetchJson(API_URL);
  if (api.ok) {
    const rows = parseApi(api.data);
    if (rows.length > 0) return rows;
    console.warn('  unstop: API returned no rows, falling back to HTML');
  } else {
    console.warn(`  unstop: API unavailable (${api.reason}), falling back to HTML`);
  }

  const page = await fetchPage(listingUrl);
  if (!page.ok) throw new Error(page.reason);
  return parseHtml(page.body);
}

/**
 * @param {unknown} payload
 * @returns {Array<object>}
 */
export function parseApi(payload) {
  const list = payload?.data?.data;
  if (!Array.isArray(list)) return [];

  const rows = [];
  for (const item of list) {
    try {
      const slug = item?.public_url ?? item?.seo_url ?? item?.slug;
      const row = normalizeRow({
        name: item?.title,
        platform,
        source_url: slug ? absoluteUrl(String(slug), 'https://unstop.com/') : null,
        // Unstop calls the registration close `regnRequirements.end_regn_dt`,
        // with `end_date` as the older spelling.
        deadline: item?.regnRequirements?.end_regn_dt ?? item?.end_date ?? null,
      });
      if (row) rows.push(row);
    } catch (error) {
      console.warn(`  unstop: skipped a listing — ${error.message}`);
    }
  }
  return rows;
}

/**
 * Fallback HTML parse. Selectors here are the part most likely to break; a
 * change in their markup should skip rows, never throw.
 *
 * @param {string} html
 * @returns {Array<object>}
 */
export function parseHtml(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $('a[href*="/hackathons/"], a[href*="/o/"]').each((_, element) => {
    try {
      const $el = $(element);
      const name = $el.find('h2, h3, .opp-title').first().text() || $el.attr('title');
      if (!name) return;

      const row = normalizeRow({
        name,
        platform,
        source_url: absoluteUrl($el.attr('href'), listingUrl),
        deadline: $el.find('[class*="date"], [class*="deadline"]').first().text(),
      });
      if (row) rows.push(row);
    } catch (error) {
      console.warn(`  unstop: skipped a listing — ${error.message}`);
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
