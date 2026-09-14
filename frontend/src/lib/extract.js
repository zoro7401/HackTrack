import { supabase, isConfigured } from './supabase.js';

/**
 * Calls the `extract-hackathon` Edge Function to turn pasted text into fields.
 *
 * Extraction failing is a normal path, not an error state. If no LLM key is
 * configured, or the call fails, or the model returns something unusable, the
 * caller drops the user into the manual form with their pasted text intact.
 * Nothing is ever lost — that is the whole contract of this module.
 */

/** @typedef {{ok: true, fields: object, warning?: string}} ExtractSuccess */
/** @typedef {{ok: false, reason: string}} ExtractFailure */

const FIELDS = [
  'name', 'platform', 'source_url', 'problem_statement', 'team_size',
  'registration_deadline', 'submission_deadline', 'round_dates',
  'event_start', 'event_end',
];

/**
 * @param {string} rawText pasted description, or a URL
 * @returns {Promise<ExtractSuccess|ExtractFailure>}
 */
export async function extractHackathon(rawText) {
  if (!isConfigured) {
    return { ok: false, reason: 'Supabase isn’t configured, so extraction is unavailable.' };
  }
  if (!rawText?.trim()) {
    return { ok: false, reason: 'Nothing to read — paste a description or a link first.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('extract-hackathon', {
      body: { text: rawText },
    });

    if (error) {
      return { ok: false, reason: friendly(error) };
    }
    if (data?.configured === false) {
      return { ok: false, reason: 'No LLM key is set on the Edge Function, so nothing was read automatically.' };
    }
    if (!data?.fields) {
      return { ok: false, reason: 'The extractor didn’t return any fields.' };
    }

    return { ok: true, fields: pick(data.fields), warning: data.warning };
  } catch (err) {
    return { ok: false, reason: friendly(err) };
  }
}

/**
 * Keep only known fields, and only sane values. The model is a helpful guesser,
 * not a source of truth — a malformed date it invents must never reach the DB,
 * where it would render as a confident wrong deadline.
 *
 * @param {object} fields
 * @returns {object}
 */
function pick(fields) {
  const out = {};
  for (const key of FIELDS) {
    const value = fields[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (!trimmed) continue;

    // Date fields must be exactly YYYY-MM-DD, or they are dropped.
    if (key.endsWith('_deadline') || key === 'event_start' || key === 'event_end') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) continue;
    }
    out[key] = trimmed;
  }
  return out;
}

function friendly(error) {
  const message = error?.message ?? String(error);
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Couldn’t reach the extractor.';
  }
  if (message.includes('404') || message.includes('not found')) {
    return 'The extract-hackathon function isn’t deployed yet.';
  }
  return message;
}
