/**
 * extract-hackathon — turns a pasted hackathon listing into structured fields.
 *
 * Deno / Supabase Edge Function.
 *
 * The contract with the frontend, in one line: **this function never makes the
 * user lose their paste.** Every failure path returns 200 with a reason, and the
 * app drops the user into the manual form with their text intact. A 500 here
 * would surface as a scary error for what is a perfectly normal situation —
 * no API key configured yet.
 *
 * Configure with:
 *   supabase secrets set GROQ_API_KEY=gsk_...
 *   # or:
 *   supabase secrets set LLM_API_KEY=gsk_...
 *   supabase secrets set LLM_MODEL=llama-3.3-70b-versatile  # optional
 *
 * Deploy with:
 *   supabase functions deploy extract-hackathon
 */

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
const LLM_API_KEY = GROQ_API_KEY ?? Deno.env.get('LLM_API_KEY');

const isGroq = Boolean(GROQ_API_KEY) ||
  (LLM_API_KEY?.startsWith('gsk_') ?? false) ||
  (Deno.env.get('LLM_URL')?.includes('groq.com') ?? false);

const DEFAULT_URL = isGroq
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : 'https://api.anthropic.com/v1/messages';

const LLM_URL = Deno.env.get('LLM_URL') ?? DEFAULT_URL;
const isOpenAICompatible = isGroq ||
  LLM_URL.includes('/chat/completions') ||
  LLM_URL.includes('openai.com') ||
  LLM_URL.includes('groq.com') ||
  LLM_URL.includes('openrouter.ai');

const DEFAULT_MODEL = isGroq || LLM_URL.includes('groq.com')
  ? 'groq/compound-mini'
  : (isOpenAICompatible ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022');

const LLM_MODEL = Deno.env.get('LLM_MODEL') ?? DEFAULT_MODEL;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** The columns the model is allowed to fill. Anything else is discarded. */
const FIELDS = [
  'name',
  'platform',
  'source_url',
  'problem_statement',
  'team_size',
  'registration_deadline',
  'submission_deadline',
  'round_dates',
  'event_start',
  'event_end',
] as const;

const DATE_FIELDS = new Set([
  'registration_deadline',
  'submission_deadline',
  'event_start',
  'event_end',
]);

const SYSTEM_PROMPT = `You extract structured data from hackathon listings.

Return ONLY a JSON object, no prose and no markdown fence. Use these keys:
${FIELDS.map((f) => `  "${f}"`).join('\n')}

Rules:
- Use null for anything the text does not state. Never guess, and never infer a
  date from context. A wrong date is far worse than a missing one, because the
  app will show it as a confident deadline.
- Dates must be exactly YYYY-MM-DD. If the text gives a day without a year, use
  the year that makes the date fall in the future relative to today. If that is
  still ambiguous, return null.
- "platform" is the site hosting it (Unstop, Devfolio, Devpost, HackerEarth,
  MLH, or the organiser's own name).
- "team_size" is free text, e.g. "2-4" or "solo or up to 6".
- "round_dates" is free text describing multi-round schedules.
- "problem_statement" is the theme or problem, trimmed to its essentials.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Not configured is a supported state, not an error. Say so plainly and let
  // the app fall back to the manual form.
  if (!LLM_API_KEY) {
    return json({
      configured: false,
      reason: 'No GROQ_API_KEY or LLM_API_KEY is set on this function.',
    });
  }

  let text: string;
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim();
  } catch {
    return json({ configured: true, fields: null, reason: 'Could not read the request body.' });
  }

  if (!text) {
    return json({ configured: true, fields: null, reason: 'No text was sent.' });
  }

  // A whole page of pasted HTML costs tokens and adds nothing — the useful
  // details are always near the top.
  const excerpt = text.slice(0, 12000);
  const today = new Date().toISOString().slice(0, 10);

  try {
    let response: Response;
    if (isOpenAICompatible) {
      const payload: Record<string, unknown> = {
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nToday is ${today}.` },
          { role: 'user', content: excerpt },
        ],
      };

      if (isGroq || LLM_URL.includes('groq.com') || LLM_URL.includes('openai.com')) {
        payload.response_format = { type: 'json_object' };
      }

      response = await fetch(LLM_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    } else {
      response = await fetch(LLM_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': LLM_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 1024,
          system: `${SYSTEM_PROMPT}\n\nToday is ${today}.`,
          messages: [{ role: 'user', content: excerpt }],
        }),
      });
    }

    if (!response.ok) {
      const detail = await response.text();
      console.error('LLM call failed', response.status, detail.slice(0, 500));
      return json({
        configured: true,
        fields: null,
        reason: `The extractor returned ${response.status}.`,
      });
    }

    const payload = await response.json();
    const raw = isOpenAICompatible
      ? payload?.choices?.[0]?.message?.content ?? ''
      : payload?.content?.[0]?.text ?? '';
    const parsed = parseJsonObject(raw);

    if (!parsed) {
      return json({
        configured: true,
        fields: null,
        reason: 'The extractor did not return usable JSON.',
      });
    }

    const { fields, dropped } = sanitize(parsed);

    return json({
      configured: true,
      fields,
      warning: dropped.length > 0
        ? `Couldn't read ${dropped.join(', ')} — fill those in yourself.`
        : undefined,
    });
  } catch (error) {
    console.error('extract-hackathon failed', error);
    return json({
      configured: true,
      fields: null,
      reason: 'The extractor could not be reached.',
    });
  }
});

/** Always 200 — see the contract note at the top of this file. */
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/**
 * Pull a JSON object out of the model's reply, tolerating a markdown fence or
 * a stray sentence around it.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * Keep only known fields with sane values. The model is a helpful guesser, not
 * a source of truth — a malformed date it invents must never reach the DB.
 */
function sanitize(input: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  const dropped: string[] = [];

  for (const key of FIELDS) {
    const value = input[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'null') continue;

    if (DATE_FIELDS.has(key)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
        dropped.push(key.replace(/_/g, ' '));
        continue;
      }
    }

    fields[key] = trimmed;
  }

  return { fields, dropped };
}
