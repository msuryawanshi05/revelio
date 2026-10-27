// Streaming answer engine (Claude, Gemini, GPT, OpenRouter, AgentRouter). See docs/architecture.md#ai-engine
// Runs in the Electron main process only: keys are passed in by the caller and never leave main.
const Anthropic = require('@anthropic-ai/sdk').default;
const { OpenAI } = require('openai');
const { GoogleGenAI } = require('@google/genai');
const { PROVIDERS, detectQuestion, buildMessages } = require('./context');

const MAX_TOKENS = 2000; // answers are meant to be short; also caps cost per answer

// OpenAI-compatible providers.
const OPENAI_BASE = {
  openai: undefined,
  openrouter: 'https://openrouter.ai/api/v1',
  // shortcut: AgentRouter's endpoint is not verified here; override with REVELIO_AGENTROUTER_URL if it differs.
  agentrouter: process.env.REVELIO_AGENTROUTER_URL || 'https://agentrouter.org/v1',
};

async function* anthropicTokens({ model, system, chat, apiKey, baseURL, signal }) {
  const client = new Anthropic({ apiKey, baseURL });
  const stream = client.messages.stream({ model, max_tokens: MAX_TOKENS, system, messages: chat }, { signal });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
  }
}

async function* openaiTokens({ provider, model, system, chat, apiKey, baseURL, signal }) {
  const client = new OpenAI({ apiKey, baseURL: baseURL || OPENAI_BASE[provider] });
  const messages = system ? [{ role: 'system', content: system }, ...chat] : chat;
  const stream = await client.chat.completions.create({ model, messages, max_tokens: MAX_TOKENS, stream: true }, { signal });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

async function* geminiTokens({ model, system, chat, apiKey, baseURL, signal }) {
  const ai = new GoogleGenAI({ apiKey, httpOptions: baseURL ? { baseUrl: baseURL } : undefined });
  const contents = chat.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const config = { systemInstruction: system || undefined, maxOutputTokens: MAX_TOKENS, abortSignal: signal };
  const stream = await ai.models.generateContentStream({ model, contents, config });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}

// messages: [{ role: 'system' | 'user' | 'assistant', content }]. options: { apiKey, baseURL? }.
// Calls onToken per streamed chunk, then exactly one of onDone / onError. Returns cancel(); a cancelled stream calls neither.
function streamAnswer(provider, model, messages, onToken, onDone, onError, { apiKey, baseURL } = {}) {
  const controller = new AbortController();
  (async () => {
    if (!PROVIDERS.some((p) => p.id === provider)) throw new Error(`unknown provider "${provider}"`);
    if (!apiKey) throw new Error(`no API key saved for ${provider}`);
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const chat = messages.filter((m) => m.role !== 'system');
    const args = { provider, model, system, chat, apiKey, baseURL, signal: controller.signal };
    const tokens = provider === 'anthropic' ? anthropicTokens(args) : provider === 'google' ? geminiTokens(args) : openaiTokens(args);
    for await (const token of tokens) {
      if (controller.signal.aborted) return;
      onToken(token);
    }
    if (!controller.signal.aborted) onDone();
  })().catch((err) => { if (!controller.signal.aborted) onError(err); });
  return () => controller.abort();
}

module.exports = { streamAnswer, detectQuestion, buildMessages, PROVIDERS };
