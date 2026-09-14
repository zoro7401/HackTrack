import StatusGroup from '../components/StatusGroup.jsx';
import Icon from '../components/Icon.jsx';
import { STATUSES } from '../lib/supabase.js';

/**
 * The board: every tracked hackathon, grouped by status, each group sorted by
 * how soon its next deadline lands.
 *
 * Group order is the lifecycle order — the things you can still act on sit at
 * the top, and completed/missed settle at the bottom where they belong.
 */
export default function Dashboard({ hackathons, loading, error, onSelect, onAdd }) {
  if (loading) {
    return (
      <div className="cards" aria-busy="true" aria-label="Loading hackathons">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}
      </div>
    );
  }

  if (error) {
    return (
      <p className="notice notice--error" role="alert">{error}</p>
    );
  }

  if (hackathons.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Nothing tracked yet</p>
        <p className="empty__body">
          Add the hackathons you have registered for and this becomes the one place
          their deadlines live. Paste a listing and it fills in most of the fields.
        </p>
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          <Icon name="plus" /> Add your first
        </button>
      </div>
    );
  }

  const byStatus = groupByStatus(hackathons);

  return (
    <div className="board">
      {STATUSES.map((status) => (
        <StatusGroup
          key={status}
          status={status}
          hackathons={byStatus[status] ?? []}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/**
 * @param {Array<object>} hackathons
 * @returns {Record<string, Array<object>>}
 */
function groupByStatus(hackathons) {
  const groups = {};
  for (const hackathon of hackathons) {
    const key = hackathon.status ?? 'registered';
    (groups[key] ??= []).push(hackathon);
  }
  return groups;
}
