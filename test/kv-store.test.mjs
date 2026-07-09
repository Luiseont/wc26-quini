// Tests for the KV backend of api/_lib/store.js. The redis client is
// mocked via mock.module on api/_lib/kv.js, so we don't need a real Redis.
//
// We use a single file-level mock whose methods dispatch to a per-test
// in-memory state map. This way each test sees a clean slate, but the
// mock module itself is registered only once.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function createFresh() {
  const strings = new Map();
  const sets = new Map();
  return {
    strings, sets,
    async kget(k) {
      const v = strings.get(k);
      if (v === undefined) return null;
      try { return JSON.parse(v); } catch { return v; }
    },
    async kset(k, v) {
      strings.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      return 'OK';
    },
    async kdel(k) {
      const existed = strings.delete(k);
      sets.delete(k);
      return existed ? 1 : 0;
    },
    async ksmembers(k) {
      return [...(sets.get(k) || [])];
    },
    async ksadd(k, ...members) {
      if (!sets.has(k)) sets.set(k, new Set());
      let added = 0;
      for (const m of members) {
        if (!sets.get(k).has(m)) { sets.get(k).add(m); added++; }
      }
      return added;
    },
    async ksrem(k, ...members) {
      if (!sets.has(k)) return 0;
      let removed = 0;
      for (const m of members) {
        if (sets.get(k).delete(m)) removed++;
      }
      return removed;
    },
    async kexists(k) {
      return strings.has(k) || sets.has(k) ? 1 : 0;
    },
  };
}

const perTestState = new Map(); // test name -> in-memory mock
let currentTest = null;
const currentMock = () => perTestState.get(currentTest) || (perTestState.set(currentTest, createFresh()), perTestState.get(currentTest));

// Mock the kv.js module ONCE for the whole file. Methods dispatch to
// the per-test state at call time.
const kvModuleUrl = new URL('../api/_lib/kv.js', import.meta.url).href;
mock.module(kvModuleUrl, {
  namedExports: {
    getKv: () => currentMock(),
    kget: (k) => currentMock().kget(k),
    kset: (k, v) => currentMock().kset(k, v),
    kdel: (k) => currentMock().kdel(k),
    ksmembers: (k) => currentMock().ksmembers(k),
    ksadd: (k, ...m) => currentMock().ksadd(k, ...m),
    ksrem: (k, ...m) => currentMock().ksrem(k, ...m),
    kexists: (k) => currentMock().kexists(k),
  },
});

beforeEach((t) => {
  currentTest = t.name;
  perTestState.set(currentTest, createFresh());
  delete process.env.MONGODB_URI;
  process.env.REDIS_URL = 'redis://mock:6379';
});

// Re-import store fresh per test (env-driven backend detection + module cache).
async function freshStore() {
  const url = new URL('../api/_lib/store.js', import.meta.url).href + '?t=' + Date.now() + Math.random();
  return import(url);
}

test('KV: createParticipant stores and indexes by name', async () => {
  const store = await freshStore();
  const p = await store.createParticipant({ name: 'Marta', predictions: [] });
  assert.ok(p.id);
  assert.equal(p.name, 'Marta');

  const all = await store.listParticipants();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Marta');
});

test('KV: duplicate name is rejected with 409', async () => {
  const store = await freshStore();
  await store.createParticipant({ name: 'Lucas', predictions: [] });
  await assert.rejects(
    () => store.createParticipant({ name: 'lucas', predictions: [] }),
    (e) => e.status === 409
  );
});

test('KV: updateParticipant changes predictions and renames', async () => {
  const store = await freshStore();
  const p = await store.createParticipant({
    name: 'Ana',
    predictions: [{ matchId: 'QF1', home: 1, away: 0 }],
  });
  const renamed = await store.updateParticipant(p.id, { name: 'Ana Maria' });
  assert.equal(renamed.name, 'Ana Maria');
  const otherP = await store.createParticipant({ name: 'Ana', predictions: [] });
  assert.ok(otherP.id);
  assert.notEqual(otherP.id, p.id);
});

test('KV: deleteParticipant removes from index and name lookup', async () => {
  const store = await freshStore();
  const p = await store.createParticipant({ name: 'Pepe', predictions: [] });
  await store.deleteParticipant(p.id);
  const all = await store.listParticipants();
  assert.equal(all.length, 0);
  const recreated = await store.createParticipant({ name: 'Pepe', predictions: [] });
  assert.ok(recreated.id);
});

test('KV: upsertResult stores and listResults returns all matches', async () => {
  const store = await freshStore();
  const r = await store.upsertResult('QF1', { home: 2, away: 1, finished: true });
  assert.equal(r.home, 2);
  assert.equal(r.finished, true);

  const all = await store.listResults();
  assert.equal(all.length, 7);
  const qf1 = all.find(x => x.matchId === 'QF1');
  assert.equal(qf1.home, 2);
});

test('KV: resetAll clears participants and reseeds results', async () => {
  const store = await freshStore();
  await store.createParticipant({ name: 'Test', predictions: [] });
  await store.upsertResult('QF1', { home: 3, away: 0, finished: true });
  await store.resetAll();

  const all = await store.listParticipants();
  assert.equal(all.length, 0);
  const results = await store.listResults();
  assert.equal(results.length, 7);
  assert.equal(results.every(r => !r.finished && r.home === null), true);
});