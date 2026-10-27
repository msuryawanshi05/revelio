# Revelio — Architecture

Status: Phase 1 (shell only). Transcription, AI and storage are designed here but not yet wired.

## Overview

```
┌──────────────── Electron (apps/desktop) ────────────────┐
│ main process                                             │
│  ├─ overlay BrowserWindow ──loads──▶ Next.js UI (apps/web)│
│  ├─ audio capture: mic stream + system-audio stream      │
│  ├─ @revelio/transcriber ─▶ whisper.cpp (child process)  │
│  ├─ @revelio/session      (state machine, timer)         │
│  ├─ @revelio/agent        (streams answers, BYO keys)    │
│  └─ @revelio/storage      (SQLite ⇄ Google Drive)        │
└──────────────────────────────────────────────────────────┘
```

- **Monorepo:** npm workspaces — `apps/*`, `packages/*`. Plain JavaScript (CommonJS in packages/desktop, ESM/JSX in Next.js) to keep tooling minimal.
- **Process split:** all secrets, file access, audio and native work live in the Electron main process. The renderer (Next.js) talks to it only through `preload.js` (`contextIsolation`, `sandbox`). The renderer never sees API keys.
- **Dev:** `npm run dev` starts `next dev` on :3000, waits for it, then launches Electron pointed at it.
- **Prod (Phase 2):** Next.js static export bundled into the Electron app and loaded from disk — no local server.

## Desktop window

- Frameless, transparent, rounded, always-on-top (`floating` level) overlay, 1180×760 default, min 900×600.
- Custom title bar with drag region, pin/unpin (always-on-top toggle), minimize, close.
- Windows is the priority platform; macOS supported.

## Transcription

- **Engine:** whisper.cpp, fully offline. `packages/transcriber/scripts/setup-whisper.ps1` builds (or downloads the prebuilt) `whisper-server` into `packages/transcriber/bin/Release/whisper-server.exe`; models in `packages/transcriber/models/`.
- **Integration:** `@revelio/transcriber` spawns `bin/Release/whisper-server.exe` as a child process, restarts it with backoff if it exits, and POSTs 3-second WAV chunks over localhost.
- **Capture (current):** `apps/desktop/audio.js`. Mic via `naudiodon`, else SoX, else renderer `getUserMedia`. Interviewer audio: the user picks a window/screen (`audio:getSources` → desktopCapturer); the preload captures it with `getUserMedia` + `chromeMediaSourceId` (on Windows this is the whole system mix) and streams 16 kHz PCM back over `audio:pcm`. Silent 3 s windows are skipped. IPC: `audio:start|stop|status|getSources` (invoke), `transcript:new` and `audio:status` (events).
- **Acceleration:** CUDA build when `nvidia-smi` is present (Windows/Linux); Metal on Apple Silicon (default in whisper.cpp); CPU otherwise.
- **Models:** `tiny` default; switcher for `base`, `small`, `medium`, `large`. Downloaded on demand from the whisper.cpp model repo.
- **Speakers:** two independent streams — microphone = **You**, system audio = **Them**. Each stream is transcribed separately, so labels come from the source, not from diarization.
  - Windows: system audio via Electron `desktopCapturer` loopback (`setDisplayMediaRequestHandler` with `audio: 'loopback'`).
  - macOS: system audio requires macOS 13+ ScreenCaptureKit support in Electron, or a virtual loopback device (e.g. BlackHole) as fallback.
- **Language:** passed as `language` to whisper (whisper supports ~99 languages; `auto` allowed).
- **Custom word list:** fed as whisper's initial `prompt` per session (company, role, names, terms from documents) to bias spelling.
- **Voice profile:** v1 relies on the mic/system split. Optional later: local speaker-embedding model to filter non-user voices picked up by the mic.

## AI engine

- **Providers (BYO key):** Anthropic (Claude), Google (Gemini), OpenAI (GPT), OpenRouter, AgentRouter. OpenRouter and AgentRouter use the OpenAI SDK with a custom `baseURL`.
- **One interface:** `stream({ provider, model, system, messages, images }) → AsyncIterable<string>`. Streaming only.
- **Model switching:** per session and mid-session; the next request uses the new model, in-flight answers finish on the old one.
- **Prompt context:** session instructions (≤ 20,000 chars), company/role/mode, recent transcript window, top-k document chunks, optional screenshot.
- **Auto Answer:** question detection on finalized "Them" segments — cheap heuristic first (interrogatives, `?`, rising-intent phrases), optional small-model classifier; debounce so one question yields one answer.
- **Keys:** encrypted with Electron `safeStorage` (DPAPI on Windows, Keychain on macOS), stored in the local settings table, used only in the main process, and sent only to their own provider.

## Documents

- PDF and DOCX parsed locally, chunked (~500 tokens with overlap).
- **Embeddings:** local, via transformers.js running a small sentence-embedding model (e.g. `all-MiniLM-L6-v2`) in the main process — no external API.
- **Search:** vectors stored in SQLite; brute-force cosine similarity (personal-scale corpora make an index unnecessary).

## Storage

- **Local first:** every write goes to SQLite (`better-sqlite3`) in the app's user-data folder. The app works fully offline.
- **Google Drive sync:** OAuth desktop flow (loopback redirect), scope `drive.file` (Revelio can only see files it created). Refresh token encrypted with `safeStorage`. Data synced to a `Revelio` folder in Drive root; an outbox table queues changes while offline.
- **Conflicts:** last-writer-wins per record using `updated_at`; sessions are effectively append-only, so conflicts are rare.
- **Never synced:** API keys, Drive tokens, raw audio (audio is never stored at all).
- **Schema:**

| Table | Key columns |
|---|---|
| `sessions` | id, company, role, mode, language, instructions, model, state, started_at, ended_at, save_transcript, updated_at |
| `transcripts` | id, session_id, speaker (`you`/`them`), text, t_start_ms, t_end_ms |
| `documents` | id, session_id (nullable = global), name, mime, text, created_at |
| `document_chunks` | id, document_id, ordinal, text, embedding (BLOB) |
| `ai_notes` | session_id, summary, questions, action_items, next_steps, created_at |
| `settings` | key, value (encrypted for secrets) |

## Sessions

- **States:** `ready` → `live` → `ended`.
- **Timer:** 30-minute blocks for pacing only (no credits). When a block runs out, an active session (speech in the last few minutes) extends by 30 minutes; an idle session ends automatically.
- **Post-session:** AI Notes generated once on `ended`; transcript kept only if "Save transcript" is on.

## Meeting detection

Poll the process list (and window titles where needed) every few seconds for Zoom, Teams, Meet (browser tab title), Webex, Lark, Chime. On a match, show a "Start a session?" notification. Detection only — never interacts with the meeting app.

## Shortcuts

Global shortcuts (Electron `globalShortcut`), user-configurable: Answer, Screenshot, Clear, End.

## Deliberately out of scope

- **Concealment layer.** Revelio will not hide itself from screen sharing, the taskbar/Dock, Task Manager/Activity Monitor, window switching, or proctoring tools. Its purpose would be to deceive the other people on a call or an assessment; Revelio's overlay stays visible like any other app.
- Payments, credits, accounts, a backend server, telemetry.
- Web (Chrome) live sessions and mobile — later phases.
