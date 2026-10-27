'use client';
import { useEffect, useState } from 'react';

const PROVIDERS = [
  { id: 'anthropic', name: 'Claude (Anthropic)', placeholder: 'sk-ant-…' },
  { id: 'google', name: 'Gemini (Google)', placeholder: 'AIza…' },
  { id: 'openai', name: 'GPT (OpenAI)', placeholder: 'sk-…' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-…' },
  { id: 'agentrouter', name: 'AgentRouter', placeholder: 'API key' },
];

// Electron: encrypted in main via the bridge. Plain browser: localStorage (unencrypted).
const LOCAL = 'revelio.keys';
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL)) || {}; } catch { return {}; } };
const keyStore = () => window.revelio?.listKeys ? { list: window.revelio.listKeys, save: window.revelio.saveKey } : {
  list: async () => Object.fromEntries(Object.entries(readLocal()).map(([id, k]) => [id, { last4: k.slice(-4) }])),
  save: async (id, key) => {
    localStorage.setItem(LOCAL, JSON.stringify({ ...readLocal(), [id]: key.trim() }));
    return { last4: key.trim().slice(-4) };
  },
};

export default function Settings() {
  const [saved, setSaved] = useState({}); // id -> { last4 }
  const [drafts, setDrafts] = useState({}); // id -> typed, unsaved key
  const [rowState, setRowState] = useState({}); // id -> 'saved' | error message
  const [desktop, setDesktop] = useState(true);

  useEffect(() => {
    setDesktop(!!window.revelio?.listKeys);
    keyStore().list().then(setSaved).catch((err) => setRowState({ all: err.message }));
  }, []);

  async function save(id) {
    try {
      const res = await keyStore().save(id, drafts[id]);
      setSaved((s) => ({ ...s, [id]: res }));
      setDrafts((d) => ({ ...d, [id]: '' }));
      setRowState((r) => ({ ...r, [id]: 'saved' }));
    } catch (err) {
      setRowState((r) => ({ ...r, [id]: err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }));
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="card">
        <h2>API keys</h2>
        <p className="muted">
          {desktop
            ? 'Keys are stored encrypted on this device and sent only to their own provider.'
            : "Browser preview: keys are kept unencrypted in this browser's localStorage. Use the desktop app for encrypted storage."}
        </p>
        {rowState.all && <p className="key-error" role="alert">{rowState.all}</p>}
        {PROVIDERS.map((p) => (
          <div key={p.id} className="field">
            <label htmlFor={`key-${p.id}`}>{p.name}</label>
            <form className="key-row" onSubmit={(e) => { e.preventDefault(); save(p.id); }}>
              <input
                id={`key-${p.id}`} type="password" autoComplete="off" spellCheck={false}
                placeholder={saved[p.id] ? `Saved · ••••${saved[p.id].last4} — type to replace` : p.placeholder}
                value={drafts[p.id] || ''}
                onChange={(e) => { setDrafts((d) => ({ ...d, [p.id]: e.target.value })); setRowState((r) => ({ ...r, [p.id]: null })); }}
              />
              <button className="btn" disabled={!drafts[p.id]?.trim()}>Save</button>
            </form>
            <span role="status" className={rowState[p.id] === 'saved' ? 'key-saved' : 'key-error'}>
              {rowState[p.id] === 'saved' ? '✓ Saved' : rowState[p.id]}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
