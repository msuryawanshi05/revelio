// Pure helpers shared by main and the web UI (no SDKs here, so the renderer can import it).

// id matches the key store / Settings ids; model is the default used for answers.
const PROVIDERS = [
  { id: 'anthropic', name: 'Claude', model: 'claude-sonnet-4-5' },
  { id: 'google', name: 'Gemini', model: 'gemini-2.0-flash' },
  { id: 'openai', name: 'GPT', model: 'gpt-4o' },
  { id: 'openrouter', name: 'OpenRouter', model: 'anthropic/claude-sonnet-4.5' },
  { id: 'agentrouter', name: 'AgentRouter', model: 'claude-sonnet-4-5' },
];

const QUESTION_START = /^(what|why|how|when|where|who|whom|whose|which|can|could|would|should|will|do|does|did|is|are|was|were|have|has|had|may|might|shall)\b/i;
const IMPERATIVE = /\b(tell me|walk me through|talk me through|explain|describe|give me an example|talk about|share (an|a|some)|elaborate|take me through)\b/i;

// True if the last transcript entry (string, or array of { text }) reads like a question or a prompt to answer.
function detectQuestion(transcript) {
  const last = Array.isArray(transcript) ? transcript[transcript.length - 1]?.text : transcript;
  const text = String(last || '').trim();
  if (!text) return false;
  if (text.endsWith('?')) return true;
  // whisper often drops the '?', so look at how the last sentence starts
  const sentence = text.split(/(?<=[.!?])\s+/).filter(Boolean).pop().replace(/^(so|and|okay|ok|now|well|right|great|alright)[, ]+/i, '');
  return QUESTION_START.test(sentence) || IMPERATIVE.test(text);
}

const MAX_CONTEXT_TOKENS = 4000;
const HISTORY = 10;
// shortcut: ~4 chars per token estimate; switch to the providers' token counters if context gets close to real limits.
const tokens = (s) => Math.ceil(s.length / 4);

// entries: [{ who: 'You' | 'Interviewer', text }]; question: the text to answer.
// Returns [{ role: 'system' | 'user', content }] within MAX_CONTEXT_TOKENS, dropping the oldest history first.
function buildMessages({ entries = [], question, instructions = '', docs = [] }) {
  const system = 'You are a helpful assistant in a live conversation. Answer concisely and accurately.'
    + ` The user is: ${instructions.trim() || 'not specified'}.`
    + (docs.length ? `\n\nRelevant documents:\n${docs.join('\n---\n')}` : '');
  const ask = `Answer this from the conversation:\n${question}`;
  const history = entries.slice(-HISTORY).map((e) => `${e.who}: ${e.text}`);
  const budget = MAX_CONTEXT_TOKENS - tokens(system) - tokens(ask);
  while (history.length && tokens(history.join('\n')) > budget) history.shift();
  const content = history.length ? `Conversation so far:\n${history.join('\n')}\n\n${ask}` : ask;
  return [{ role: 'system', content: system }, { role: 'user', content }];
}

module.exports = { PROVIDERS, detectQuestion, buildMessages, MAX_CONTEXT_TOKENS };
