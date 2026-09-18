-- 20260919000000_add_unregistered_status.sql
-- What: Allow 'unregistered' as a status value on hackathons.
-- Why:  A marker for hackathons worth tracking that you haven't registered
--       for yet — distinct from 'registered' onward, which all assume you're
--       in. Existing rows and the 'registered' default are untouched; this
--       only widens what the column accepts.

alter table hackathons drop constraint hackathons_status_check;

alter table hackathons
  add constraint hackathons_status_check
  check (status in ('unregistered', 'registered', 'shortlisted',
                     'submitted', 'completed', 'missed'));
