import { supabase, isConfigured } from './supabase.js';

/**
 * Calls the `extract-hackathon` Edge Function to turn text, a URL, or an image screenshot into structured fields.
 *
 * Extraction failing is a normal path, not an error state. If no LLM key is
 * configured, or the call fails, or the model returns something unusable, the
 * caller drops the user into the manual form with their pasted text/URL intact.
 * Nothing is ever lost — that is the whole contract of this module.
 */

/** @typedef {{ok: true, fields: object, warning?: string}} ExtractSuccess */
/** @typedef {{ok: false, reason: string, partialFields?: object}} ExtractFailure */

const FIELDS = [
  'name', 'platform', 'source_url', 'problem_statement', 'team_size',
  'registration_deadline', 'submission_deadline', 'round_dates',
  'event_start', 'event_end',
];

/**
 * @param {string | { mode: 'text'|'url'|'image', text?: string, url?: string, image?: string, mimeType?: string }} input
 * @returns {Promise<ExtractSuccess|ExtractFailure>}
 */
export async function extractHackathon(input) {
  if (!isConfigured) {
    return { ok: false, reason: 'Supabase isn’t configured, so extraction is unavailable.' };
  }

  let payload = {};
  if (typeof input === 'string') {
    const isUrl = /^https?:\/\//i.test(input.trim());
    payload = isUrl ? { mode: 'url', url: input.trim() } : { mode: 'text', text: input };
  } else if (typeof input === 'object' && input !== null) {
    payload = input;
  }

  try {
    const { data, error } = await supabase.functions.invoke('extract-hackathon', {
      body: payload,
    });

    if (error) {
      return { ok: false, reason: friendly(error) };
    }
    if (data?.configured === false) {
      return { ok: false, reason: 'No LLM API key configured on Edge Function.' };
    }
    if (!data?.fields || Object.keys(data.fields).length === 0) {
      return {
        ok: false,
        reason: data?.reason || 'The extractor did not return structured fields.',
        partialFields: data?.fields || (payload.url ? { source_url: payload.url } : null),
      };
    }

    return { ok: true, fields: pick(data.fields), warning: data.warning };
  } catch (err) {
    return { ok: false, reason: friendly(err) };
  }
}

/**
 * Keep only known fields, and only sane values.
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

    // Date fields must be strictly YYYY-MM-DD
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
