// API end-to-end tests using the local dev server. We boot the Express dev
// server on a random port, then hit it with fetch.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

let baseUrl;
let server;

async function fetchJson(path, init = {}) {
  const res = await fetch(baseUrl + path, init);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body, contentType: ct };
}

before(async () => {
  process.env.PORT = process.env.PORT || '8791';
  server = spawn('node', ['server/dev-api.mjs'], {
    env: { ...process.env, PORT: process.env.PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  baseUrl = `http://127.0.0.1:${process.env.PORT}`;
  server.stderr.on('data', d => process.stderr.write('[api-err] ' + d));

  // Wait until the server returns a well-formed /api/health payload.
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(baseUrl + '/api/health');
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok && typeof j.participants === 'number') return;
      }
    } catch {}
    await wait(100);
  }
  throw new Error('Dev server did not become ready');
});

after(() => {
  if (server) server.kill();
});

test('GET /api/health returns ok + counts', async () => {
  const r = await fetch(baseUrl + '/api/health');
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  assert.equal(r.status, 200, `body=${text}`);
  assert.equal(body.ok, true);
  assert.equal(body.participants, 0);
  assert.equal(body.resultsEntered, 0);
  assert.equal(body.totalMatches, 7);
});

test('GET /api/matches returns 7 matches with stages', async () => {
  const { status, body } = await fetchJson('/api/matches');
  assert.equal(status, 200);
  assert.equal(body.matches.length, 7);
  const ids = body.matches.map(m => m.id);
  assert.deepEqual(ids, ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F1']);
  assert.ok(body.matches.find(m => m.id === 'SF1'));
});

test('GET /api/all-results seeds 7 unfinished results', async () => {
  const { status, body } = await fetchJson('/api/all-results');
  assert.equal(status, 200);
  assert.equal(body.results.length, 7);
  assert.ok(body.results.every(r => !r.finished));
});

test('Admin gate: PUT /api/results/QF1 without key -> 401', async () => {
  const { status } = await fetchJson('/api/results/QF1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ home: 2, away: 1, finished: true }),
  });
  assert.equal(status, 401);
});

test('Create a participant and read it back', async () => {
  const { status, body } = await fetchJson('/api/participants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Marta',
      predictions: [
        { matchId: 'QF1', home: 2, away: 1 },
        { matchId: 'QF2', home: 1, away: 0 },
        { matchId: 'QF3', home: 0, away: 0 },
        { matchId: 'QF4', home: 3, away: 1 },
        { matchId: 'SF1', home: 2, away: 1 },
        { matchId: 'SF2', home: 1, away: 2 },
        { matchId: 'F1',  home: 2, away: 0 },
      ],
    }),
  });
  assert.equal(status, 201);
  assert.equal(body.participant.name, 'Marta');
  assert.equal(body.participant.predictions.length, 7);
});

test('Duplicate name is rejected with 409', async () => {
  const { status, body } = await fetchJson('/api/participants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Marta', predictions: [] }),
  });
  assert.equal(status, 409);
  assert.match(body.error, /ya existe/i);
});

test('Admin can update a result with the right key', async () => {
  const { status, body } = await fetchJson('/api/results/QF1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': 'wc26-amigos-2026' },
    body: JSON.stringify({ home: 2, away: 1, finished: true }),
  });
  assert.equal(status, 200);
  assert.equal(body.result.finished, true);
  assert.equal(body.result.home, 2);
  assert.equal(body.result.away, 1);
});

test('New participant blocked after results loaded (predictions closed)', async () => {
  // QF1 was finalized in the previous test. A new participant must be rejected.
  const { status, body } = await fetchJson('/api/participants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Latecomer',
      predictions: [{ matchId: 'QF1', home: 1, away: 0 }],
    }),
  });
  assert.equal(status, 409);
  assert.match(body.error, /predicciones se cierran|ya hay resultados/i);
});

test('Leaderboard reflects entered result', async () => {
  // Marta predicted 2-1 for QF1, result is 2-1 -> exact winner + exact score = 8 pts
  const { status, body } = await fetchJson('/api/leaderboard');
  assert.equal(status, 200);
  const marta = body.leaderboard.find(p => p.name === 'Marta');
  assert.ok(marta, 'Marta should appear in leaderboard');
  const qf1 = marta.perMatch.find(m => m.matchId === 'QF1');
  assert.equal(qf1.points, 8);
  assert.equal(qf1.rule, 'EXACT_WINNER_SCORE');
  assert.ok(marta.total >= 8);
});

test('Inconsistencies endpoint flags PREDICTED_DRAW for Marta', async () => {
  const { status, body } = await fetchJson('/api/admin/inconsistencies', {
    headers: { 'x-admin-key': 'wc26-amigos-2026' },
  });
  assert.equal(status, 200);
  const draw = body.predictionIssues.find(i => i.code === 'PREDICTED_DRAW' && i.participantName === 'Marta');
  assert.ok(draw, 'Expected a PREDICTED_DRAW inconsistency for Marta');
  assert.ok(Array.isArray(body.ruleAudit));
  assert.ok(body.ruleAudit.length >= 4);
});

test('Admin check endpoint reports the key as valid', async () => {
  const { status, body } = await fetchJson('/api/admin/check', {
    headers: { 'x-admin-key': 'wc26-amigos-2026' },
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.required, true);
});
