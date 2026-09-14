import HackathonCard from './HackathonCard.jsx';
import { sortByUrgency } from '../lib/dates.js';
import { STATUS_LABELS } from '../lib/supabase.js';

/**
 * One status section of the dashboard, with its cards sorted by urgency.
 *
 * Renders nothing when empty. Five permanently-visible headers with four of
 * them blank is worse than a shorter board — the dashboard should show what
 * you have, not a form you failed to fill in.
 */
export default function StatusGroup({ status, hackathons, onSelect }) {
  if (hackathons.length === 0) return null;

  const sorted = sortByUrgency(hackathons);

  return (
    <section className="group" aria-labelledby={`group-${status}`}>
      <div className="group__head">
        <h2 className="group__title" id={`group-${status}`}>
          {STATUS_LABELS[status] ?? status}
        </h2>
        <span className="group__count">{hackathons.length}</span>
        <span className="group__rule" aria-hidden="true" />
      </div>

      <div className="cards">
        {sorted.map((hackathon) => (
          <HackathonCard key={hackathon.id} hackathon={hackathon} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
