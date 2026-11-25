// Tests d'intégration SANS clé réelle : OpenAI et Stripe sont simulés par des serveurs locaux.
// Lancer : npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const calls = { openai: 0, stripeForm: null };
let openaiDown = false;

function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(s));
  });
}
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });

let mockOpenAI, mockStripe, server, B, stripeLib;

before(async () => {
  // --- faux OpenAI (API compatible /chat/completions) ---
  mockOpenAI = await listen(async (req, res) => {
    const body = JSON.parse((await readBody(req)) || '{}');
    calls.openai++;
    if (openaiDown) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end('{"error":"down"}'); }
    const isKeywords = body.messages[0].content.includes('mots-clés');
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const t of ['Un guide ', 'pratique ', 'du code propre.']) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    const content = isKeywords ? '["Clean Code","Java"]' : 'Clean Code est un guide pratique pour écrire du code lisible. Il explique les bonnes pratiques.';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
  });
  // --- faux Stripe (création de PaymentIntent) ---
  mockStripe = await listen(async (req, res) => {
    calls.stripeForm = new URLSearchParams(await readBody(req));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'pi_mock', object: 'payment_intent', client_secret: 'pi_mock_secret_abc', amount: 500, currency: 'eur' }));
  });

  Object.assign(process.env, {
    DB_PATH: ':memory:', JWT_SECRET: 'test-secret',
    OPENAI_API_KEY: 'test-key', OPENAI_BASE_URL: `http://127.0.0.1:${mockOpenAI.address().port}/v1`, OPENAI_MODEL: 'mock-model',
    STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_PUBLISHABLE_KEY: 'pk_test_mock', STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  });
  // On redirige la lib Stripe vers le faux serveur AVANT de charger les routes
  stripeLib = require('stripe');
  const svc = require('../src/services/stripe');
  const client = new stripeLib('sk_test_mock', { host: '127.0.0.1', port: mockStripe.address().port, protocol: 'http', maxNetworkRetries: 0 });
  svc.getStripe = () => client;

  const app = require('../src/app');
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  B = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(() => { server.close(); mockOpenAI.close(); mockStripe.close(); });

const api = async (method, path, { token, body, headers } = {}) => {
  const r = await fetch(B + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text, headers: r.headers };
};
async function newUser(name) {
  await api('POST', '/auth/register', { body: { name, email: `${name}@t.mg`, password: 'secret123' } });
  const { json } = await api('POST', '/auth/login', { body: { email: `${name}@t.mg`, password: 'secret123' } });
  return { token: json.data.token, id: json.data.user.id };
}

let u1;
test('auth : register + login', async () => { u1 = await newUser('alice'); assert.ok(u1.token); });

test('POST /books/:id/summary exige un JWT', async () => {
  assert.equal((await api('POST', '/books/1/summary')).status, 401);
});

test('POST /books/:id/summary : génère, sauvegarde, puis ne rappelle PAS OpenAI', async () => {
  const before = calls.openai;
  const r1 = await api('POST', '/books/1/summary', { token: u1.token });
  assert.equal(r1.status, 200);
  assert.ok(r1.json.data.summary.length > 10);
  assert.equal(r1.json.data.generated_by, 'mock-model');
  assert.equal(calls.openai, before + 1);
  const r2 = await api('POST', '/books/1/summary', { token: u1.token });
  assert.equal(r2.status, 200);
  assert.match(r2.json.message, /pas de nouvel appel API/);
  assert.equal(calls.openai, before + 1, 'aucun second appel OpenAI');
  const g = await api('GET', '/books/1/summary');
  assert.equal(g.status, 200);
  assert.equal(g.json.data.summary, r1.json.data.summary);
});

test('GET /books/:id/summary : 404 si pas de résumé / livre inexistant', async () => {
  assert.equal((await api('GET', '/books/2/summary')).status, 404);
  assert.equal((await api('POST', '/books/999/summary', { token: u1.token })).status, 404);
});

test('POST /books/smart-search : keywords[] + data[]', async () => {
  const r = await api('POST', '/books/smart-search', { body: { query: 'un livre sur les bonnes pratiques en Java' } });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.keywords));
  assert.ok(Array.isArray(r.json.data));
  assert.ok(r.json.data.some((b) => b.title === 'Clean Code'));
  assert.equal((await api('POST', '/books/smart-search', { body: {} })).status, 422);
});

test('BONUS SSE : GET /books/:id/summary/stream', async () => {
  const r = await api('GET', '/books/3/summary/stream', { token: u1.token });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  assert.match(r.text, /Un guide/);
  assert.match(r.text, /event: done/);
});

test('503 si OpenAI est indisponible', async () => {
  openaiDown = true;
  try {
    assert.equal((await api('POST', '/books/2/summary', { token: u1.token })).status, 503);
    assert.equal((await api('POST', '/books/smart-search', { body: { query: 'java' } })).status, 503);
  } finally { openaiDown = false; }
});

test('POST /subscriptions/payment-intent : 500 EUR + metadata user_id/plan', async () => {
  assert.equal((await api('POST', '/subscriptions/payment-intent')).status, 401);
  const r = await api('POST', '/subscriptions/payment-intent', { token: u1.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.amount, 500);
  assert.equal(r.json.data.currency, 'eur');
  assert.equal(r.json.data.client_secret, 'pi_mock_secret_abc');
  assert.equal(r.json.data.publishable_key, 'pk_test_mock');
  assert.equal(calls.stripeForm.get('metadata[user_id]'), String(u1.id));
  assert.equal(calls.stripeForm.get('metadata[plan]'), 'premium');
});

test('middleware emprunts : free limité à 2, premium illimité (via webhook)', async () => {
  const u = await newUser('bob');
  const borrow = (id) => api('POST', '/borrows', { token: u.token, body: { book_id: id } });
  const created = [];
  for (let i = 0; i < 4; i++) created.push((await api('POST', '/books', { token: u.token, body: { title: `Livre ${i}` } })).json.data.id);
  assert.equal((await borrow(created[0])).status, 201);
  assert.equal((await borrow(created[1])).status, 201);
  assert.equal((await borrow(created[2])).status, 403);

  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1', amount: 500, metadata: { user_id: String(u.id), plan: 'premium' } } } });
  const sig = stripeLib.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const w = await fetch(B + '/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body: payload });
  assert.equal(w.status, 200);
  assert.deepEqual(await w.json(), { received: true });

  assert.equal((await api('GET', '/subscriptions/status', { token: u.token })).json.data.subscription_status, 'premium');
  const r = await borrow(created[2]);
  assert.equal(r.status, 201);
  assert.equal(r.json.data.payment_status, 'paid');
});

test('webhook : 401 sans signature et avec signature invalide', async () => {
  const a = await api('POST', '/webhooks/stripe', { body: { type: 'payment_intent.succeeded' } });
  assert.equal(a.status, 401); assert.equal(a.json.success, false);
  const b = await api('POST', '/webhooks/stripe', { body: { type: 'x' }, headers: { 'Stripe-Signature': 't=1,v1=bad' } });
  assert.equal(b.status, 401);
});

test('webhook : un autre type d’événement est accepté sans effet', async () => {
  const payload = JSON.stringify({ id: 'evt_2', object: 'event', type: 'charge.updated', data: { object: {} } });
  const sig = stripeLib.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const w = await fetch(B + '/webhooks/stripe', { method: 'POST', headers: { 'Stripe-Signature': sig }, body: payload });
  assert.equal(w.status, 200);
});
