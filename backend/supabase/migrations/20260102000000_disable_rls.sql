-- 20260102000000_disable_rls.sql
-- What: Explicitly disable Row Level Security on hackathons and discovered_hackathons.
-- Why:  Supabase defaults to enabling RLS on newly created tables. Without policies,
--       Postgres silently returns 0 rows to anon clients. Since this is a single-user
--       personal tracker without authentication, RLS is disabled so the frontend anon
--       client can read and write.

alter table if exists hackathons disable row level security;
alter table if exists discovered_hackathons disable row level security;
