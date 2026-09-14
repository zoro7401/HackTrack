import { useCallback, useEffect, useState } from 'react';
import { supabase, isConfigured, DISCOVERED_FIELDS, describeError } from './supabase.js';

/**
 * Owns the `discovered_hackathons` table — the scraper's output.
 *
 * Read-mostly: the app's only write here is flipping `added_to_tracker` when a
 * row is copied into the tracker. The scraper never writes that column back,
 * so this flag is safe from being reset by a re-run.
 */
export function useDiscovered() {
  const [discovered, setDiscovered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('discovered_hackathons')
      .select(DISCOVERED_FIELDS)
      .order('scraped_at', { ascending: false })
      .limit(200);

    setError(describeError(dbError));
    setDiscovered(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Mark a discovered row as copied into the tracker. Optimistic, and reverted
   * on failure so the button never lies about what happened.
   *
   * @param {string} id
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  const markAdded = useCallback(async (id) => {
    setDiscovered((prev) =>
      prev.map((d) => (d.id === id ? { ...d, added_to_tracker: true } : d)));

    const { error: dbError } = await supabase
      .from('discovered_hackathons')
      .update({ added_to_tracker: true })
      .eq('id', id);

    if (dbError) {
      setDiscovered((prev) =>
        prev.map((d) => (d.id === id ? { ...d, added_to_tracker: false } : d)));
      return { ok: false, error: describeError(dbError) };
    }
    return { ok: true };
  }, []);

  return { discovered, loading, error, refresh, markAdded };
}
