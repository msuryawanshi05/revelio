'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const SESSIONS = [
  { id: 1, company: 'Northwind', role: 'Senior Frontend Engineer', state: 'live', when: 'Now' },
  { id: 2, company: 'Contoso', role: 'Product Manager', state: 'ready', when: 'Today, 4:30 PM' },
  { id: 3, company: 'Fabrikam', role: 'Backend Engineer', state: 'ended', when: 'Yesterday · 42 min' },
  { id: 4, company: 'Team sync', role: 'Weekly planning', state: 'ended', when: 'Mon · 28 min' },
];

const STATE_LABEL = { live: 'Live', ready: 'Ready to Start', ended: 'Ended' };

export default function Shell({ children }) {
  const path = usePathname();
  const [pinned, setPinned] = useState(true);

  return (
    <div className="frame">
      <header className="titlebar">
        <span className="wordmark">Revelio</span>
        <div className="titlebar-actions">
          <button
            className={`icon-btn ${pinned ? 'on' : ''}`}
            title={pinned ? 'Unpin from top' : 'Keep on top'}
            onClick={() => { setPinned(!pinned); window.revelio?.setPinned(!pinned); }}
          >⊤</button>
          <button className="icon-btn" title="Minimize" onClick={() => window.revelio?.minimize()}>–</button>
          <button className="icon-btn close" title="Close" onClick={() => window.revelio?.close()}>×</button>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <button className="btn primary block">+ New session</button>
          <nav className="nav">
            <Link href="/" className={path === '/' ? 'active' : ''}>Live session</Link>
            <Link href="/settings" className={path === '/settings' ? 'active' : ''}>Settings</Link>
          </nav>
          <div className="section-label">Sessions</div>
          <ul className="session-list">
            {SESSIONS.map((s) => (
              <li key={s.id} className={s.state === 'live' ? 'selected' : ''}>
                <div className="session-top">
                  <span className="session-company">{s.company}</span>
                  <span className={`pill ${s.state}`}>{STATE_LABEL[s.state]}</span>
                </div>
                <div className="session-role">{s.role}</div>
                <div className="session-when">{s.when}</div>
              </li>
            ))}
          </ul>
        </aside>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
