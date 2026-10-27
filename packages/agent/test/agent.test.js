// node --test packages/agent/test/*.test.js — fake SSE server per provider format; no keys, no network.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { streamAnswer, detectQuestion, buildMessages } = require('../src');
const { MAX_CONTEXT_TOKENS } = require('../src/context');

const sse = (events) => events.map((e) => (e.event ? `event: ${e.event}\n` : '') + `data: ${typeof e === 'string' ? e : JSON.stringify(e.data)}\n\n`).join('');

const ANTHROPIC = sse([
  { event: 'message_start', data: { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } } },
  { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
  { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } },
  { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } } },
  { event: 'message_stop', data: { type: 'message_stop' } },
]);
const OPENAI = sse([
  { data: { id: 'c', object: 'chat.completion.chunk', created: 0, model: 'x', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hel' } }] } },
  { data: { id: 'c', object: 'chat.completion.chunk', created: 0, model: 'x', choices: [{ index: 0, delta: { content: 'lo' }, finish_reason: 'stop' }] } },
  '[DONE]',
]);
const GEMINI = sse([
  { data: { candidates: [{ content: { role: 'model', parts: [{ text: 'Hel' }] } }] } },
  { data: { candidates: [{ content: { role: 'model', parts: [{ text: 'lo' }] }, finishReason: 'STOP' }] } },
]);

function fakeServer() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; }).on('end', () => {
      seen.push({ url: req.url, body: JSON.parse(body || '{}'), auth: req.headers.authorization || req.headers['x-api-key'] || req.headers['x-goog-api-key'] });
      if (req.url.includes('fail')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"bad key"}}'); }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(req.url.includes('/messages') ? ANTHROPIC : req.url.includes('streamGenerateContent') ? GEMINI : OPENAI);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

const run = (provider, baseURL, apiKey = 'k') => new Promise((resolve) => {
  const tokens = [];
  streamAnswer(provider, 'some-model', [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'Q?' }],
    (t) => tokens.push(t), () => resolve({ tokens }), (err) => resolve({ tokens, err }), { apiKey, baseURL });
});

test('streams tokens from every provider format and passes the system prompt', async () => {
  const { server, seen, url } = await fakeServer();
  try {
    for (const [provider, base] of [['anthropic', url], ['openai', url], ['openrouter', url], ['agentrouter', url], ['google', url]]) {
      const { tokens, err } = await run(provider, base);
      assert.ifError(err);
      assert.deepStrictEqual(tokens, ['Hel', 'lo'], provider);
      assert.match(JSON.stringify(seen.at(-1).body), /SYS/, `${provider} system prompt`);
      const { body } = seen.at(-1);
      assert.strictEqual(body.max_tokens ?? body.generationConfig?.maxOutputTokens, 2000, `${provider} token cap`);
    }
  } finally { server.close(); }
});

test('reports API errors and missing keys via onError', async () => {
  const { server, url } = await fakeServer();
  try {
    assert.ok((await run('openai', `${url}/fail`)).err);
    assert.match((await run('anthropic', url, '')).err.message, /no API key/);
    assert.match((await run('nope', url)).err.message, /unknown provider/);
  } finally { server.close(); }
});

test('detectQuestion', () => {
  for (const t of ['How would you debounce a search input', 'Can you hear me okay', 'Tell me about a project you led.', 'So, walk me through your design.',
    'Great. Explain how React reconciles.', 'what is a closure?', 'That makes sense. Why did you pick Postgres', [{ text: 'hi' }, { text: 'Describe your last role.' }]]) {
    assert.ok(detectQuestion(t), JSON.stringify(t));
  }
  for (const t of ['Thanks, that makes sense.', 'I know what you mean.', 'We used Redis for caching.', '', [{ text: 'Why?' }, { text: 'Okay great.' }]]) {
    assert.ok(!detectQuestion(t), JSON.stringify(t));
  }
});

test('buildMessages keeps the last 10 entries and trims oldest first to fit the token budget', () => {
  const entries = Array.from({ length: 15 }, (_, i) => ({ who: i % 2 ? 'You' : 'Interviewer', text: `line ${i}` }));
  const [sys, user] = buildMessages({ entries, question: 'Why?', instructions: 'a frontend engineer' });
  assert.match(sys.content, /^You are a helpful assistant in a live conversation\. Answer concisely and accurately\. The user is: a frontend engineer\.$/);
  assert.ok(!user.content.includes('line 4') && user.content.includes('line 5') && user.content.includes('line 14'));
  assert.ok(user.content.endsWith('Why?'));

  const long = Array.from({ length: 10 }, (_, i) => ({ who: 'Interviewer', text: `${i} ${'x'.repeat(4000)}` }));
  const msgs = buildMessages({ entries: long, question: 'Q', docs: ['doc chunk'] });
  const total = msgs.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);
  assert.ok(total <= MAX_CONTEXT_TOKENS + 50, `~${total} tokens`);
  assert.ok(msgs[1].content.includes('9 xxx') && !msgs[1].content.includes('0 xxx'), 'newest kept, oldest dropped');
  assert.match(msgs[0].content, /Relevant documents:\ndoc chunk/);
});
