import { createClient } from '@supabase/supabase-js';

/**
 * The one Supabase client. Imported by the data hooks in this directory and by
 * nothing else — components go through a hook so the data layer stays swappable
 * and the components stay testable.
 *
 * No auth: single-user app, no RLS on any table. See
 * .claude/rules/supabase-conventions.md for why, and for the tripwire that
 * would make that stop being true.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when env vars are missing, so the UI can say so instead of hanging. */
export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

/** Columns selected for the tracker. Explicit, so a new column can't surprise the UI. */
export const HACKATHON_FIELDS = [
  'id', 'name', 'platform', 'source_url', 'problem_statement', 'team_size',
  'status', 'registration_deadline', 'submission_deadline', 'round_dates',
  'event_start', 'event_end', 'notes', 'raw_text', 'created_at', 'updated_at',
].join(', ');

export const DISCOVERED_FIELDS = [
  'id', 'name', 'platform', 'source_url', 'deadline', 'scraped_at', 'added_to_tracker',
].join(', ');

export const STATUSES = ['registered', 'shortlisted', 'submitted', 'completed', 'missed'];

export const STATUS_LABELS = {
  registered: 'Registered',
  shortlisted: 'Shortlisted',
  submitted: 'Submitted',
  completed: 'Completed',
  missed: 'Missed',
};

/**
 * Turn a Supabase error into something a person can act on.
 *
 * Supabase resolves with an `error` field rather than throwing, so every call
 * site has to check it — an unchecked call fails silently and shows a blank
 * dashboard, which is the worst possible way to learn the table is missing.
 *
 * @param {object|null} error
 * @returns {string|null} a message to show, or null when there was no error
 */
export function describeError(error) {
  if (!error) return null;

  if (error.message?.includes('Failed to fetch')) {
    return 'Can’t reach Supabase. Check your connection and VITE_SUPABASE_URL.';
  }
  if (error.code === '42P01') {
    return 'The tables don’t exist yet. Run the migration in backend/supabase/migrations/.';
  }
  if (error.code === '23514') {
    return 'That status isn’t one of the five allowed values.';
  }
  if (error.code === '23505') {
    return 'That one is already in the tracker.';
  }
  return error.message ?? 'Something went wrong talking to the database.';
}
