import { useMemo, useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Discover from './pages/Discover.jsx';
import AddHackathon from './components/AddHackathon.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import Icon from './components/Icon.jsx';
import { useHackathons } from './lib/useHackathons.js';
import { useDiscovered } from './lib/useDiscovered.js';
import { urgencyFor, URGENCY } from './lib/dates.js';

export default function App() {
  const [tab, setTab] = useState('tracker');
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const {
    hackathons, loading, error,
    addHackathon, updateHackathon, setStatus, deleteHackathon,
  } = useHackathons();

  const {
    discovered, loading: discoverLoading, error: discoverError,
    refresh: refreshDiscovered, markAdded,
  } = useDiscovered();

  // Selection is held by id, not by object — the object goes stale the moment
  // an edit lands, and a stale panel showing old values is a confusing bug.
  const selected = hackathons.find((h) => h.id === selectedId) ?? null;

  // The masthead pip takes the colour of the most urgent thing you are
  // tracking, so the header answers "how worried should I be" on its own.
  const worstUrgency = useMemo(() => {
    const order = [URGENCY.CRITICAL, URGENCY.SOON, URGENCY.CLEAR, URGENCY.PAST, URGENCY.NONE];
    const present = new Set(hackathons.map((h) => urgencyFor(h)));
    return order.find((level) => present.has(level)) ?? URGENCY.NONE;
  }, [hackathons]);

  const newFinds = discovered.filter((d) => !d.added_to_tracker).length;

  async function handleAdd(fields) {
    const result = await addHackathon(fields);
    if (result.ok) setAdding(false);
    return result;
  }

  /** Copy a discovered listing into the tracker, then mark it as taken. */
  async function handleAddFromDiscovery(find) {
    // The tracker has no location/fee/prize columns of its own — they ride
    // along as a note instead of getting silently dropped on the way in.
    const details = [
      find.location ? `Location: ${find.location}` : null,
      find.entry_fee ? `Entry fee: ${find.entry_fee}` : null,
      find.prize_money ? `Prize money: ${find.prize_money}` : null,
    ].filter(Boolean).join('\n');

    const result = await addHackathon({
      name: find.name,
      platform: find.platform,
      source_url: find.source_url,
      registration_deadline: find.deadline ?? '',
      status: 'registered',
      notes: details,
    });
    if (!result.ok) return result;
    return markAdded(find.id);
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="masthead">
        <div className="masthead__inner">
          <div className="wordmark" data-urgency={worstUrgency}>
            <span className="wordmark__pip" aria-hidden="true" />
            <span>Hackathon Tracker</span>
            <span className="wordmark__sub">{hackathons.length} tracked</span>
          </div>

          <nav className="tabs" aria-label="Views">
            <button
              type="button"
              className="tab"
              aria-current={tab === 'tracker' ? 'page' : undefined}
              onClick={() => setTab('tracker')}
            >
              Tracker
            </button>
            <button
              type="button"
              className="tab"
              aria-current={tab === 'discover' ? 'page' : undefined}
              onClick={() => setTab('discover')}
            >
              Discover
              {newFinds > 0 ? <span className="tab__count">{newFinds}</span> : null}
            </button>
          </nav>

          <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add
          </button>
        </div>
      </header>

      <main className="main" id="main">
        {tab === 'tracker' ? (
          <Dashboard
            hackathons={hackathons}
            loading={loading}
            error={error}
            onSelect={(h) => setSelectedId(h.id)}
            onAdd={() => setAdding(true)}
          />
        ) : (
          <Discover
            discovered={discovered}
            loading={discoverLoading}
            error={discoverError}
            onAddToTracker={handleAddFromDiscovery}
            onRefresh={refreshDiscovered}
          />
        )}
      </main>

      {adding ? (
        <AddHackathon onAdd={handleAdd} onClose={() => setAdding(false)} />
      ) : null}

      {selected ? (
        <DetailPanel
          hackathon={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={updateHackathon}
          onDelete={deleteHackathon}
          onStatusChange={setStatus}
        />
      ) : null}
    </div>
  );
}
