# Hackathon Tracker — Agent Guidelines & Memory

A personal, single-user web app for tracking registered hackathons and discovering new ones from legitimate public listing platforms. Replaces scattered notes, screenshots, and browser tabs across Unstop, Devfolio, Devpost, HackerEarth, and MLH.

---

## 1. Core Constraints & Platform Rules

### 🛑 Hard Constraint: Social Platform Scraping Prohibited
- **NEVER scrape, automate, or log into Instagram, LinkedIn, or any login-walled social platform.**
- Doing so violates their Terms of Service and is explicitly out of scope for automated jobs.
- **Supported user flow**: Manual user paste (text/captions) or screenshot uploads (e.g., event flyers/graphics) of Instagram/LinkedIn content **BY THE USER** is a core supported feature.
- **Automated scraping is strictly prohibited for these platforms.**

### ✅ Allowed Public Listing Sites for Automated Scraping
Automated scraping is strictly restricted to public listing pages designed for discovery without login:

| Platform    | Allowed Public Listing URL            |
|-------------|---------------------------------------|
| Unstop      | `https://unstop.com/hackathons`       |
| Devfolio    | `https://devfolio.co/hackathons`      |
| Devpost     | `https://devpost.com/hackathons`      |
| HackerEarth | `https://hackerearth.com/challenges`  |
| MLH         | `https://mlh.io/seasons/2026/events`  |

All scrapers must respect `robots.txt`, utilize polite User-Agents, and adhere to rate limits.

---

## 2. Tech Stack & Architecture

- **Frontend**: React 18 + Vite, functional components, hooks-based state, vanilla CSS with custom design tokens (no Tailwind, no heavy UI libraries).
- **Backend / Database**: Supabase Postgres (no Auth, RLS disabled for single-user personal use).
- **Extraction Service**: Supabase Edge Function (Deno) calling text & vision LLM APIs (OpenAI / Groq / Anthropic) with graceful fallback to manual entry.
- **Automated Scraper**: Standalone Node.js scripts executed periodically via GitHub Actions cron.
- **Testing**: Vitest for pure business logic (deadlines, date math, scrapers, sanitizers).

---

## 3. Directory Layout

```
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components (AddHackathon, DetailPanel, HackathonCard, etc.)
│   │   ├── pages/           # Route views (Dashboard, Discover)
│   │   ├── lib/             # Supabase client, date helpers, extraction client, hooks
│   │   └── styles/          # Design tokens (tokens.css) & global styles (global.css)
│   ├── package.json
│   ├── vercel.json          # SPA routing configuration
│   └── vite.config.js
├── backend/
│   ├── supabase/
│   │   ├── migrations/      # Versioned SQL migrations
│   │   └── functions/
│   │       └── extract-hackathon/ # Multi-modal Deno Edge Function
│   ├── scripts/
│   │   ├── scrapers/        # Scraper modules (unstop.mjs, devfolio.mjs, etc.)
│   │   └── scrape.mjs       # CLI runner for scrapers
│   ├── package.json
│   └── vitest.config.js
├── .github/
│   └── workflows/
│       └── scrape.yml       # Scheduled GitHub Actions cron runner
├── AGENTS.md                # Agent memory & project constraints
├── CLAUDE.md                # Claude context & conventions
└── README.md                # Setup & deployment documentation
```

---

## 4. Coding Conventions

- **Functional Components & Hooks**: Use functional React components and React hooks (`useState`, `useEffect`, `useMemo`, custom hooks). Do not use class components or heavy external state managers.
- **Data Layer**: Keep data fetching and mutation logic in custom hooks under `frontend/src/lib/` (e.g., `useHackathons.js`, `useDiscovered.js`).
- **Dates**: Store dates as ISO strings (`YYYY-MM-DD`). Never store JavaScript `Date` objects in DB rows.
- **Graceful Degradation**: If an LLM extraction fails (network error, missing API key, or invalid output), always fall back gracefully to the manual form with user input preserved. Never cause the user to lose their input.
- **Urgency Rules**:
  - Red: `< 2 days` until nearest upcoming deadline
  - Yellow: `< 7 days` until nearest upcoming deadline
  - Green: `≥ 7 days` or no deadline / past deadline
