# Hackathon Tracker

A single-user personal web app for tracking hackathons Zoro has registered for, and
discovering new ones from public listing platforms. Replaces scattered notes,
screenshots, and browser tabs across Unstop/Devfolio/Devpost.

## Core constraint — read this first

**Never scrape, automate, or log into Instagram, LinkedIn, or any login-walled
social platform.** It violates their ToS and is explicitly out of scope. Hackathons
found on those platforms get added by hand through the manual form.

The scraping allowlist is exactly these five public listing sites:

| Platform    | Listing page                          |
|-------------|---------------------------------------|
| Unstop      | https://unstop.com/hackathons         |
| Devfolio    | https://devfolio.co/hackathons        |
| Devpost     | https://devpost.com/hackathons        |
| HackerEarth | https://hackerearth.com/challenges    |
| MLH         | https://mlh.io/seasons/2026/events    |

Adding a sixth platform is a deliberate decision — it must have a public listing
page intended for discovery, and it must not require auth. See
`.claude/rules/scraper-conventions.md`.

## Tech stack

- **Frontend** — React 18 + Vite, plain CSS with design tokens (no Tailwind, no UI kit)
- **Database** — Supabase Postgres. No Auth, no RLS (single user)
- **Extraction** — Supabase Edge Function (Deno) calling an LLM API, key is pluggable
- **Scraper** — standalone Node script, cheerio for static HTML
- **Tests** — Vitest for units

## Folder structure

The repo is split into two independently-runnable halves. `frontend/` is a Vite app
with its own `package.json`; `backend/` holds everything that runs on a server or
Supabase and has its own `package.json` too. There is no shared build step — they
talk to each other only through the Supabase database.

```
frontend/
  package.json     Vite app, `npm run dev`
  src/
    components/    Presentational + small stateful components
    pages/         Route-level views (Dashboard, Discover)
    lib/           supabase client, date/urgency helpers, types
    styles/        tokens.css + global.css
backend/
  package.json     Scraper + tests, `npm run scrape`
  supabase/
    migrations/    Timestamped SQL, applied in order
    functions/     Edge Functions (Deno)
  scripts/
    scrapers/      One module per platform, uniform interface
    scrape.mjs     Runner — invoked by `npm run scrape`
.claude/
  rules/           Domain conventions loaded per-task
  commands/        Slash commands
  hooks/           Guardrails
```

Root `package.json` carries only convenience scripts that delegate into the two
workspaces — keep build logic in the workspace that owns it.

## Coding conventions

- **Functional components only.** No class components, ever.
- **Hooks for state.** `useState`/`useEffect`/custom hooks. No Redux, no Zustand,
  no Context unless two distant subtrees genuinely need the same data.
- Data fetching lives in custom hooks under `frontend/src/lib/` (e.g. `useHackathons`), not
  inline in components.
- Named exports for utilities; default export for components.
- Dates are ISO strings (`YYYY-MM-DD`) in the DB and in JS. Never store Date objects.
- No `any` in shared helpers — this is plain JS, so use JSDoc types where it helps.

See `.claude/rules/react-conventions.md` for component-level detail.

## Testing expectations

- **Vitest** for pure logic: deadline urgency math, date formatting, scraper
  normalizers, LLM response parsing. These are the parts that silently break.
- **Manual test plan** for UI, documented in `TESTING.md`. No Playwright/RTL yet —
  it's a single-user app and the manual pass is faster than maintaining a suite.
- Run `npm test` before committing changes to `frontend/src/lib/` or `backend/scripts/`.

## Product rules that aren't obvious from the code

- Status values are exactly: `unregistered`, `registered`, `shortlisted`, `submitted`,
  `completed`, `missed`.
- Deadline urgency: red < 2 days, yellow < 7 days, green beyond that or no deadline.
  Urgency is computed from the *nearest upcoming* deadline among registration and
  submission, not whichever field happens to be set.
- Past deadlines are not "red" — they're neutral/past. Screaming about a deadline
  that already passed is noise.
- Extraction failure is a normal path, not an error state. If `LLM_API_KEY` is unset
  or the call fails, the UI drops the user into the manual form with their pasted
  text preserved.
