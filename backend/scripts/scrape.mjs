#!/usr/bin/env node
/**
 * Scraper runner. Pulls current listings from the allowed public platforms and
 * upserts them into `discovered_hackathons`.
 *
 *   npm run scrape                        every registered platform
 *   npm run scrape -- --dry-run           print rows, write nothing
 *   npm run scrape -- --only unstop       one platform
 *
 * Platforms are added here AND documented in .claude/rules/scraper-conventions.md
 * and CLAUDE.md. A scraper that runs but is not in the docs is how the
 * allowlist rots.
 *
 * Only the five public listing sites named in those docs are permitted. Never
 * add a source that requires a login.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as unstop from './scrapers/unstop.mjs';
import * as devfolio from './scrapers/devfolio.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: join(HERE, '..', '.env.local') });
config({ path: join(HERE, '..', '.env') });

/**
 * Registered scrapers. Each module exports `platform`, `listingUrl`, `scrape()`.
 * Devpost, HackerEarth and MLH are next — use /add-scraper-source to add them.
 */
const SCRAPERS = [unstop, devfolio];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex !== -1 ? args[onlyIndex + 1] : null;

async function main() {
  const selected = only
    ? SCRAPERS.filter((s) => s.platform === only)
    : SCRAPERS;

  if (selected.length === 0) {
    console.error(`No scraper named "${only}". Registered: ${SCRAPERS.map((s) => s.platform).join(', ')}`);
    process.exit(1);
  }

  console.log(`Scraping ${selected.map((s) => s.platform).join(', ')}${dryRun ? ' (dry run)' : ''}\n`);

  const all = [];
  const failures = [];

  // Sequential on purpose: parallel runs would defeat the per-host rate limit
  // and hit several sites at once for no real gain.
  for (const scraper of selected) {
    process.stdout.write(`${scraper.platform}… `);
    try {
      const rows = await scraper.scrape();
      console.log(`${rows.length} found`);
      all.push(...rows);
    } catch (error) {
      console.log('failed');
      console.warn(`  ${error.message}`);
      failures.push({ platform: scraper.platform, reason: error.message });
    }
  }

  console.log();

  if (all.length === 0) {
    console.log('Nothing found.');
    if (failures.length > 0) process.exitCode = 1;
    return;
  }

  if (dryRun) {
    for (const row of all) {
      console.log(`  [${row.platform}] ${row.name}`);
      console.log(`      ${row.deadline ?? 'no deadline'} · ${row.source_url}`);
    }
    console.log(`\n${all.length} rows — nothing written (dry run).`);
    return;
  }

  await write(all);

  if (failures.length > 0) {
    console.warn(`\n${failures.length} platform(s) failed: ${failures.map((f) => f.platform).join(', ')}`);
    process.exitCode = 1;
  }
}

/**
 * Upsert into `discovered_hackathons`, keyed on source_url.
 *
 * The column list is explicit and omits `added_to_tracker` — that is the user's
 * state, and a re-run must never reset it back to false.
 *
 * @param {Array<object>} rows
 */
async function write(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
    console.error('Copy backend/.env.example to backend/.env.local and fill it in.');
    console.error('Re-run with --dry-run to see the rows without writing.');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('discovered_hackathons')
    .upsert(
      rows.map((row) => ({
        name: row.name,
        platform: row.platform,
        source_url: row.source_url,
        deadline: row.deadline,
        scraped_at: new Date().toISOString(),
      })),
      { onConflict: 'source_url' },
    )
    .select('id');

  if (error) {
    console.error(`Write failed: ${error.message}`);
    if (error.code === '42P01') {
      console.error('The discovered_hackathons table does not exist — run the migration first.');
    }
    process.exit(1);
  }

  console.log(`Wrote ${data?.length ?? rows.length} rows to discovered_hackathons.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
