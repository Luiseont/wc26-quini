// Tests for the KV backend of api/_lib/store.js.
//
// We mock api/_lib/kv.js (the thin wrapper around @vercel/kv) using Node's
// built-in mock.module (requires --experimental-test-module-mocks). The mock
// is backed by a tiny in-memory implementation that mirrors just enough of the
// @vercel/kv surface for our store. Each test re-imports store.js with a
// unique query string so the module's internal kv/db cache starts fresh.
//
// Running: `node --experimental-test-module-mocks --test test/kv-store.test.mjs`
// (the npm script `test:kv` does this for you).
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// In-memory mock of @vercel/kv (only the surface our store touches)
function makeMockKv() {
  const strings = new Map();   // key -> value (JSON or string)
  const sets = new Map();      // key -> Set
  return {
    _strings: strings, _sets: sets,
    async get(k) {
      const v = strings.get(k);
      if (v === undefined) return null;
      try { return JSON.parse(v); } catch { return v; }
    },
    async set(k, v) {
      strings.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      return 'OK';
    },
    async del(k) {
      const existed = strings.delete(k);
      sets.delete(k);
      return existed ? 1 : 0;
    },
    async smembers(k) {
      return [...(sets.get(k) || [])];
    },
    async sadd(k, ...members) {
      if (!sets.has(k)) sets.set(k, new Set());
      let added = 0;
      for (const m of members) {
        if (!sets.get(k).has(m)) { sets.get(k).add(m); added++; }
      }
      return added;
    },
    async srem(k, ...members) {
      if (!sets.has(k)) return 0;
      let removed = 0;
      for (const m of members) {
        if (sets.get(k).delete(m)) removed++;
      }
      return removed;
    },
    async exists(k) {
      return strings.has(k) || sets.has(k) ? 1 : 0;
    },
  };
}

let mockKv;

beforeEach(() => {
  mock.restoreAll();
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  delete process.env.MONGODB_URI;
  mockKv = makeMockKv();
  // Replace the wrapper module with our in-memory shim. store.js imports
  // './kv.js' lazily inside connect(); the loader hook from mock.module makes
  // that import return our shim instead of the real wrapper.
  mock.module('../api/_lib/kv.js', {
    namedExports: {
      getKv: () => mockKv,
      kget: (k) => mockKv.get(k),
      kset: (k, v) => mockKv.set(k, v),
      kdel: (k) => mockKv.del(k),
      ksmembers: (k) => mockKv.smembers(k),
      ksadd: (k, ...m) => mockKv.sadd(k, ...m),
      ksrem: (k, ...m) => mockKv.srem(k, ...m),
      kexists: (k) => mockKv.exists(k),
    },
  });
});

test('KV: createParticipant stores and indexes by name', async () => {
  const store = await import(`../api/_lib/store.js?t=${Date.now()}`);

  const p = await store.createParticipant({ name: 'Marta', predictions: [] });
  assert.ok(p.id);
  assert.equal(p.name, 'Marta');

  const all = await store.listParticipants();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Marta');
});

test('KV: duplicate name is rejected with 409', async () => {
  const store = await import(`../api/_lib/store.js?t=${Date.now()}`);

  await store.createParticipant({ name: 'Lucas', predictions: [] });
  await assert.rejects(
    () => store.createParticipant({ name: 'lucas', predictions: [] }),
    (e) => e.status === 409,
  );
});

test('KV: updateParticipant changes predictions', async () => {
  const store = await import(`../api/_lib/store.js?t=${Date.now()}`);

  const p = await store.createParticipant({
    name: 'Ana',
    predictions: [{ matchId: 'QF1', home: 1, away: 0 }],
  });
  const updated = await store.updateParticipant(p.id, {
    predictions: [{ matchId: 'QF1', home: 2, away: 0 }],
  });
  assert.equal(updated.predictions[0].home, 2);
});

test('KV: deleteParticipant removes from index and name lookup', async () => {
  const store = await import(`../api/_lib/store.js?t=${Date.now()}`);

  const p = await store.createParticipant({ name: 'Pepe', predictions: [] });
  await store.deleteParticipant(p.id);
  const all = await store.listParticipants();
  assert.equal(all.length, 0);
});

test('KV: upsertResult stores and listResults returns all matches', async () => {
  const store = await import(`../api/_lib/store.js?t=${Date.now()}`);

  const r = await store.upsertResult('QF1', { home: 2, away: 1, finished: true });
  assert.equal(r.home, 2);
  assert.equal(r.finished, true);

  const all = await store.listResults();
  assert.equal(all.length, 7);
  const qf1 = all.find((x) => x.matchId === 'QF1');
  assert.equal(qf1.home, 2);
});

test('KV: resetAll clears participants and reseeds results', async () => {
  const store = await import(`../api/_lib/store.js?t=${Date.now()}`);

  await store.createParticipant({ name: 'Test', predictions: [] });
  await store.upsertResult('QF1', { home: 3, away: 0, finished: true });
  await store.resetAll();

  const all = await store.listParticipants();
  assert.equal(all.length, 0);
  const results = await store.listResults();
  assert.equal(results.length, 7);
  assert.equal(results.every((r) => !r.finished && r.home === null), true);
});
