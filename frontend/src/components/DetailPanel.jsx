import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import HackathonForm from './HackathonForm.jsx';
import { formatDate, describeDays, nextDeadline, DEADLINE_LABELS } from '../lib/dates.js';
import { STATUSES, STATUS_LABELS } from '../lib/supabase.js';

/**
 * Everything recorded about one hackathon, in a side panel: read first, with
 * edit and delete behind explicit actions.
 *
 * Escape closes it, focus moves in on open and the panel traps nothing — a
 * side panel that eats the keyboard is worse than no panel.
 */
export default function DetailPanel({ hackathon, onClose, onUpdate, onDelete, onStatusChange }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        if (confirmingDelete) setConfirmingDelete(false);
        else if (editing) setEditing(false);
        else onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, editing, confirmingDelete]);

  const next = nextDeadline(hackathon);

  async function handleSave(fields) {
    const result = await onUpdate(hackathon.id, fields);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setEditing(false);
  }

  async function handleDelete() {
    const result = await onDelete(hackathon.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  async function handleStatus(event) {
    const result = await onStatusChange(hackathon.id, event.target.value);
    if (!result.ok) setError(result.error);
  }

  return (
    <div
      className="scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
      >
        <div className="panel__head">
          <h2 className="panel__title" id="panel-title">{hackathon.name}</h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close details"
          >
            <Icon name="close" />
          </button>
        </div>

        {error ? <p className="notice notice--error" role="alert">{error}</p> : null}

        {editing ? (
          <HackathonForm
            initial={hackathon}
            submitLabel="Save changes"
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="field">
              <label className="field__label" htmlFor="panel-status">Status</label>
              <select
                id="panel-status"
                className="select"
                value={hackathon.status}
                onChange={handleStatus}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>

            {next ? (
              <p className="notice notice--info">
                <strong>{describeDays(next.days)}</strong>
                <span>
                  {DEADLINE_LABELS[next.field]} closes {formatDate(next.date)}
                </span>
              </p>
            ) : null}

            <dl className="facts">
              <Fact label="Platform" value={hackathon.platform} />
              <Fact label="Team size" value={hackathon.team_size} />
              <Fact label="Registration" value={formatDate(hackathon.registration_deadline)} mono />
              <Fact label="Submission" value={formatDate(hackathon.submission_deadline)} mono />
              <Fact label="Event" value={eventRange(hackathon)} mono />
              <Fact label="Rounds" value={hackathon.round_dates} />
              {hackathon.source_url ? (
                <>
                  <dt>Link</dt>
                  <dd>
                    <a href={hackathon.source_url} target="_blank" rel="noreferrer noopener">
                      Open listing <Icon name="external" size={12} />
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>

            {hackathon.problem_statement ? (
              <section>
                <h3 className="field__label">Problem statement</h3>
                <p className="prose">{hackathon.problem_statement}</p>
              </section>
            ) : null}

            {hackathon.notes ? (
              <section>
                <h3 className="field__label">Notes</h3>
                <p className="prose">{hackathon.notes}</p>
              </section>
            ) : null}

            <div className="form__actions">
              {confirmingDelete ? (
                <>
                  <span className="field__hint">Delete this permanently?</span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep it
                  </button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={handleDelete}>
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Icon name="trash" /> Delete
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
                    <Icon name="edit" /> Edit
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Fact({ label, value, mono }) {
  if (!value || value === '—') return null;
  return (
    <>
      <dt>{label}</dt>
      <dd data-mono={mono ? '' : undefined}>{value}</dd>
    </>
  );
}

function eventRange({ event_start: start, event_end: end }) {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate(start ?? end);
}
