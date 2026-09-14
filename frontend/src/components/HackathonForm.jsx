import { useState } from 'react';
import { STATUSES, STATUS_LABELS } from '../lib/supabase.js';

/**
 * The manual form. Used both for adding by hand and for editing, and as the
 * landing place when extraction can't fill things in — which is why every
 * field is optional except the name. A form that refuses to save because you
 * don't know the submission deadline yet is a form you stop using.
 */
const BLANK = {
  name: '',
  platform: '',
  source_url: '',
  status: 'registered',
  registration_deadline: '',
  submission_deadline: '',
  event_start: '',
  event_end: '',
  round_dates: '',
  team_size: '',
  problem_statement: '',
  notes: '',
};

export default function HackathonForm({ initial, submitLabel = 'Add hackathon', onSubmit, onCancel }) {
  const [fields, setFields] = useState(() => ({
    ...BLANK,
    ...Object.fromEntries(
      Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? '']),
    ),
  }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(key) {
    return (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!fields.name.trim()) {
      setError('Give it a name — everything else can wait.');
      document.getElementById('field-name')?.focus();
      return;
    }

    setSaving(true);
    setError(null);

    // Only the columns the table has. `initial` may carry id/created_at etc.
    const payload = Object.fromEntries(
      Object.keys(BLANK).map((key) => [key, fields[key]?.trim?.() ?? fields[key]]),
    );
    if (fields.raw_text) payload.raw_text = fields.raw_text;

    const result = await onSubmit(payload);
    setSaving(false);

    if (result && !result.ok) setError(result.error);
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}

      <div className="field">
        <label className="field__label" htmlFor="field-name">Name</label>
        <input
          id="field-name"
          className="input"
          value={fields.name}
          onChange={set('name')}
          autoComplete="off"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="field-platform">Platform</label>
          <input
            id="field-platform"
            className="input"
            value={fields.platform}
            onChange={set('platform')}
            placeholder="Unstop"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="field-status">Status</label>
          <select id="field-status" className="select" value={fields.status} onChange={set('status')}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="field-url">Link</label>
        <input
          id="field-url"
          className="input"
          type="url"
          inputMode="url"
          value={fields.source_url}
          onChange={set('source_url')}
          placeholder="https://"
          autoComplete="off"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="field-reg">Registration closes</label>
          <input
            id="field-reg"
            className="input"
            type="date"
            value={fields.registration_deadline}
            onChange={set('registration_deadline')}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="field-sub">Submission due</label>
          <input
            id="field-sub"
            className="input"
            type="date"
            value={fields.submission_deadline}
            onChange={set('submission_deadline')}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="field-start">Event starts</label>
          <input
            id="field-start"
            className="input"
            type="date"
            value={fields.event_start}
            onChange={set('event_start')}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="field-end">Event ends</label>
          <input
            id="field-end"
            className="input"
            type="date"
            value={fields.event_end}
            onChange={set('event_end')}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="field-team">Team size</label>
          <input
            id="field-team"
            className="input"
            value={fields.team_size}
            onChange={set('team_size')}
            placeholder="2–4"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="field-rounds">Round dates</label>
          <input
            id="field-rounds"
            className="input"
            value={fields.round_dates}
            onChange={set('round_dates')}
            placeholder="Prelims 12 Mar, finals 20 Mar"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="field-problem">Problem statement</label>
        <textarea
          id="field-problem"
          className="textarea"
          value={fields.problem_statement}
          onChange={set('problem_statement')}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="field-notes">Notes</label>
        <textarea
          id="field-notes"
          className="textarea"
          value={fields.notes}
          onChange={set('notes')}
          placeholder="Team, ideas, what to prepare"
        />
      </div>

      <div className="form__actions">
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
