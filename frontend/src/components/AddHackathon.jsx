import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import HackathonForm from './HackathonForm.jsx';
import { extractHackathon } from '../lib/extract.js';

/**
 * AddHackathon modal supporting three input modes:
 *  1. Paste Text (captions, email, notes)
 *  2. Paste URL (public listing page, e.g. Unstop, Devfolio, Devpost)
 *  3. Upload Screenshot (image flyer/graphic)
 * Plus a direct fallback to fill in by hand.
 *
 * Guaranteed contract: No user input is ever lost if extraction fails or LLM key is absent.
 */
export default function AddHackathon({ onAdd, onClose }) {
  const [view, setView] = useState('input'); // 'input' | 'form'
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'url' | 'screenshot'

  const [rawText, setRawText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageMime, setImageMime] = useState('image/png');

  const [extracting, setExtracting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [prefill, setPrefill] = useState(null);

  const closeRef = useRef(null);
  const fileInputRef = useRef(null);

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

  function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice({ tone: 'error', text: 'Please upload an image file (PNG, JPEG, WebP, etc.).' });
      return;
    }
    setImageMime(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      setImageFile(dataUrl);
      setImagePreview(dataUrl);
      setNotice(null);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  async function handleExtract() {
    setExtracting(true);
    setNotice(null);

    let payload = {};
    let fallbackText = '';

    if (inputMode === 'url') {
      payload = { mode: 'url', url: urlInput.trim() };
      fallbackText = urlInput.trim();
    } else if (inputMode === 'screenshot') {
      payload = { mode: 'image', image: imageFile, mimeType: imageMime };
      fallbackText = 'Uploaded screenshot flyer';
    } else {
      payload = { mode: 'text', text: rawText.trim() };
      fallbackText = rawText.trim();
    }

    const result = await extractHackathon(payload);
    setExtracting(false);

    if (result.ok) {
      setPrefill({
        ...result.fields,
        raw_text: fallbackText,
        source_url: result.fields.source_url || (inputMode === 'url' ? urlInput.trim() : ''),
      });
      setNotice({
        tone: 'ok',
        text: result.warning ?? 'Details extracted successfully. Please verify dates and fields before saving.',
      });
      setView('form');
    } else {
      // Graceful fallback: never lose the user's input
      const initialFields = {
        raw_text: fallbackText,
        notes: fallbackText,
        source_url: inputMode === 'url' ? urlInput.trim() : '',
        ...(result.partialFields || {}),
      };
      setPrefill(initialFields);
      setNotice({
        tone: 'info',
        text: `${result.reason} Fill in the details below manually.`,
      });
      setView('form');
    }
  }

  function handleManualEntry() {
    let initialNotes = '';
    let initialUrl = '';

    if (inputMode === 'url') {
      initialUrl = urlInput.trim();
      initialNotes = urlInput.trim();
    } else if (inputMode === 'text') {
      initialNotes = rawText.trim();
    }

    setPrefill({
      raw_text: initialNotes,
      notes: initialNotes,
      source_url: initialUrl,
    });
    setView('form');
  }

  const isExtractDisabled =
    extracting ||
    (inputMode === 'text' && !rawText.trim()) ||
    (inputMode === 'url' && !urlInput.trim()) ||
    (inputMode === 'screenshot' && !imageFile);

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
          <p className={`notice notice--${notice.tone}`} role="status">
            {notice.text}
          </p>
        ) : null}

        {view === 'input' ? (
          <>
            <div className="input-modes" role="tablist" aria-label="Input modes">
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'text'}
                className={`chip ${inputMode === 'text' ? 'chip--active' : ''}`}
                onClick={() => setInputMode('text')}
              >
                Paste Text
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'url'}
                className={`chip ${inputMode === 'url' ? 'chip--active' : ''}`}
                onClick={() => setInputMode('url')}
              >
                Paste URL
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'screenshot'}
                className={`chip ${inputMode === 'screenshot' ? 'chip--active' : ''}`}
                onClick={() => setInputMode('screenshot')}
              >
                Upload Screenshot
              </button>
            </div>

            {inputMode === 'text' && (
              <div className="field">
                <label className="field__label" htmlFor="add-raw">
                  Paste the description or caption
                </label>
                <p className="field__hint">
                  Paste an email, social post caption, or announcement text.
                </p>
                <textarea
                  id="add-raw"
                  className="textarea textarea--tall"
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Smart India Hackathon 2026 — registration closes 14 March, submission 28 March, teams of 6…"
                />
              </div>
            )}

            {inputMode === 'url' && (
              <div className="field">
                <label className="field__label" htmlFor="add-url">
                  Hackathon listing URL
                </label>
                <p className="field__hint">
                  Provide a public listing link (e.g. Unstop, Devfolio, Devpost, MLH, HackerEarth).
                </p>
                <input
                  id="add-url"
                  type="url"
                  className="input"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="https://devfolio.co/hackathons/example-hack"
                />
              </div>
            )}

            {inputMode === 'screenshot' && (
              <div className="field">
                <label className="field__label">Upload event flyer / screenshot</label>
                <p className="field__hint">
                  Upload an Instagram flyer, story screenshot, or graphic with event details.
                </p>
                <div
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  />
                  {imagePreview ? (
                    <div className="dropzone__preview">
                      <img src={imagePreview} alt="Screenshot preview" />
                      <span className="dropzone__change">Click or drag to change image</span>
                    </div>
                  ) : (
                    <div className="dropzone__prompt">
                      <Icon name="sparkle" />
                      <span>Drag & drop flyer image here, or click to browse</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="form__actions" style={{ marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn" onClick={handleManualEntry}>
                Fill in by hand
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleExtract}
                disabled={isExtractDisabled}
              >
                <Icon name="sparkle" />
                {extracting ? 'Reading with AI…' : 'Extract with AI'}
              </button>
            </div>
          </>
        ) : (
          <HackathonForm
            initial={prefill}
            submitLabel="Add hackathon"
            onSubmit={onAdd}
            onCancel={() => {
              setView('input');
              setNotice(null);
            }}
          />
        )}
      </aside>
    </div>
  );
}
