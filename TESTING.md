# Test plan

Automated tests cover the logic that fails silently. This document covers the
UI, which is faster to check by hand than to maintain a suite for at this size.

## Automated

```bash
npm test            # frontend/src/lib + backend/scripts/lib
npm run test:hooks  # the social-platform guardrail
```

| Suite | What it protects |
|-------|------------------|
| `frontend/src/lib/dates.test.js` | Urgency bands, the nearest-upcoming-deadline rule, sort order, timezone-safe day maths |
| `backend/scripts/lib/normalize.test.mjs` | Date parsing across the formats these sites actually use, and refusing to guess |
| `.claude/hooks/block-social-scraping.test.mjs` | The guardrail blocks real attempts and allows the docs that describe them |

Run these before committing anything under `frontend/src/lib/` or
`backend/scripts/`.

## Manual pass

Run `npm run dev` and work down the list. Roughly five minutes.

### Setup states

- [ ] **No env vars** — rename `frontend/.env.local`, reload. The dashboard
      explains what is missing and names the two variables. It does not hang or
      show a blank page.
- [ ] **No tables** — point at an empty project. The error says to run the
      migration, not `relation does not exist`.
- [ ] **Empty database** — tables exist, no rows. The empty state offers an
      *Add your first* button that opens the add panel.

### Dashboard

- [ ] Cards are grouped under Registered / Shortlisted / Submitted / Completed /
      Missed, in that order. Empty groups do not render at all.
- [ ] Within a group, the nearest deadline is first.
- [ ] Colour spine matches the countdown text: red ≤ 2 days, amber ≤ 7, teal
      beyond, grey once past.
- [ ] A hackathon whose registration has closed but whose **submission** is
      tomorrow shows as red, not grey. This is the rule most likely to regress.
- [ ] A hackathon marked completed or missed is grey even with a date tomorrow.
- [ ] The header pip matches the most urgent card on the board.
- [ ] A card with no dates at all reads "No deadline" and sits last.

### Adding

- [ ] **Paste and extract, key configured** — paste a real listing, press *Read
      it for me*. Fields pre-fill, a notice says to check them, dates look right.
- [ ] **Paste and extract, no key** — the same flow lands in the manual form
      with the pasted text preserved in notes, and a plain explanation. **Nothing
      is lost.** This is the single most important behaviour in the app.
- [ ] **Manual only** — *Fill in by hand* skips extraction entirely.
- [ ] Submitting with an empty name shows an inline error and focuses the name
      field. It does not save.
- [ ] A hackathon with only a name saves fine — every other field is optional.
- [ ] After saving, the card appears in the right status group immediately.

### Detail panel

- [ ] Clicking a card opens the panel with every recorded field. Empty fields are
      omitted rather than showing blanks.
- [ ] Changing status moves the card to the right group and the panel stays open.
- [ ] Edit → change a field → save updates the card behind the panel.
- [ ] Delete asks first. *Keep it* cancels; *Delete* removes and closes.
- [ ] The source link opens in a new tab.

### Discover

- [ ] Run `npm run scrape`, reload, open Discover. Rows appear, newest first.
- [ ] Platform filter chips narrow the list; *Hide added* toggles.
- [ ] *Add to tracker* creates a tracker card and flips the row to "Added".
- [ ] Re-running the scraper does **not** reset an added row back to unadded.
- [ ] The tab shows a count of unadded finds.

### Keyboard and accessibility

- [ ] Tab through the whole page — every control is reachable and the focus ring
      is clearly visible.
- [ ] Cards activate with Enter and Space (they are real buttons).
- [ ] Escape closes the add panel and the detail panel. In the detail panel it
      backs out of edit and delete-confirm first.
- [ ] The skip link appears on first Tab and jumps to the main content.
- [ ] In greyscale (DevTools → Rendering → emulate achromatopsia), urgency is
      still readable from the countdown text alone.

### Responsive and theme

- [ ] At 375px wide: single column, no horizontal scroll, panels fill the width,
      form buttons stretch.
- [ ] At 1440px: cards grid out, content stays within the max width.
- [ ] Toggle OS dark/light. Both themes are legible, and body text stays readable
      against its background in each.
- [ ] With reduced motion enabled, the urgency pip stops pulsing and panels
      appear without sliding.

## Known gaps

- No component tests. Deliberate at this size — the manual pass above is faster
  than maintaining RTL against a UI still finding its shape.
- Scraper modules are tested at the normalizer level, not end to end. The live
  check is `npm run scrape -- --dry-run`, which hits the real sites.
- The Edge Function has no automated test; it is checked through the add flow.
