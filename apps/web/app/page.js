'use client';
import { useState } from 'react';

const TRANSCRIPT = [
  { who: 'Interviewer', t: '00:41', text: 'Thanks for joining. Could you start by walking me through a recent project you led?' },
  { who: 'You', t: '01:05', text: 'Sure. Last quarter I led the migration of our dashboard from a legacy SPA to a server-rendered app.' },
  { who: 'Interviewer', t: '02:18', text: 'Interesting. How did you handle state that previously lived entirely on the client?' },
  { who: 'You', t: '02:40', text: 'We split it into server state, cached per request, and a small amount of UI state kept local.' },
  { who: 'Interviewer', t: '03:52', text: 'How would you debounce a search input so it only fires after the user stops typing?' },
];

const MODELS = ['Claude Sonnet', 'Claude Haiku', 'Gemini Flash', 'Gemini Pro', 'GPT (default)', 'OpenRouter…', 'AgentRouter…'];

export default function LiveSession() {
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [model, setModel] = useState(MODELS[0]);

  return (
    <div className="live">
      <div className="live-header">
        <div>
          <div className="live-title">Northwind · Senior Frontend Engineer</div>
          <div className="live-meta">Interview mode · English</div>
        </div>
        <div className="live-header-right">
          <span className="timer" title="Session time remaining"><span className="dot live" /> 26:14</span>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)} aria-label="AI model">
            {MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <label className="toggle">
            <input type="checkbox" checked={autoAnswer} onChange={(e) => setAutoAnswer(e.target.checked)} />
            <span className="track"><span className="thumb" /></span>
            <span className={autoAnswer ? 'toggle-label on' : 'toggle-label'}>Auto Answer {autoAnswer ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      <div className="panes">
        <section className="pane">
          <div className="pane-head">Transcript</div>
          <div className="pane-body transcript">
            {TRANSCRIPT.map((l, i) => (
              <div key={i} className={`line ${l.who === 'You' ? 'me' : ''}`}>
                <div className="line-meta"><span className="speaker">{l.who}</span><span>{l.t}</span></div>
                <div>{l.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="pane">
          <div className="pane-head">Answer</div>
          <div className="pane-body answer">
            <div className="question">How would you debounce a search input so it only fires after the user stops typing?</div>
            <p>Wrap the handler so each keystroke resets a timer, and only call the search once the timer completes:</p>
            <pre>{`function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}`}</pre>
            <ul>
              <li>~300 ms feels responsive without flooding the API.</li>
              <li>Cancel in-flight requests (AbortController) so stale results never overwrite newer ones.</li>
              <li>In React, keep the debounced function stable with <code>useMemo</code> and clear it on unmount.</li>
            </ul>
          </div>
        </section>
      </div>

      <div className="controls">
        <button className="btn primary">Answer</button>
        <button className="btn">Screenshot</button>
        <input className="chat" placeholder="Ask anything…" aria-label="Chat with AI" />
        <button className="btn">Send</button>
        <button className="btn">Clear</button>
        <button className="btn danger">End</button>
      </div>
    </div>
  );
}
