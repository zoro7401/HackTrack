import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import HackathonForm from './HackathonForm.jsx';
import { extractHackathon } from '../lib/extract.js';

/**
 * Two ways in: paste a description and let the extractor pre-fill the form, or
 * fill it in by hand.
 *
 * The important behaviour is what happens when extraction fails — no LLM key,
 * no network, a model that returns nonsense. It is not an error state. The
 * pasted text is carried into the manual form, a plain sentence says what
 * happened, and the user keeps going. Losing someone's paste because a
 * background service is misconfigured is the one unforgivable bug here.
 */
export default function AddHackathon({ onAdd, onClose }) {
  const [mode, setMode] = useState('paste'); // 'paste' | 'form'
  const [rawText, setRawText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleExtract() {
    setExtracting(true);
    setNotice(null);

    const result = await extractHackathon(rawText);
    setExtracting(false);

    if (result.ok) {
      setPrefill({ ...result.fields, raw_text: rawText });
      setNotice({
        tone: 'ok',
        text: result.warning
          ?? 'Read what it could. Check the fields before saving — dates especially.',
      });
    } else {
      // Not an error. Hand over to the manual form with the text preserved.
      setPrefill({ raw_text: rawText, notes: rawText });
      setNotice({
        tone: 'info',
        text: `${result.reason} Your text is below — fill in what you need.`,
      });
    }
    setMode('form');
  }

  return (
    <div
      className="scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="panel" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="panel__head">
          <h2 className="panel__title" id="add-title">Add a hackathon</h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {notice ? (
          <p className={`notice notice--${notice.tone}`} role="status">{notice.text}</p>
        ) : null}

        {mode === 'paste' ? (
          <>
            <div className="field">
              <label className="field__label" htmlFor="add-raw">
                Paste the listing
              </label>
              <p className="field__hint">
                Anything works — the description, an email, a link. It gets read into
                the form, and you check it before saving.
              </p>
              <textarea
                id="add-raw"
                className="textarea textarea--tall"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Smart India Hackathon 2026 — registration closes 14 March, submission 28 March, teams of 6…"
              />
            </div>

            <div className="form__actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPrefill(rawText ? { raw_text: rawText, notes: rawText } : null);
                  setMode('form');
                }}
              >
                Fill in by hand
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleExtract}
                disabled={extracting || !rawText.trim()}
              >
                <Icon name="sparkle" />
                {extracting ? 'Reading…' : 'Read it for me'}
              </button>
            </div>
          </>
        ) : (
          <HackathonForm
            initial={prefill}
            submitLabel="Add hackathon"
            onSubmit={onAdd}
            onCancel={() => {
              setMode('paste');
              setNotice(null);
            }}
          />
        )}
      </aside>
    </div>
  );
}
