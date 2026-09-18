# Hackathon Tracker

One dashboard for every hackathon you've registered for, plus a discovery feed from public listing sites. Personal, single-user, no accounts.

```
frontend/   React 18 + Vite app (Dashboard, Discover, 3-mode Add Hackathon, Detail panel)
backend/    Supabase migrations, Multi-modal Edge Function, Scraper scripts
.github/    GitHub Actions automated scraper workflow
```

---

## Getting Started

### 1. Supabase Setup
1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL Editor in Supabase and execute the migrations in order:
   - `backend/supabase/migrations/20260101000000_init_hackathons.sql`
   - `backend/supabase/migrations/20260102000000_disable_rls.sql`
   - `backend/supabase/migrations/20260103000000_add_discovered_details.sql`

### 2. Configure Environment Variables
Copy `.env.example` templates:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env.local
```

- **Frontend (`frontend/.env.local`)**:
  ```env
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key
  ```
- **Backend (`backend/.env.local`)**:
  ```env
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SERVICE_KEY=your-service-role-key
  ```

### 3. Local Development

```bash
npm install     # installs root and workspace dependencies
npm run dev     # starts Vite dev server at http://localhost:5173
```

---

## Features

### 1. Tracker Dashboard
- **Grouped by Status**: `unregistered`, `registered`, `shortlisted`, `submitted`, `completed`, `missed`.
- **Urgency Color Spine & Header Pip**:
  - 🔴 **Red (Urgent)**: Nearest deadline `< 2 days`
  - 🟡 **Yellow (Soon)**: Nearest deadline `< 7 days`
  - 🟢 **Green / Clear**: Deadline `≥ 7 days`
  - ⚪ **Grey / Past**: Deadline already passed or none set
- **Detail View**: View, edit, change status, or delete hackathon entries.

### 2. Add Hackathon (Three Input Modes + Fallback)
1. **Paste Text**: Paste raw description, email, or social post caption.
2. **Paste URL**: Paste a public listing page (e.g. Unstop, Devfolio, Devpost, HackerEarth, MLH). The Edge function fetches the public page server-side and extracts details.
3. **Upload Screenshot**: Upload or drag-and-drop a flyer/graphic (e.g. Instagram announcement). The Edge function uses vision LLM capabilities to extract details.
- **Manual Fallback**: If extraction is unavailable or fails, user input is never lost and seamlessly opens the review form.

### 3. Discovery Feed
- Surfaces listings scraped from legitimate public platforms (Unstop, Devfolio, and more).
- One-click **"Add to tracker"** copies the listing into your tracked hackathons and marks it as added.

---

## Automated Scraper

```bash
npm run scrape              # Scrapes all registered public platforms and upserts into DB
npm run scrape -- --dry-run # Preview scraped items without writing to DB
npm run scrape -- --only unstop
```

### GitHub Actions (Scheduled Daily)
The repository includes `.github/workflows/scrape.yml` configured to run daily at 06:00 UTC.
To enable:
1. Go to your GitHub repository **Settings → Secrets and variables → Actions**.
2. Add secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

---

## Multi-Modal Edge Function Deployment

Deploy the `extract-hackathon` function with your LLM API key:

```bash
# Link project (if not linked)
supabase link --project-ref your-project-ref

# Deploy function
supabase functions deploy extract-hackathon

# Set secrets for Groq (default) or OpenAI / Anthropic
supabase secrets set GROQ_API_KEY=gsk_...
# Or:
# supabase secrets set LLM_API_KEY=sk-...
# supabase secrets set LLM_MODEL=gpt-4o-mini
```

---

## Frontend Deployment (Vercel)

1. Import the repository in [Vercel](https://vercel.com).
2. Configure **Root Directory**: `frontend` (or leave as root with provided `vercel.json`).
3. Set Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

---

## Constraints & Platform Rules

- **Strict Proscription**: NEVER scrape or automate against Instagram, LinkedIn, or any login-walled personal social platform.
- **Scraping Allowlist**: Strictly public listing platforms intended for discovery (`Unstop`, `Devfolio`, `Devpost`, `HackerEarth`, `MLH`).
- Manual copy-paste or flyer screenshot upload **by the user** is fully supported.
