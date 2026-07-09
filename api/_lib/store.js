// Storage abstraction. Backends (in priority order):
//   1. Vercel KV  — when KV_REST_API_URL is set
//   2. MongoDB    — legacy, when MONGODB_URI is set
//   3. Memory     — fallback for local dev (data lost on restart)
//
// All backends expose the same public functions so the API handlers don't
// need to change.
import { MongoClient } from 'mongodb';
import { MATCHES } from './matches.js';

let mode = 'memory';
let db = null;        // Mongo db | KV helpers module | null (memory)
let memory = null;
let kvModule = null;

function seedMemory() {
  const now = new Date().toISOString();
  return {
    participants: [],
    results: MATCHES.map(m => ({ matchId: m.id, home: null, away: null, finished: false, updatedAt: now })),
    meta: { createdAt: now, updatedAt: now },
  };
}

async function connect() {
  if (db) return db;
  if (process.env.KV_REST_API_URL) {
    mode = 'kv';
    kvModule = await import('./kv.js');
    db = kvModule;
    return db;
  }
  const uri = process.env.MONGODB_URI;
  if (uri) {
    mode = 'mongo';
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'wc26_quini');
    await db.collection('participants').createIndex({ name: 1 }, { unique: true });
    await db.collection('results').createIndex({ matchId: 1 }, { unique: true });
    return db;
  }
  mode = 'memory';
  if (!memory) memory = seedMemory();
  db = null;
  return null;
}

function mem() {
  if (!memory) memory = seedMemory();
  return memory;
}

// ---- Participants ----

export async function listParticipants() {
  await connect();
  if (mode === 'kv') {
    const ids = await kvModule.ksmembers('participants:idx');
    if (!ids || ids.length === 0) return [];
    const docs = await Promise.all(ids.map(id => kvModule.kget(`participants:${id}`)));
    return docs.filter(Boolean).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  if (mode === 'mongo') {
    return db.collection('participants').find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
  }
  return mem().participants.map(({ _id, ...rest }) => rest);
}

export async function getParticipant(id) {
  await connect();
  if (mode === 'kv') {
    const doc = await kvModule.kget(`participants:${id}`);
    return doc || null;
  }
  if (mode === 'mongo') {
    return db.collection('participants').findOne({ id }, { projection: { _id: 0 } });
  }
  const p = mem().participants.find(p => p.id === id);
  if (!p) return null;
  const { _id, ...rest } = p;
  return rest;
}

export async function createParticipant({ name, predictions }) {
  await connect();
  const now = new Date().toISOString();
  const doc = {
    id: cryptoRandomId(),
    name: String(name || '').trim().slice(0, 60),
    predictions: normalizePredictions(predictions),
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.name) throw httpError(400, 'Nombre requerido');

  if (mode === 'kv') {
    const existingId = await kvModule.kget(`participants:name:${doc.name.toLowerCase()}`);
    if (existingId) throw httpError(409, 'Ya existe un participante con ese nombre');
    await kvModule.kset(`participants:${doc.id}`, doc);
    await kvModule.ksadd('participants:idx', doc.id);
    await kvModule.kset(`participants:name:${doc.name.toLowerCase()}`, doc.id);
    return doc;
  }
  if (mode === 'mongo') {
    try {
      await db.collection('participants').insertOne(doc);
    } catch (e) {
      if (e.code === 11000) throw httpError(409, 'Ya existe un participante con ese nombre');
      throw e;
    }
  } else {
    if (mem().participants.some(p => p.name.toLowerCase() === doc.name.toLowerCase())) {
      throw httpError(409, 'Ya existe un participante con ese nombre');
    }
    mem().participants.push(doc);
  }
  const { _id, ...out } = doc;
  return out;
}

export async function updateParticipant(id, patch) {
  await connect();
  const update = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim().slice(0, 60);
    if (!name) throw httpError(400, 'Nombre requerido');
    update.name = name;
  }
  if (patch.predictions !== undefined) {
    update.predictions = normalizePredictions(patch.predictions);
  }

  if (mode === 'kv') {
    const existing = await kvModule.kget(`participants:${id}`);
    if (!existing) throw httpError(404, 'Participante no encontrado');
    if (update.name && update.name !== existing.name) {
      const lower = update.name.toLowerCase();
      const dupId = await kvModule.kget(`participants:name:${lower}`);
      if (dupId && dupId !== id) throw httpError(409, 'Ya existe un participante con ese nombre');
      await kvModule.kdel(`participants:name:${existing.name.toLowerCase()}`);
      await kvModule.kset(`participants:name:${lower}`, id);
    }
    const merged = { ...existing, ...update };
    await kvModule.kset(`participants:${id}`, merged);
    return merged;
  }
  if (mode === 'mongo') {
    const r = await db.collection('participants').findOneAndUpdate(
      { id },
      { $set: update },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
    if (!r) throw httpError(404, 'Participante no encontrado');
    return r;
  }
  const p = mem().participants.find(p => p.id === id);
  if (!p) throw httpError(404, 'Participante no encontrado');
  Object.assign(p, update);
  const { _id, ...rest } = p;
  return rest;
}

export async function deleteParticipant(id) {
  await connect();
  if (mode === 'kv') {
    const existing = await kvModule.kget(`participants:${id}`);
    if (!existing) throw httpError(404, 'Participante no encontrado');
    await kvModule.kdel(`participants:${id}`);
    await kvModule.ksrem('participants:idx', id);
    await kvModule.kdel(`participants:name:${existing.name.toLowerCase()}`);
    return { ok: true };
  }
  if (mode === 'mongo') {
    const r = await db.collection('participants').deleteOne({ id });
    if (r.deletedCount === 0) throw httpError(404, 'Participante no encontrado');
    return { ok: true };
  }
  const idx = mem().participants.findIndex(p => p.id === id);
  if (idx < 0) throw httpError(404, 'Participante no encontrado');
  mem().participants.splice(idx, 1);
  return { ok: true };
}

// ---- Results ----

export async function listResults() {
  await connect();
  if (mode === 'kv') {
    const docs = await Promise.all(MATCHES.map(m => kvModule.kget(`results:${m.id}`)));
    return ensureAllMatches(docs.filter(Boolean));
  }
  if (mode === 'mongo') {
    const docs = await db.collection('results').find({}, { projection: { _id: 0 } }).toArray();
    return ensureAllMatches(docs);
  }
  return ensureAllMatches(mem().results);
}

export async function getResult(matchId) {
  await connect();
  if (mode === 'kv') {
    const doc = await kvModule.kget(`results:${matchId}`);
    return doc || defaultResult(matchId);
  }
  if (mode === 'mongo') {
    const doc = await db.collection('results').findOne({ matchId }, { projection: { _id: 0 } });
    return doc || defaultResult(matchId);
  }
  const r = mem().results.find(r => r.matchId === matchId);
  return r || defaultResult(matchId);
}

export async function upsertResult(matchId, patch) {
  await connect();
  if (!MATCHES.find(m => m.id === matchId)) throw httpError(404, 'Partido no existe');
  const doc = normalizeResult({ matchId, ...patch });
  if (mode === 'kv') {
    const existing = await kvModule.kget(`results:${matchId}`);
    const merged = { ...defaultResult(matchId), ...(existing || {}), ...doc, updatedAt: new Date().toISOString() };
    await kvModule.kset(`results:${matchId}`, merged);
    return merged;
  }
  if (mode === 'mongo') {
    await db.collection('results').updateOne(
      { matchId },
      { $set: { ...doc, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
  } else {
    const idx = mem().results.findIndex(r => r.matchId === matchId);
    if (idx >= 0) mem().results[idx] = { ...mem().results[idx], ...doc, updatedAt: new Date().toISOString() };
    else mem().results.push({ matchId, ...doc, updatedAt: new Date().toISOString() });
  }
  return getResult(matchId);
}

export async function resetAll() {
  await connect();
  if (mode === 'kv') {
    const ids = await kvModule.ksmembers('participants:idx');
    if (ids && ids.length) {
      const docs = await Promise.all(ids.map(id => kvModule.kget(`participants:${id}`).catch(() => null)));
      const validDocs = docs.filter(Boolean);
      await Promise.all(validDocs.map(d => kvModule.kdel(`participants:name:${d.name.toLowerCase()}`)));
      await Promise.all(ids.map(id => kvModule.kdel(`participants:${id}`)));
      await kvModule.kdel('participants:idx');
    }
    const now = new Date().toISOString();
    await Promise.all(
      MATCHES.map(m => kvModule.kset(`results:${m.id}`, { matchId: m.id, home: null, away: null, finished: false, updatedAt: now }))
    );
    return { ok: true };
  }
  if (mode === 'mongo') {
    await db.collection('participants').deleteMany({});
    const fresh = MATCHES.map(m => ({ matchId: m.id, home: null, away: null, finished: false, updatedAt: new Date().toISOString() }));
    for (const r of fresh) {
      await db.collection('results').updateOne({ matchId: r.matchId }, { $set: r }, { upsert: true });
    }
    return { ok: true };
  }
  mem().participants = [];
  mem().results = MATCHES.map(m => ({ matchId: m.id, home: null, away: null, finished: false, updatedAt: new Date().toISOString() }));
  return { ok: true };
}

export function getMode() {
  return mode;
}

export async function getStats() {
  await connect();
  const participants = await listParticipants();
  const results = await listResults();
  return {
    mode,
    participants: participants.length,
    resultsEntered: results.filter(r => r.finished).length,
    totalMatches: MATCHES.length,
  };
}

// ---- helpers ----
function cryptoRandomId() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
}

function defaultResult(matchId) {
  return { matchId, home: null, away: null, finished: false, updatedAt: null };
}

function ensureAllMatches(docs) {
  const map = new Map(docs.map(d => [d.matchId, d]));
  return MATCHES.map(m => map.get(m.id) || defaultResult(m.id));
}

function normalizePredictions(predictions) {
  if (!Array.isArray(predictions)) return [];
  const allowed = new Set(MATCHES.map(m => m.id));
  return predictions
    .filter(p => p && allowed.has(p.matchId))
    .map(p => {
      const out = { matchId: p.matchId };
      if (p.qualified === 'home' || p.qualified === 'away') out.qualified = p.qualified;
      if (Number.isInteger(p.home) && p.home >= 0 && p.home <= 30) out.home = p.home;
      if (Number.isInteger(p.away) && p.away >= 0 && p.away <= 30) out.away = p.away;
      return out;
    });
}

function normalizeResult(r) {
  const out = { finished: !!r.finished };
  if (Number.isInteger(r.home) && r.home >= 0 && r.home <= 30) out.home = r.home;
  else out.home = null;
  if (Number.isInteger(r.away) && r.away >= 0 && r.away <= 30) out.away = r.away;
  else out.away = null;
  if (r.qualified === 'home' || r.qualified === 'away') out.qualified = r.qualified;
  return out;
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
