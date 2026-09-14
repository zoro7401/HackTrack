import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { formatDate, describeDays, daysUntil, sortByUrgency } from '../lib/dates.js';

/**
 * What the scraper found on the public listing sites, newest first, with a
 * one-click copy into the tracker.
 *
 * Only these five platforms appear here, because they are the only ones the
 * scraper is allowed to touch. Anything spotted elsewhere gets added by hand.
 */
export default function Discover({ discovered, loading, error, onAddToTracker, onRefresh }) {
  const [platform, setPlatform] = useState('all');
  const [hideAdded, setHideAdded] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [failure, setFailure] = useState(null);

  const platforms = useMemo(
    () => [...new Set(discovered.map((d) => d.platform))].sort(),
    [discovered],
  );

  const visible = useMemo(() => {
    const filtered = discovered.filter((d) => {
      if (platform !== 'all' && d.platform !== platform) return false;
      if (hideAdded && d.added_to_tracker) return false;
      return true;
    });
    // Reuse the tracker's sort: deadline urgency is the right order here too.
    return sortByUrgency(
      filtered.map((d) => ({ ...d, registration_deadline: d.deadline })),
    );
  }, [discovered, platform, hideAdded]);

  async function handleAdd(find) {
    setBusyId(find.id);
    setFailure(null);
    const result = await onAddToTracker(find);
    setBusyId(null);
    if (!result.ok) setFailure(result.error);
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading discoveries">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="discover__head">
        <div>
          <h2 className="discover__title">Discover</h2>
          <p className="discover__meta">
            Unstop · Devfolio · Devpost · HackerEarth · MLH
          </p>
        </div>
        <button type="button" className="btn btn--sm" onClick={onRefresh}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      {failure ? <p className="notice notice--error" role="alert">{failure}</p> : null}

      {discovered.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No discoveries yet</p>
          <p className="empty__body">
            Run <code>npm run scrape</code> to pull the current listings from the five
            public platforms. Anything it finds shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="filters">
            <button
              type="button"
              className="chip"
              aria-pressed={platform === 'all'}
              onClick={() => setPlatform('all')}
            >
              All
            </button>
            {platforms.map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                aria-pressed={platform === name}
                onClick={() => setPlatform(name)}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              aria-pressed={hideAdded}
              onClick={() => setHideAdded((v) => !v)}
              style={{ marginLeft: 'auto' }}
            >
              Hide added
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              <p className="empty__title">Nothing matches</p>
              <p className="empty__body">
                Every listing here is either filtered out or already in your tracker.
              </p>
            </div>
          ) : (
            <ul>
              {visible.map((find) => {
                const days = daysUntil(find.deadline);
                return (
                  <li key={find.id} className="find" data-added={String(find.added_to_tracker)}>
                    <div className="find__body">
                      <p className="find__name">{find.name}</p>
                      <p className="find__meta">
                        <span>{find.platform}</span>
                        <span>{describeDays(days)}</span>
                        {find.deadline ? <span>{formatDate(find.deadline)}</span> : null}
                      </p>
                    </div>

                    {find.source_url ? (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={find.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Open <Icon name="external" size={12} />
                      </a>
                    ) : null}

                    {find.added_to_tracker ? (
                      <span className="btn btn--ghost btn--sm" aria-disabled="true">
                        <Icon name="check" /> Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => handleAdd(find)}
                        disabled={busyId === find.id}
                      >
                        {busyId === find.id ? 'Adding…' : 'Add to tracker'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
