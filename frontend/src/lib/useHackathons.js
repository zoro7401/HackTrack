import { useCallback, useEffect, useState } from 'react';
import { supabase, isConfigured, HACKATHON_FIELDS, describeError } from './supabase.js';

/**
 * Owns everything to do with the `hackathons` table: fetch, loading, error, and
 * mutations. Components call this; they never touch the client directly.
 *
 * Returns a flat object rather than a tuple — named fields survive refactors.
 */
export function useHackathons() {
  const [hackathons, setHackathons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!isConfigured) {
      setError(
        'Supabase isn’t configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        'to frontend/.env.local, then restart the dev server.',
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('hackathons')
      .select(HACKATHON_FIELDS)
      .order('created_at', { ascending: false });

    setError(describeError(dbError));
    setHackathons(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * @param {object} fields
   * @returns {Promise<{ok: boolean, error?: string, data?: object}>}
   */
  const addHackathon = useCallback(async (fields) => {
    const { data, error: dbError } = await supabase
      .from('hackathons')
      .insert(clean(fields))
      .select(HACKATHON_FIELDS)
      .single();

    if (dbError) return { ok: false, error: describeError(dbError) };
    setHackathons((prev) => [data, ...prev]);
    return { ok: true, data };
  }, []);

  const updateHackathon = useCallback(async (id, fields) => {
    const { data, error: dbError } = await supabase
      .from('hackathons')
      .update(clean(fields))
      .eq('id', id)
      .select(HACKATHON_FIELDS)
      .single();

    if (dbError) return { ok: false, error: describeError(dbError) };
    setHackathons((prev) => prev.map((h) => (h.id === id ? data : h)));
    return { ok: true, data };
  }, []);

  /**
   * Status changes are optimistic — it is the most frequent action in the app,
   * and a failure is immediately visible because the value snaps back.
   */
  const setStatus = useCallback(async (id, status) => {
    let previous;
    setHackathons((prev) => {
      previous = prev;
      return prev.map((h) => (h.id === id ? { ...h, status } : h));
    });

    const { error: dbError } = await supabase
      .from('hackathons')
      .update({ status })
      .eq('id', id);

    if (dbError) {
      setHackathons(previous);
      return { ok: false, error: describeError(dbError) };
    }
    return { ok: true };
  }, []);

  const deleteHackathon = useCallback(async (id) => {
    const { error: dbError } = await supabase.from('hackathons').delete().eq('id', id);
    if (dbError) return { ok: false, error: describeError(dbError) };
    setHackathons((prev) => prev.filter((h) => h.id !== id));
    return { ok: true };
  }, []);

  return {
    hackathons,
    loading,
    error,
    refresh,
    addHackathon,
    updateHackathon,
    setStatus,
    deleteHackathon,
  };
}

/**
 * Drop empty strings so they land as NULL rather than ''. An empty-string date
 * is a Postgres type error, and an empty-string deadline would read as "no
 * deadline" anyway — better to store the absence honestly.
 *
 * @param {object} fields
 * @returns {object}
 */
function clean(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== '' && v !== undefined),
  );
}
