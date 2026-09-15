import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { formatDate, describeDays, daysUntil, sortByUrgency } from '../lib/dates.js';

/** A blank or missing fee reads the same as an explicit "Free". */
function isFree(entryFee) {
  return !entryFee || entryFee.trim().toLowerCase() === 'free';
}

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [location, setLocation] = useState('all');
  const [freeOnly, setFreeOnly] = useState(false);
  const [hasPrizeOnly, setHasPrizeOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [failure, setFailure] = useState(null);

  const platforms = useMemo(
    () => [...new Set(discovered.map((d) => d.platform))].sort(),
    [discovered],
  );

  const locations = useMemo(
    () => [...new Set(discovered.map((d) => d.location).filter(Boolean))].sort(),
    [discovered],
  );

  const activeFilterCount = [
    location !== 'all', freeOnly, hasPrizeOnly,
  ].filter(Boolean).length;

  const visible = useMemo(() => {
    const filtered = discovered.filter((d) => {
      if (platform !== 'all' && d.platform !== platform) return false;
      if (hideAdded && d.added_to_tracker) return false;
      if (location !== 'all' && d.location !== location) return false;
      if (freeOnly && !isFree(d.entry_fee)) return false;
      if (hasPrizeOnly && !d.prize_money) return false;
      return true;
    });
    // Reuse the tracker's sort: deadline urgency is the right order here too.
    return sortByUrgency(
      filtered.map((d) => ({ ...d, registration_deadline: d.deadline })),
    );
  }, [discovered, platform, hideAdded, location, freeOnly, hasPrizeOnly]);

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
            <button
              type="button"
              className="chip"
              aria-pressed={filtersOpen}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Icon name="filter" size={12} /> Filters
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>

          {filtersOpen ? (
            <div className="filters filters--panel">
              <label className="field__label" htmlFor="find-location">
                Location
              </label>
              <select
                id="find-location"
                className="select"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              >
                <option value="all">All locations</option>
                {locations.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              <button
                type="button"
                className="chip"
                aria-pressed={freeOnly}
                onClick={() => setFreeOnly((v) => !v)}
              >
                Free entry only
              </button>

              <button
                type="button"
                className="chip"
                aria-pressed={hasPrizeOnly}
                onClick={() => setHasPrizeOnly((v) => !v)}
              >
                Has prize money
              </button>
            </div>
          ) : null}

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
                      {find.location || find.entry_fee || find.prize_money ? (
                        <p className="find__meta find__meta--details">
                          {find.location ? (
                            <span><Icon name="map-pin" size={12} /> {find.location}</span>
                          ) : null}
                          {find.entry_fee ? (
                            <span><Icon name="tag" size={12} /> {find.entry_fee}</span>
                          ) : null}
                          {find.prize_money ? (
                            <span><Icon name="trophy" size={12} /> {find.prize_money}</span>
                          ) : null}
                        </p>
                      ) : null}
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
