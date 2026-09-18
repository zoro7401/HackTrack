/**
 * extract-hackathon — multi-modal extraction for hackathon listings.
 *
 * Deno / Supabase Edge Function.
 *
 * Supports three input modes:
 *  1. Text: Copied text, description, or caption
 *  2. URL: Fetches public listing page server-side and extracts details
 *  3. Image/Screenshot: Vision-capable extraction for flyers/graphics (e.g. Instagram flyers)
 *
 * The contract with the frontend: **this function never makes the user lose their input.**
 * Every failure path returns 200 with configured/reason info, allowing the app
 * to drop the user into the manual form with their input intact.
 *
 * Configure with:
 *   supabase secrets set GROQ_API_KEY=gsk_...
 *   # or:
 *   supabase secrets set LLM_API_KEY=...
 *   supabase secrets set LLM_MODEL=...  # optional
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
  ? 'llama-3.3-70b-versatile'
  : (isOpenAICompatible ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022');

// Groq rotates its vision lineup often (llama-3.2-11b-vision-preview and
// llama-4-scout-17b-16e-instruct were both retired within the last year) —
// check console.groq.com/docs/vision if image extraction starts failing again.
const DEFAULT_VISION_MODEL = isGroq || LLM_URL.includes('groq.com')
  ? 'qwen/qwen3.6-27b'
  : (isOpenAICompatible ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022');

const LLM_MODEL = Deno.env.get('LLM_MODEL') ?? DEFAULT_MODEL;
const LLM_VISION_MODEL = Deno.env.get('LLM_VISION_MODEL') ?? DEFAULT_VISION_MODEL;

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

const SYSTEM_PROMPT = `You extract structured data from hackathon listings, web pages, or event flyer screenshots.

Return ONLY a valid JSON object, no prose, no commentary, and no markdown fences. Use these exact keys:
${FIELDS.map((f) => `  "${f}"`).join('\n')}

Rules:
- Use null for anything the text/image does not state. Never guess, and never infer a date from context. A wrong date is far worse than a missing one.
- Dates must be formatted strictly as YYYY-MM-DD. If given a day without a year, use the year that puts the date in the near future relative to today. If ambiguous, return null.
- "platform" is the host site/organizer (e.g., Unstop, Devfolio, Devpost, HackerEarth, MLH, or company/institution name).
- "team_size" is free text, e.g. "1-4" or "solo or up to 6".
- "round_dates" is free text describing multi-round timelines or schedules.
- "problem_statement" is the theme, tracks, or problem statement, concisely summarized.`;

interface RequestPayload {
  mode?: 'text' | 'url' | 'image';
  text?: string;
  url?: string;
  image?: string; // base64 data string (with or without data URL prefix)
  mimeType?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (!LLM_API_KEY) {
    return json({
      configured: false,
      reason: 'No LLM_API_KEY or GROQ_API_KEY is configured on this function.',
    });
  }

  let body: RequestPayload;
  try {
    body = await req.json();
  } catch {
    return json({ configured: true, fields: null, reason: 'Could not parse request body.' });
  }

  const mode = body.mode || (body.image ? 'image' : (body.url ? 'url' : 'text'));
  const today = new Date().toISOString().slice(0, 10);

  let sourceUrl = body.url || '';
  let extractedContent = '';
  let base64Image = '';
  let imageMime = body.mimeType || 'image/png';

  if (mode === 'url') {
    const rawUrl = String(body.url ?? '').trim();
    if (!rawUrl) {
      return json({ configured: true, fields: null, reason: 'No URL was provided.' });
    }
    sourceUrl = rawUrl;

    try {
      const pageText = await fetchPageContent(rawUrl);
      if (!pageText || pageText.length < 20) {
        return json({
          configured: true,
          fields: { source_url: rawUrl },
          reason: 'Could not fetch enough readable content from this URL.',
        });
      }
      extractedContent = `Source URL: ${rawUrl}\n\nWeb Page Content:\n${pageText.slice(0, 12000)}`;
    } catch (fetchErr) {
      return json({
        configured: true,
        fields: { source_url: rawUrl },
        reason: `Failed to fetch page (${fetchErr instanceof Error ? fetchErr.message : 'network error'}).`,
      });
    }
  } else if (mode === 'image') {
    let rawImage = String(body.image ?? '').trim();
    if (!rawImage) {
      return json({ configured: true, fields: null, reason: 'No image data was provided.' });
    }

    if (rawImage.startsWith('data:')) {
      const matches = rawImage.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        imageMime = matches[1];
        base64Image = matches[2];
      } else {
        base64Image = rawImage.split(',')[1] || rawImage;
      }
    } else {
      base64Image = rawImage;
    }
  } else {
    // Mode is text
    extractedContent = String(body.text ?? '').trim().slice(0, 12000);
    if (!extractedContent) {
      return json({ configured: true, fields: null, reason: 'No text was provided.' });
    }
  }

  try {
    let response: Response;
    const isVision = mode === 'image' && Boolean(base64Image);
    const activeModel = isVision ? LLM_VISION_MODEL : LLM_MODEL;

    if (isOpenAICompatible) {
      let userMessageContent: unknown;

      if (isVision) {
        userMessageContent = [
          {
            type: 'text',
            text: 'Extract all hackathon details from this flyer or graphic image into the requested JSON format.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageMime};base64,${base64Image}`,
            },
          },
        ];
      } else {
        userMessageContent = extractedContent;
      }

      const payload: Record<string, unknown> = {
        model: activeModel,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nToday is ${today}.` },
          { role: 'user', content: userMessageContent },
        ],
      };

      if (!isVision && (isGroq || LLM_URL.includes('groq.com') || LLM_URL.includes('openai.com'))) {
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
      // Anthropic format
      let userMessages: unknown[];

      if (isVision) {
        userMessages = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMime,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: 'Extract all hackathon details from this flyer or graphic image into the requested JSON format.',
          },
        ];
      } else {
        userMessages = [{ type: 'text', text: extractedContent }];
      }

      response = await fetch(LLM_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': LLM_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: activeModel,
          max_tokens: 1024,
          system: `${SYSTEM_PROMPT}\n\nToday is ${today}.`,
          messages: [{ role: 'user', content: userMessages }],
        }),
      });
    }

    if (!response.ok) {
      const detail = await response.text();
      console.error('LLM request failed:', response.status, detail.slice(0, 500));
      return json({
        configured: true,
        fields: sourceUrl ? { source_url: sourceUrl } : null,
        reason: `Extraction service responded with status ${response.status}.`,
      });
    }

    const resData = await response.json();
    const rawText = isOpenAICompatible
      ? resData?.choices?.[0]?.message?.content ?? ''
      : resData?.content?.[0]?.text ?? '';

    const parsed = parseJsonObject(rawText);
    if (!parsed) {
      return json({
        configured: true,
        fields: sourceUrl ? { source_url: sourceUrl } : null,
        reason: 'Could not parse structured fields from extractor response.',
      });
    }

    const { fields, dropped } = sanitize(parsed);

    // If source_url was provided directly in request, preserve it if model didn't find one
    if (sourceUrl && !fields.source_url) {
      fields.source_url = sourceUrl;
    }

    return json({
      configured: true,
      fields,
      warning: dropped.length > 0
        ? `Could not confidently determine: ${dropped.join(', ')}.`
        : undefined,
    });
  } catch (error) {
    console.error('Extraction handler failed:', error);
    return json({
      configured: true,
      fields: sourceUrl ? { source_url: sourceUrl } : null,
      reason: 'Extraction service encountered a network or processing error.',
    });
  }
});

async function fetchPageContent(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const html = await resp.text();

  // Most listing platforms render the actual details client-side, so the
  // stripped visible text below is often just app-shell chrome. Structured
  // data embedded in the initial HTML — JSON-LD (SEO markup for events) and
  // Next.js's __NEXT_DATA__ payload — usually still carries the real fields
  // even before anything hydrates, so pull those out first.
  const structured = extractStructuredData(html);

  // Basic HTML cleanup without heavy dependencies
  const bodyText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  return [structured, bodyText].filter(Boolean).join('\n\n');
}

/** JSON-LD and Next.js SSR payloads found in the raw HTML, each capped so one huge blob can't crowd out everything else. */
function extractStructuredData(html: string): string {
  const blobs: string[] = [];

  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = match[1]?.trim();
    if (raw) blobs.push(`JSON-LD data:\n${raw.slice(0, 4000)}`);
  }

  const nextData = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  )?.[1]?.trim();
  if (nextData) blobs.push(`Next.js page data:\n${nextData.slice(0, 6000)}`);

  return blobs.join('\n\n');
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

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
