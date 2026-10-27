# Parakeet AI — Product Analysis

Reference analysis used to scope Revelio. Captured 2026-10-27 from the public landing page (`https://www.parakeet-ai.com/`), its response headers and CSP, and static inspection of 34 public JS chunks. The signed-in app, desktop binary and live network traffic were **not** inspected; items marked *inferred* are deductions from CSP and route names.

## 1. Product overview

- **Tagline:** "Your Real-Time AI Interview Assistant" — live answers in interviews, sales calls and meetings "where freezing up isn't an option".
- **Audience:** job seekers first; strong India focus (INR pricing, "#1 Viral App in India"). Markets itself against Cluely (`/compare/cluely-alternatives`).
- **Claims:** 1.5M+ users, 340K+ reviews, 4.86★.
- **Entity:** ParakeetAI d.o.o. (Slovenia). Sister products: Kismo, Tarko AI.
- **Upsells:** Question Bank, Resume Maker, Headshots.

## 2. Platforms

| Form | Behavior |
|---|---|
| Desktop app (Windows, macOS) | Live session overlay, meeting auto-detect. Works regardless of default browser. Download gated behind sign-in (`/auth/desktop`). |
| Web (desktop Chrome only) | Live sessions require Chrome; also the Linux path. Other browsers unsupported for live sessions. |
| Mobile web | Mobile-optimized site, own auth (`/auth/mobile`) and session view (`/callSession/:id/mobile`). Native app "on its way". |

Route variants `/callSession/:id`, `/callSession/:id/desktop`, `/callSession/:id/mobile` suggest the desktop app wraps the web app rather than being a separate native UI (*inferred*).

## 3. Core features

- **Auto Answer** — detects questions in the live transcript and suggests an answer automatically; "Auto Answer On" toggle.
- **Auto-detect meetings** (desktop) — Zoom, Teams, Meet, Webex, Lark, Chime, CoderPad, HackerRank; prompts to join. Phone calls via Google Voice.
- **Coding support** — screenshot-driven; images are sent only when the user presses Screenshot / Add screenshot. Model explains approach.
- **Transcription** — Speechmatics real-time (CSP allows `wss://*.rt.speechmatics.com`). Per-session custom vocabulary (company, words from resume and job description). Optional **voice profile** (voice sample + signature) to separate the user from other speakers. 50+ languages, one per session.
- **AI models** — user picks GPT / Claude / Gemini; traffic goes to OpenAI, Google, Anthropic directly or via AWS Bedrock or Cerebras. UI hint: lighter = faster, larger = more detailed.
- **Documents** — PDF/DOCX uploaded via UploadThing, indexed in **Pinecone** (vector RAG), referenced live.
- **AI Notes** — post-call summary, key points, action items, decisions; "Clear Notes".
- **Modes** — Interview (uses CV/resume) vs Regular call (doesn't). Mock Interview: OpenAI voices the interviewer (likely realtime speech-to-speech), Speechmatics transcribes the user; first mock free.
- **Question Bank** — `/questionBank/:companyDomain/:positionId`.
- **Resume Maker** — chat-driven, runs on Gemini.
- **Headshots** — one photo → studio headshots.

## 4. Privacy / concealment claims

The landing page advertises the app as invisible on screen share, in the Dock, in Activity Monitor, to tab-switch detection, and with an unchanged cursor, "verified" on 8 platforms (Zoom, Teams, Meet, Webex, Lark, Chime, CoderPad, HackerRank). Employers can request a company block via `compliance@parakeet-ai.com`; an admin "blocked companies" page exists.

Revelio deliberately does **not** replicate this concealment layer — see `architecture.md`.

## 5. Session system

- **Create:** company, role, mode (interview / regular call), language, instructions (≤ 20,000 chars), documents, model, resume.
- **States:** Ready to Start → Live → Ended. Ended: View / Save Transcript.
- **Credits:** 0.5 credit = 30-minute session (incl. mock). Active sessions auto-extend another 30 min / 0.5 credit when the timer hits 0; idle sessions don't. 0.5 = headshot, 0.25 = resume PDF, 1 = Question Bank company.
- **Pricing (INR):** 1 credit ₹2,360 · 3 ₹3,690 · 8 ₹7,380 · 15 ₹11,070 · Unlimited ₹9,470/mo or ₹37,900/yr · Weekly ₹4,980 · each upsell tool ₹1,450/mo. Refund flows for credits and money.

## 6. Technical clues

- **Frontend:** Next.js (React), Turbopack build, hosted on Vercel; Lucide icons.
- **API:** tRPC at `/api/trpc`. Observed procedures: `billing.getPrices`, `billing.createCheckoutSession`, `billing.createStripePortalSession`, `billing.switchSubscription`, `user.setLanguage`, `user.getSessionForcedLogout` (device-limit enforcement, *inferred*).
- **Auth:** Auth.js (NextAuth), Google sign-in.
- **Backend:** Google Cloud Run (`*.a.run.app`) — likely the realtime AI/transcription pipeline, separate from Vercel (*inferred*).
- **Data:** Neon Postgres (eu-central-1). **Files:** UploadThing. **Payments:** Stripe.
- **Telemetry:** Sentry (DE), Mixpanel (EU), GA/Ads, Facebook pixel. **Forms:** Fillout.
- **Browser → `api.openai.com`:** likely ephemeral tokens for realtime voice (mock interviews) (*inferred*).
- **Audio capture:** browser — likely Chrome tab share with audio (other side) + microphone (user), explaining the Chrome-only requirement; audio streams browser → Speechmatics websocket (*inferred*). Desktop — wrapper around the same web views with system audio and screenshot capture (*inferred*).
- **Internal admin routes:** LLM usage, prompt testing (incl. `realtime-support`), call sessions, connected apps, blocked companies, app/company reviews, support, emails.

## 7. UX & UI

- **Live panel:** scrolling transcript, answer area with Auto Answer toggle; controls **Answer**, **Screenshot**, **Chat**, **Clear**, **End**; session timer driving auto-extend.
- **Answer timing:** with Auto Answer on, a detected question triggers a streamed answer; otherwise the user presses Answer. Model choice trades speed for depth.
