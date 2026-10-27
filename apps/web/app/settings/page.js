const PROVIDERS = [
  { id: 'anthropic', name: 'Claude (Anthropic)', placeholder: 'sk-ant-…' },
  { id: 'google', name: 'Gemini (Google)', placeholder: 'AIza…' },
  { id: 'openai', name: 'GPT (OpenAI)', placeholder: 'sk-…' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-…' },
  { id: 'agentrouter', name: 'AgentRouter', placeholder: 'API key' },
];

export default function Settings() {
  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="card">
        <h2>API keys</h2>
        <p className="muted">Keys are stored encrypted on this device and sent only to their own provider. (Saving arrives in Phase 2.)</p>
        {PROVIDERS.map((p) => (
          <label key={p.id} className="field">
            <span>{p.name}</span>
            <input type="password" placeholder={p.placeholder} autoComplete="off" spellCheck={false} />
          </label>
        ))}
        <button className="btn primary" disabled>Save keys</button>
      </section>
    </div>
  );
}
