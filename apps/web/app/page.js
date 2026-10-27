'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PROVIDERS, buildMessages } from '@revelio/agent/src/context';

const SPEAKER = { you: 'You', interviewer: 'Interviewer' };
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Hindi', 'Japanese'];

const SESSION = 'Northwind · Senior Frontend Engineer';

export default function LiveSession() {
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [providers, setProviders] = useState([]); // PROVIDERS entries with a saved key
  const [provider, setProvider] = useState(null);
  const [answers, setAnswers] = useState([]); // newest first: { id, question, text, t, status: 'streaming'|'done'|'error', vote }
  const [audio, setAudio] = useState({ state: 'idle', message: '' });
  const [lines, setLines] = useState([]);
  const [lang, setLang] = useState(LANGUAGES[0]);
  const [sources, setSources] = useState(null); // meeting window picker list while open
  const [meeting, setMeeting] = useState(null); // { id, name } -> 'interviewer' audio
  const [desktop, setDesktop] = useState(null); // null until mounted; false in a plain browser (no Electron bridge)
  const transcriptRef = useRef(null);
  const cancelRef = useRef(null);
  const latest = useRef({}); // current values for the IPC callbacks registered once on mount
  const listening = audio.state === 'recording';
  latest.current = { lines, provider, autoAnswer };

  const patchAnswer = (id, patch) => setAnswers((all) => all.map((a) => (a.id === id ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a)));

  function answer(question) {
    const api = window.revelio;
    const p = PROVIDERS.find((x) => x.id === latest.current.provider);
    if (!api?.streamAnswer || !p || !question) return;
    cancelRef.current?.();
    const id = Date.now();
    setAnswers((all) => [{ id, question, text: '', t: clock(new Date().toISOString()), status: 'streaming' },
      ...all.map((a) => (a.status === 'streaming' ? { ...a, status: 'done' } : a))]);
    const messages = buildMessages({ entries: latest.current.lines, question, instructions: `${SESSION}, interview mode` });
    cancelRef.current = api.streamAnswer(p.id, p.model, messages,
      (token) => patchAnswer(id, (a) => ({ text: a.text + token })),
      () => patchAnswer(id, { status: 'done' }),
      (err) => patchAnswer(id, (a) => ({ status: 'error', text: a.text + (a.text ? '\n\n' : '') + err.message })));
  }

  const lastQuestion = () => {
    const all = latest.current.lines;
    return (all.findLast((l) => l.who === SPEAKER.interviewer) || all.at(-1))?.text;
  };

  useEffect(() => {
    const api = window.revelio;
    setDesktop(!!api?.onTranscript);
    if (!api?.onTranscript) return;
    api.audioStatus().then(setAudio);
    const offStatus = api.onAudioStatus(setAudio);
    api.listKeys?.().then((saved) => {
      const ready = PROVIDERS.filter((p) => saved[p.id]);
      setProviders(ready);
      setProvider((cur) => cur || ready[0]?.id || null);
    }).catch(() => {});
    const offTranscript = api.onTranscript((e) => {
      const line = { who: SPEAKER[e.speaker], t: clock(e.timestamp), text: e.text };
      setLines((prev) => [...prev, line]);
      latest.current.lines = [...latest.current.lines, line]; // so an auto answer sees this line before React re-renders
      if (e.speaker === 'interviewer' && latest.current.autoAnswer && latest.current.provider) {
        api.detectQuestion(e.text).then((isQuestion) => isQuestion && answer(e.text));
      }
    });
    return () => { offStatus(); offTranscript(); cancelRef.current?.(); };
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="live">
      <div className="live-header">
        <div>
          <div className="live-title">{SESSION}</div>
          <div className="live-meta">Interview mode · {lang}</div>
        </div>
        <div className="live-header-right">
          <span className="timer" title="Session time remaining"><span className="dot live" /> 26:14</span>
          <select className="select" value={provider || ''} onChange={(e) => setProvider(e.target.value)} aria-label="AI model" disabled={!providers.length}>
            {providers.length ? providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>) : <option value="">No API key</option>}
          </select>
          <label className="toggle">
            <input type="checkbox" checked={autoAnswer} onChange={(e) => setAutoAnswer(e.target.checked)} />
            <span className="track"><span className="thumb" /></span>
            <span className={autoAnswer ? 'toggle-label on' : 'toggle-label'}>Auto Answer {autoAnswer ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      <div className="panes">
        <section className={listening ? 'pane listening' : 'pane'}>
          <div className="pane-head">Transcript</div>
          <div className="pane-body transcript" ref={transcriptRef}>
            <div className="pulse" aria-hidden="true"><span /><span /><span /></div>
            {lines.map((l, i) => (
              <div key={i} className={`line ${l.who === 'You' ? 'me' : ''}`}>
                <div className="line-meta"><span className="speaker">{l.who}</span><span>{l.t}</span></div>
                <div>{l.text}</div>
              </div>
            ))}
            {desktop === false && <p className="muted" role="status">Run as desktop app for live transcription</p>}
            {audio.message && <p className="muted" role="status">{audio.message}</p>}
          </div>
          <div className="pane-foot">
            <button className="btn" disabled={!desktop || audio.state === 'starting'} onClick={() => (listening ? window.revelio?.stopAudio() : window.revelio?.startAudio(meeting?.id))}>{listening ? 'Stop' : 'Start'}</button>
            <span className={listening ? 'dot rec' : 'dot'} title={listening ? 'Recording' : 'Not recording'} />
            <span className="mic" title="Microphone" aria-hidden="true">🎙</span>
            <button className="btn" onClick={() => setLines([])}>Clear</button>
            {sources ? (
              <select className="select source" autoFocus defaultValue="" aria-label="Meeting window"
                onChange={(e) => { setMeeting(sources.find((s) => s.id === e.target.value) || null); setSources(null); }}
                onBlur={() => setSources(null)}>
                <option value="" disabled>Choose meeting window…</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <button className="btn source" disabled={!desktop || listening} title={meeting ? `Interviewer audio: ${meeting.name}` : 'Pick the window whose audio is the interviewer'}
                onClick={() => window.revelio?.getSources().then(setSources)}>{meeting ? meeting.name : 'Select meeting window'}</button>
            )}
            <select className="select push" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </section>

        <section className="pane">
          <div className="pane-head">Answer</div>
          <div className="pane-body answer">
            {!providers.length && <p className="muted" role="status">Add an API key in <Link href="/settings">Settings</Link> to enable answers</p>}
            {answers.map((a) => (
              <article key={a.id} className="answer-card" aria-busy={a.status === 'streaming'}>
                <div className="question">{a.question}</div>
                <div className={a.status === 'error' ? 'answer-text error' : 'answer-text'}>
                  {a.text}
                  {a.status === 'streaming' && <span className="typing" aria-label="Generating answer"><span /><span /><span /></span>}
                </div>
                <div className="answer-foot">
                  <button className="icon-btn" aria-label="Helpful" aria-pressed={a.vote === 'up'} onClick={() => patchAnswer(a.id, { vote: a.vote === 'up' ? null : 'up' })}>👍</button>
                  <button className="icon-btn" aria-label="Not helpful" aria-pressed={a.vote === 'down'} onClick={() => patchAnswer(a.id, { vote: a.vote === 'down' ? null : 'down' })}>👎</button>
                  <span className="push">{a.t}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="pane-foot">
            <button className="btn primary block" disabled={!desktop || !provider || !lines.length} onClick={() => answer(lastQuestion())}>✦ Answer</button>
          </div>
        </section>
      </div>

      <div className="controls">
        <button className="btn">Screenshot</button>
        <input className="chat" placeholder="Ask anything…" aria-label="Chat with AI" />
        <button className="btn">Send</button>
        <button className="btn">Clear</button>
        <button className="btn danger">End</button>
      </div>
    </div>
  );
}
