<div align="center">

# Revelio

**Your Real-Time AI Meeting & Interview Assistant**

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge)
![Transcription](https://img.shields.io/badge/transcription-whisper.cpp%20offline-6A5ACD?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Status](https://img.shields.io/badge/status-In%20Development-orange?style=for-the-badge)

*Personal use only · Free · No payment system*

</div>

---

## About

Revelio is a real-time AI assistant for calls and interviews, built for personal use across Windows and macOS. It listens to your calls and interviews in real-time, detects questions, and streams AI answers live — all running locally with no subscription, no credits, and no cost.

Transcription runs fully offline via **whisper.cpp** (tiny model by default, CUDA-accelerated if an NVIDIA GPU is detected). AI answers use **your own API keys** — Claude, Gemini, GPT, OpenRouter, AgentRouter. Session data syncs to a **single Google Drive folder** across all your machines, with automatic fallback to **local SQLite** if Drive is unavailable.

---

## Features

<details open>
<summary><b>Live session</b></summary>

- **Auto Answer** — detects questions in the live transcript and streams an answer without a key press; toggle on/off mid-call
- **Manual Answer** — answer the most recent question on demand
- **Live transcript** — rolling, speaker-labelled transcript from offline whisper.cpp
- **Screenshot** — capture the screen and send it with the conversation for coding or visual questions
- **Chat** — type a question or follow-up directly to the model
- **Clear / End** — reset the answer panel or end the session
- **Session context** — company, role, mode (Interview / Regular call), language, and a free-form instructions field
- **Documents** — attach PDF and DOCX files (resume, job description, notes) referenced in every answer
- **Model switching** — choose provider and model per session; lighter models answer faster, larger ones go deeper
- **Meeting detection** — notices when Zoom, Teams, Meet, Webex and similar apps start a call and offers to begin a session

</details>

<details>
<summary><b>Post-session</b></summary>

- **AI Notes** — summary, key questions asked, action items and decisions
- **Transcript** — full transcript saved with the session, viewable and exportable
- **Session history** — every session listed with state (Ready to Start · Live · Ended), date, company and role

</details>

<details>
<summary><b>Settings</b></summary>

- API keys per provider, stored locally
- Default provider and model
- Whisper model size and device (CPU / CUDA, auto-detected)
- Audio input selection (microphone, system audio)
- Google Drive sign-in and sync folder
- Default language and instructions template

</details>

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| Windows 10/11 | ✅ Primary | Electron desktop app, CUDA acceleration on NVIDIA GPUs |
| macOS 12+ | ✅ Primary | Electron desktop app, Metal-accelerated whisper.cpp on Apple Silicon |
| Web (desktop Chrome) | 🟡 Planned | Next.js UI served in Chrome; audio via tab capture |
| Mobile | 🔮 Future | Mobile-optimized web view, then native app |

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) | Cross-platform app, audio capture, screenshots, tray |
| UI | [Next.js](https://nextjs.org/) | Session dashboard, live panel, settings |
| Transcription | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Offline speech-to-text, CPU / CUDA / Metal |
| Local storage | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Sessions, transcripts, notes, settings |
| Sync | [Google Drive API](https://developers.google.com/drive) | Cross-machine session sync |
| AI — Claude | [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) | Claude models |
| AI — Gemini | [Google AI SDK](https://ai.google.dev/) | Gemini models |
| AI — GPT | [OpenAI SDK](https://github.com/openai/openai-node) | GPT models |
| AI — Aggregators | [OpenRouter](https://openrouter.ai/) | Many models behind one key (OpenAI-compatible) |

---

## Installation

> 🚧 Installers are in progress — whisper.cpp build steps are still stubbed.

| OS | Script |
|---|---|
| Windows | `powershell -ExecutionPolicy Bypass -File scripts\install.ps1` |
| macOS | `bash scripts/install.sh` |

### Development

Requires **Node.js 22+**.

```bash
npm install
npm run dev     # starts the Next.js UI on :3000, then opens the Electron overlay
```

<details>
<summary><b>Project structure</b></summary>

```
revelio/
├── apps/
│   ├── desktop/      # Electron shell — overlay window, preload bridge
│   └── web/          # Next.js UI — live session, sessions sidebar, settings
├── packages/
│   ├── transcriber/  # whisper.cpp integration
│   ├── agent/        # streaming AI answer engine
│   ├── storage/      # SQLite + Google Drive sync
│   └── session/      # session state machine and timer
├── docs/             # architecture and research notes
└── scripts/          # install.ps1 (Windows), install.sh (macOS)
```

</details>

---

## Supported AI Providers

Bring your own key — Revelio never proxies or bills your usage.

| Provider | Example models | Key from |
|---|---|---|
| **Claude** (Anthropic) | Claude Opus, Sonnet, Haiku | [console.anthropic.com](https://console.anthropic.com/) |
| **Gemini** (Google) | Gemini Pro, Flash | [aistudio.google.com](https://aistudio.google.com/) |
| **GPT** (OpenAI) | GPT family | [platform.openai.com](https://platform.openai.com/) |
| **OpenRouter** | Any model on OpenRouter | [openrouter.ai](https://openrouter.ai/) |
| **AgentRouter** | Any model on AgentRouter (OpenAI-compatible) | AgentRouter dashboard |

---

## Whisper Model Sizes

`tiny` is the default. Larger models are more accurate but slower; with CUDA or Metal, `small` and `medium` stay real-time on most machines.

| Model | Disk | RAM (approx.) | Relative speed | Best for |
|---|---|---|---|---|
| `tiny` | 75 MB | ~275 MB | ~32× | Default; fast on any CPU |
| `base` | 142 MB | ~390 MB | ~16× | Better accuracy, still CPU-friendly |
| `small` | 466 MB | ~850 MB | ~6× | Good accuracy; GPU recommended |
| `medium` | 1.5 GB | ~2.1 GB | ~2× | High accuracy; GPU required for live use |
| `large` | 2.9 GB | ~3.9 GB | 1× | Best accuracy, accents and multilingual; strong GPU |

---

## Storage

Revelio keeps one source of truth per session and works offline first.

1. **Google Drive (primary)** — after signing in, sessions, transcripts, notes and documents sync to a single `Revelio` folder in your Drive, so every machine you use sees the same history.
2. **Local SQLite (fallback)** — every write lands in a local `better-sqlite3` database first. If Drive is unreachable (offline, signed out, quota or auth error), Revelio keeps working from SQLite and syncs pending changes once Drive is back.

<details>
<summary><b>What is stored</b></summary>

| Data | Local SQLite | Google Drive |
|---|---|---|
| Sessions & metadata | ✅ | ✅ |
| Transcripts | ✅ | ✅ |
| AI Notes | ✅ | ✅ |
| Uploaded documents | ✅ | ✅ |
| API keys | ✅ (local only) | ❌ never synced |
| Raw audio | ❌ | ❌ never stored |

</details>

---

## Privacy

- **Audio never leaves your machine** — whisper.cpp transcribes locally.
- **Only text goes to your chosen AI provider**, using your own key.
- **API keys stay local** and are never written to Drive.
- **No telemetry, no accounts, no servers** — Revelio has no backend of its own.

---

## Roadmap

**Current scope**

- [ ] Electron shell + Next.js UI
- [ ] Offline transcription with whisper.cpp (CPU / CUDA / Metal)
- [ ] Live session: Auto Answer, Answer, Screenshot, Chat, Clear, End
- [ ] Multi-provider AI (Claude, Gemini, GPT, OpenRouter, AgentRouter)
- [ ] Document upload (PDF, DOCX)
- [ ] AI Notes and transcripts
- [ ] Google Drive sync with SQLite fallback
- [ ] Meeting auto-detection
- [ ] Windows and macOS installers

**Future scope**

- [ ] Mock Interview — practice against a voiced AI interviewer
- [ ] Question Bank — questions by company and role
- [ ] Resume Maker — tailored resume generation
- [ ] Headshots — professional headshots from a single photo
- [ ] Mobile app

---

## Contributing

Revelio is a personal project and is **not open for contributions**. Issues and pull requests will not be reviewed.

---

## License

Released under the [MIT License](https://opensource.org/licenses/MIT).
# revelio
