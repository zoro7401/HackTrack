# Hackathon Tracker

One dashboard for every hackathon you've registered for, plus a discovery feed
from the public listing sites. Personal, single-user, no accounts.

```
frontend/   React + Vite app
backend/    Supabase migrations, Edge Function, scraper
.claude/    Project config for Claude Code — rules, commands, guardrail hook
```

## Getting it running

**1. Create a Supabase project** at [supabase.com](https://supabase.com). No auth
setup needed.

**2. Run the migration.** Open the SQL editor in the Supabase dashboard, paste in
`backend/supabase/migrations/20260101000000_init_hackathons.sql`, and run it.
That creates `hackathons` and `discovered_hackathons`.

**3. Fill in the env files.** Both are gitignored.

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example  backend/.env.local
```

Keys live in Supabase under Project Settings → API. The frontend takes the URL
and the `anon` key; the backend takes the URL and the `service_role` key.

**4. Install and run.**

```bash
npm install     # installs both workspaces
npm run dev     # http://localhost:5173
```

## Using it

**The tracker** groups everything by status, and inside each group sorts by
whichever deadline lands soonest. The colour spine on each card is the fast
signal — red under two days, amber under a week, teal beyond that, grey once
it has passed. The countdown is always spelled out in text as well, so a card
still works in greyscale or in a screenshot.

The pip beside the title in the header takes the colour of the most urgent thing
you are tracking. Glance at the tab, know whether to panic.

**Adding one** takes two paths. Paste the listing text and press *Read it for me*
to have the Edge Function pull out the fields, or fill the form in by hand.
Either way you review before it saves. If extraction is unavailable — no API key,
no network — you land in the manual form with your pasted text intact. That is a
normal path, not an error.

**Discover** shows what the scraper found. *Add to tracker* copies a listing
across and marks it as taken so it stops appearing.

## The scraper

```bash
npm run scrape              # write to discovered_hackathons
npm run scrape -- --dry-run # print what it would write
npm run scrape -- --only unstop
```

Unstop and Devfolio are implemented. Devpost, HackerEarth, and MLH are the next
three — `/add-scraper-source` scaffolds one following the existing pattern.

It checks `robots.txt` before every fetch, waits at least two seconds between
requests to the same host, identifies itself honestly, and stops entirely on a
429 or 403.

### Scheduling it

**Windows Task Scheduler**, daily at 9am:

```powershell
$action  = New-ScheduledTaskAction -Execute "npm" -Argument "run scrape" -WorkingDirectory "C:\Users\PIYUSH\Documents\hacktrack"
$trigger = New-ScheduledTaskTrigger -Daily -At 9am
Register-ScheduledTask -TaskName "HackathonScrape" -Action $action -Trigger $trigger
```

**GitHub Actions**, if you would rather it run without the laptop on. Add
`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as repository secrets first:

```yaml
# .github/workflows/scrape.yml
name: Scrape listings
on:
  schedule: [{ cron: '0 4 * * *' }]   # 09:30 IST
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npm run scrape
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

**cron**, on a machine that is always up:

```
30 9 * * * cd /path/to/hacktrack && npm run scrape >> /var/log/hacktrack.log 2>&1
```

## Extraction (optional)

The paste-and-extract flow needs the Edge Function deployed with a key. Without
one, the app falls back to the manual form and says so.

```bash
supabase functions deploy extract-hackathon
supabase secrets set GROQ_API_KEY=gsk_...
# optional model override (defaults to llama-3.3-70b-versatile for Groq):
supabase secrets set LLM_MODEL=llama-3.3-70b-versatile
```

## Tests

```bash
npm test            # both workspaces
npm run test:hooks  # the social-platform guardrail
```

Vitest covers the logic that breaks silently: deadline urgency, date parsing,
scraper normalizers. The UI is covered by the manual pass in
[TESTING.md](TESTING.md).

## What this does not do

No accounts, no notifications, no mobile app.

It does not scrape Instagram, LinkedIn, or any login-walled platform — out of scope, permanently.
Hackathons you spot there go in through the manual form, which is exactly why
that path exists.

The rule is stated in [CLAUDE.md](CLAUDE.md) and
[.claude/rules/scraper-conventions.md](.claude/rules/scraper-conventions.md), and
enforced by a pre-tool-use hook that refuses to write such code.
