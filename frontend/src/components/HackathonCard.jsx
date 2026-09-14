import { urgencyFor, nextDeadline, describeDays, formatDate, DEADLINE_LABELS } from '../lib/dates.js';

/**
 * One hackathon at a glance: name, platform, and how long you have.
 *
 * The urgency colour is the fast signal, but it never carries the meaning
 * alone — the countdown is spelled out in text right beside it, so the card
 * works without colour vision and in a screenshot.
 */
export default function HackathonCard({ hackathon, onSelect }) {
  const urgency = urgencyFor(hackathon);
  const next = nextDeadline(hackathon);
  const label = next ? DEADLINE_LABELS[next.field] : null;

  return (
    <button
      type="button"
      className="card"
      data-urgency={urgency}
      onClick={() => onSelect(hackathon)}
    >
      <div className="card__top">
        <h3 className="card__name">{hackathon.name}</h3>
        {hackathon.platform ? (
          <span className="card__platform">{hackathon.platform}</span>
        ) : null}
      </div>

      <div className="card__foot">
        <span className="card__countdown">{describeDays(next?.days ?? null)}</span>
        {next ? (
          <span className="card__when">
            {label} · {formatDate(next.date)}
          </span>
        ) : null}
      </div>
    </button>
  );
}
