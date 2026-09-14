-- 20260101000000_init_hackathons.sql
-- What: Initial schema — hackathons (what you're tracking) and
--       discovered_hackathons (what the scraper found).
-- Why:  v1 of the tracker. Single-user, so no auth, no RLS, no user_id.
--       See .claude/rules/supabase-conventions.md for the reasoning and for
--       the tripwire that would make RLS mandatory.

-- ---------------------------------------------------------------------------
-- hackathons — the tracker itself
-- ---------------------------------------------------------------------------
create table if not exists hackathons (
  id                      uuid primary key default gen_random_uuid(),

  name                    text not null,
  platform                text,
  source_url              text,

  problem_statement       text,
  team_size               text,

  -- Constrained on purpose: an unconstrained text status drifts into
  -- Registered / registered / reg within a month.
  status                  text not null default 'registered'
                            check (status in ('registered', 'shortlisted',
                                              'submitted', 'completed', 'missed')),

  -- Deadlines and event days are dates, not instants. A submission deadline is
  -- a day; storing it as timestamptz shifts it across timezones and produces
  -- off-by-one-day urgency exactly when it matters most.
  -- Nullable throughout: plenty of listings don't state a date, and a sentinel
  -- would render as a confident wrong deadline.
  registration_deadline   date,
  submission_deadline     date,
  round_dates             text,
  event_start             date,
  event_end               date,

  notes                   text,
  raw_text                text,   -- the pasted source, kept for re-extraction

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- The dashboard groups by status and sorts by deadline urgency; these are the
-- only two access patterns that exist.
create index if not exists hackathons_status_idx
  on hackathons (status);

create index if not exists hackathons_registration_deadline_idx
  on hackathons (registration_deadline);

create index if not exists hackathons_submission_deadline_idx
  on hackathons (submission_deadline);

-- ---------------------------------------------------------------------------
-- discovered_hackathons — the scraper's output, a staging area
-- ---------------------------------------------------------------------------
create table if not exists discovered_hackathons (
  id                uuid primary key default gen_random_uuid(),

  name              text not null,
  platform          text not null,

  -- Unique: the scraper re-runs on a schedule and upserts on this key rather
  -- than accumulating duplicate rows.
  source_url        text not null unique,

  deadline          date,
  scraped_at        timestamptz not null default now(),

  -- User state, not scraper state. The upsert lists its columns explicitly so
  -- a re-run never resets this back to false.
  added_to_tracker  boolean not null default false
);

create index if not exists discovered_hackathons_added_idx
  on discovered_hackathons (added_to_tracker, scraped_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hackathons_set_updated_at on hackathons;

create trigger hackathons_set_updated_at
  before update on hackathons
  for each row
  execute function set_updated_at();

-- No RLS is enabled on either table. This is a single-user app with no auth;
-- the anon key can read and write every row, which is acceptable for public
-- hackathon listings and personal notes on a hobby database. If a second user
-- or anything sensitive ever lands here, RLS stops being optional — and note
-- that enabling RLS without writing policies makes these tables silently
-- return zero rows, which reads as a bug rather than as a security setting.
