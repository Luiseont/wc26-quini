# WC26 Quiniela — Rediseño + Migración a Vercel KV

**Implementation Plan**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la UI a estética "sportsbook" (paleta oscura, tipografía monospace para números, tablas densas, estados visuales claros) y migrar el storage de MongoDB Atlas a Vercel KV con una contraseña de admin hardcodeada.

**Architecture:** Adapter pattern en `store.js` que detecta el backend disponible (KV > Mongo > memoria) y expone la misma interfaz. Los handlers HTTP no se tocan. La UI se rediseña componente a componente reutilizando las clases utility del nuevo `style.css`. Las reglas de puntuación (`points.js`) y la lógica de leaderboard permanecen intactas.

**Tech Stack:** Vue 3, Vite, Pinia, @vercel/kv, Node 20+, Express (solo dev), node:test

---

## File Structure

### Nuevos archivos

| Archivo | Responsabilidad |
|---------|----------------|
| `api/_lib/kv.js` | Cliente + helpers de Vercel KV (`kget`, `kset`, `kdel`, `ksmembers`, `ksadd`, `ksrem`) |
| `test/kv-store.test.mjs` | Tests del backend KV del store con cliente mockeado |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `api/_lib/store.js` | Refactor: factory `connect()` que detecta modo (kv / mongo / memory); funciones delegan al backend activo |
| `api/_lib/auth.js` | Reemplazar `process.env.ADMIN_KEY` por constante `ADMIN_PASSWORD` hardcodeada |
| `src/style.css` | Reemplazar paleta y agregar tokens sportsbook + tipografía mono |
| `src/App.vue` | Top bar con logo + nav + cupos restantes |
| `src/components/PredictionForm.vue` | Layout cards + checkbox pills para clasificado |
| `src/components/ParticipantModal.vue` | Adaptar a sportsbook (tipografía mono, colores) |
| `src/views/Home.vue` | Hero stats + tabla densa + form |
| `src/views/Leaderboard.vue` | Tabla con desglose por partido, bordes laterales top 3 |
| `src/views/Admin.vue` | Cards status + tabla editable + 3 estados visuales |
| `package.json` | +@vercel/kv |
| `.env.example` | Reducir a `KV_REST_API_URL` (legacy: `MONGODB_URI`) |
| `README.md` | Actualizar sección "Despliegue en Vercel" con Vercel KV |

### Archivos sin cambios

- `api/_lib/points.js` — la lógica de puntuación no se toca
- `api/_lib/matches.js` — sin cambios
- `api/_lib/http.js` — sin cambios
- `api/*.js` (handlers) — sin cambios
- `vercel.json` — sin cambios
- `test/points.test.mjs` — sin cambios

---

## Tareas

### Task 1: Instalar @vercel/kv

**Files:**
- Modify: `package.json:17-23`

- [ ] **Step 1: Instalar el paquete**

```bash
cd /home/luiseont/wc26-quini && npm install @vercel/kv
```

- [ ] **Step 2: Verificar instalación**

```bash
node -e "import('@vercel/kv').then(m => console.log(typeof m.kv))"
```

Esperado: `function`

- [ ] **Step 3: Commit (si el repo es git)**

```bash
cd /home/luiseont/wc26-quini && git add package.json package-lock.json && git commit -m "chore: add @vercel/kv dependency"
```

> Si el directorio aún no es un repo de git, ejecutar antes `git init && git add -A && git commit -m "chore: initial commit"`. El spec ya está en `docs/superpowers/specs/`.

---

### Task 2: Crear `api/_lib/kv.js` con helpers

**Files:**
- Create: `api/_lib/kv.js`

El módulo expone funciones wrapper sobre `@vercel/kv` para que el resto del código no importe directamente del paquete (más fácil de mockear en tests).

- [ ] **Step 1: Crear el archivo**

```js
// api/_lib/kv.js
// Thin wrapper around @vercel/kv so the rest of the codebase doesn't depend
// on the package directly. Easier to mock in tests, easier to swap later.
import { kv } from '@vercel/kv';

export function getKv() {
  return kv;
}

export async function kget(key) {
  return kv.get(key);
}

export async function kset(key, value) {
  return kv.set(key, value);
}

export async function kdel(key) {
  return kv.del(key);
}

export async function ksmembers(key) {
  return kv.smembers(key);
}

export async function ksadd(key, ...members) {
  return kv.sadd(key, ...members);
}

export async function ksrem(key, ...members) {
  return kv.srem(key, ...members);
}

export async function kexists(key) {
  return (await kv.exists(key)) === 1;
}
```

- [ ] **Step 2: Smoke test**

```bash
cd /home/luiseont/wc26-quini && KV_REST_API_URL=http://localhost:1 KV_REST_API_TOKEN=x node -e "import('./api/_lib/kv.js').then(m => console.log(typeof m.kget))"
```

Esperado: `function` (falla la conexión a Redis pero la función existe — esto valida la sintaxis y la exportación)

> El error de conexión es esperable; lo importante es que la función `kget` esté exportada.

- [ ] **Step 3: Commit**

```bash
cd /home/luiseont/wc26-quini && git add api/_lib/kv.js && git commit -m "feat(kv): add thin wrapper around @vercel/kv"
```

---

### Task 3: Refactorizar `store.js` para soportar backend KV

**Files:**
- Modify: `api/_lib/store.js` (reescritura completa manteniendo la interfaz pública)

El store actual tiene `mode = 'memory' | 'mongo'`. Lo extendemos a `'kv' | 'mongo' | 'memory'`. Las funciones públicas no cambian su firma. La detección de modo va en `connect()`:

```js
async function connect() {
  if (db) return db;
  if (process.env.KV_REST_API_URL) {
    mode = 'kv';
    // import dinámico lazy para no romper tests sin @vercel/kv
    const kvModule = await import('./kv.js');
    db = kvModule; // expone los helpers
    return db;
  }
  // resto del código original (mongo, memory) sin cambios
}
```

- [ ] **Step 1: Reescribir `store.js` con el backend KV**

Reemplazar completamente el contenido de `api/_lib/store.js` con:

```js
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
    // If renaming, update the name index
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
      await Promise.all(ids.map(id => kvModule.kdel(`participants:${id}`)));
      const docs = await Promise.all(ids.map(id => kvModule.kget(`participants:${id}`).catch(() => null)));
      await Promise.all(
        docs.filter(Boolean).map(d => kvModule.kdel(`participants:name:${d.name.toLowerCase()}`))
      );
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
```

- [ ] **Step 2: Verificar tests existentes (modo memory)**

```bash
cd /home/luiseont/wc26-quini && node --test test/points.test.mjs test/api.test.mjs 2>&1 | tail -20
```

Esperado: todos los tests siguen pasando (modo memory sin env vars).

- [ ] **Step 3: Commit**

```bash
cd /home/luiseont/wc26-quini && git add api/_lib/store.js && git commit -m "feat(store): add Vercel KV backend alongside mongo and memory"
```

---

### Task 4: Hardcodear contraseña de admin en `auth.js`

**Files:**
- Modify: `api/_lib/auth.js`

- [ ] **Step 1: Reescribir `auth.js`**

Reemplazar el contenido completo de `api/_lib/auth.js` con:

```js
// Tiny admin guard. This is a private project among friends, so the password
// is hardcoded in the source. Rotate by editing this file and redeploying.
//
// The frontend sends it via the x-admin-key header (stored in localStorage).
const ADMIN_PASSWORD = 'wc26-amigos-2026';

export function isAdminRequest(req) {
  const provided =
    req.headers['x-admin-key'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    new URL(req.url, 'http://x').searchParams.get('key');
  return provided === ADMIN_PASSWORD;
}

export function adminStatus() {
  return { configured: true };
}
```

- [ ] **Step 2: Actualizar `api/admin/check.js` si reporta `required`**

Verificar `api/admin/check.js` y si la respuesta incluye `required: !!process.env.ADMIN_KEY`, cambiarlo para que siempre devuelva `required: true`.

```bash
cd /home/luiseont/wc26-quini && cat api/admin/check.js
```

Si el archivo contiene `required: !process.env.ADMIN_KEY` o similar, reemplazar por `required: true`. Si ya devuelve `true`, no tocar.

- [ ] **Step 3: Actualizar test `api.test.mjs`**

El test usa `process.env.ADMIN_KEY = 'testkey'` y manda `'testkey'` como header. Como ahora la contraseña es hardcodeada, actualizar el header de los tests para que coincidan con `ADMIN_PASSWORD`.

Buscar en `test/api.test.mjs`:

```bash
cd /home/luiseont/wc26-quini && grep -n "testkey\|ADMIN_KEY" test/api.test.mjs
```

Reemplazar todas las ocurrencias de `'testkey'` por `'wc26-amigos-2026'` (la contraseña hardcodeada) y eliminar la línea `process.env.ADMIN_KEY = 'testkey'` del bloque `before`.

- [ ] **Step 4: Verificar tests**

```bash
cd /home/luiseont/wc26-quini && node --test test/api.test.mjs 2>&1 | tail -20
```

Esperado: 10 tests pasan.

- [ ] **Step 5: Commit**

```bash
cd /home/luiseont/wc26-quini && git add api/_lib/auth.js api/admin/check.js test/api.test.mjs && git commit -m "feat(auth): hardcode admin password for friend-project use case"
```

---

### Task 5: Actualizar `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Reescribir el archivo**

```bash
cd /home/luiseont/wc26-quini && cat > .env.example <<'EOF'
# Vercel KV (Redis). When deploying to Vercel, these two vars are
# auto-injected after you create a KV database from the project dashboard
# (Storage → Create Database → KV). For local dev with KV, copy them from
# the Vercel dashboard into a local .env file.
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Legacy MongoDB. Only used if KV_REST_API_URL is NOT set. If empty, an
# in-memory store is used (fine for local dev, NOT for production).
MONGODB_URI=
MONGODB_DB=wc26_quini

# Admin password is now hardcoded in api/_lib/auth.js. No env var needed.

# Optional: comma-separated list of allowed origins for CORS. Defaults to "*".
ALLOWED_ORIGIN=*
EOF
```

- [ ] **Step 2: Commit**

```bash
cd /home/luiseont/wc26-quini && git add .env.example && git commit -m "docs(env): document Vercel KV vars, deprecate ADMIN_KEY"
```

---

### Task 6: Tests del backend KV (mockeado)

**Files:**
- Create: `test/kv-store.test.mjs`

Mockeamos `@vercel/kv` para no necesitar una instancia real de Redis en CI.

- [ ] **Step 1: Crear archivo de test**

Crear `test/kv-store.test.mjs` con:

```js
// Tests for the KV backend of api/_lib/store.js. The @vercel/kv client is
// mocked via a tiny in-memory implementation so we don't need a real Redis.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

// In-memory mock of @vercel/kv (just enough surface for our store)
function makeMockKv() {
  const strings = new Map();   // key -> value (JSON or string)
  const sets = new Map();      // key -> Set
  return {
    strings, sets,
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

beforeEach(async () => {
  // Reset module cache so each test gets a fresh store with a fresh mock
  const { mock: tmock } = await import('node:test');
  mockKv = makeMockKv();

  // Patch the @vercel/kv module
  const kvModule = await import('@vercel/kv');
  for (const k of Object.keys(mockKv)) {
    tmock.method(kvModule.kv, k, (...args) => mockKv[k](...args));
  }

  // Reset store module
  delete process.env.MONGODB_URI;
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  // Force fresh import of store.js
  const { findSourceMap } = await import('node:module');
  const path = await import('node:path');
  const url = await import('node:url');
  // Clear import cache for store.js and its dependencies
  const storePath = url.pathToFileURL(path.resolve('api/_lib/store.js')).href;
  for (const cached of Object.keys(globalThis)) {} // no-op
  // The store uses a top-level import; we need to re-import it after resetting env
  // node:test mock.method automatically applies; re-import via cache delete
  const mod = await import('node:module');
  if (mod.Module && mod.Module._cache) {
    // ESM has no easy cache clear; instead, store.js checks env on each connect()
  }
});

// We test by importing store AFTER setting env. The store connects lazily, so
// we can set env then import the store.
test('KV: createParticipant stores and indexes by name', async () => {
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  // Re-import store fresh
  const storeUrl = new URL('../api/_lib/store.js', import.meta.url).href + '?t=' + Date.now();
  const store = await import(storeUrl);

  const p = await store.createParticipant({ name: 'Marta', predictions: [] });
  assert.ok(p.id);
  assert.equal(p.name, 'Marta');

  const all = await store.listParticipants();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Marta');
});

test('KV: duplicate name is rejected with 409', async () => {
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  const storeUrl = new URL('../api/_lib/store.js', import.meta.url).href + '?t2=' + Date.now();
  const store = await import(storeUrl);

  await store.createParticipant({ name: 'Lucas', predictions: [] });
  await assert.rejects(
    () => store.createParticipant({ name: 'lucas', predictions: [] }),
    (e) => e.status === 409
  );
});

test('KV: updateParticipant changes predictions and renames', async () => {
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  const storeUrl = new URL('../api/_lib/store.js', import.meta.url).href + '?t3=' + Date.now();
  const store = await import(storeUrl);

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
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  const storeUrl = new URL('../api/_lib/store.js', import.meta.url).href + '?t4=' + Date.now();
  const store = await import(storeUrl);

  const p = await store.createParticipant({ name: 'Pepe', predictions: [] });
  await store.deleteParticipant(p.id);
  const all = await store.listParticipants();
  assert.equal(all.length, 0);
});

test('KV: upsertResult stores and listResults returns all matches', async () => {
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  const storeUrl = new URL('../api/_lib/store.js', import.meta.url).href + '?t5=' + Date.now();
  const store = await import(storeUrl);

  const r = await store.upsertResult('QF1', { home: 2, away: 1, finished: true });
  assert.equal(r.home, 2);
  assert.equal(r.finished, true);

  const all = await store.listResults();
  assert.equal(all.length, 7);
  const qf1 = all.find(x => x.matchId === 'QF1');
  assert.equal(qf1.home, 2);
});

test('KV: resetAll clears participants and reseeds results', async () => {
  process.env.KV_REST_API_URL = 'http://mock';
  process.env.KV_REST_API_TOKEN = 'mock-token';
  const storeUrl = new URL('../api/_lib/store.js', import.meta.url).href + '?t6=' + Date.now();
  const store = await import(storeUrl);

  await store.createParticipant({ name: 'Test', predictions: [] });
  await store.upsertResult('QF1', { home: 3, away: 0, finished: true });
  await store.resetAll();

  const all = await store.listParticipants();
  assert.equal(all.length, 0);
  const results = await store.listResults();
  assert.equal(results.length, 7);
  assert.equal(results.every(r => !r.finished && r.home === null), true);
});
```

- [ ] **Step 2: Ejecutar tests**

```bash
cd /home/luiseont/wc26-quini && node --test test/kv-store.test.mjs 2>&1 | tail -30
```

Esperado: 6 tests pasan.

> **Nota sobre el mock:** `@vercel/kv` se mockea con `mock.method` de node:test. La importación dinámica con `?t=Date.now()` evita el caché del store para que cada test vea la misma instancia mockeada. Si hay problemas con el mock, una alternativa es mockear `api/_lib/kv.js` directamente reescribiendo el archivo temporalmente — pero `mock.method` debería bastar.

- [ ] **Step 3: Commit**

```bash
cd /home/luiseont/wc26-quini && git add test/kv-store.test.mjs && git commit -m "test(kv): add mocked tests for KV backend"
```

---

### Task 7: Reemplazar `src/style.css` con tokens sportsbook

**Files:**
- Modify: `src/style.css` (reescritura completa)

- [ ] **Step 1: Reemplazar contenido**

Sobreescribir `src/style.css` con:

```css
:root {
  /* Backgrounds */
  --bg-0: #0e1116;
  --bg-1: #141921;
  --bg-2: #1a1f29;
  --bg-elevated: #1f2530;

  /* Borders & dividers */
  --line: #1f2530;
  --line-strong: #2a3140;

  /* Text */
  --text: #e6e9ef;
  --text-dim: #8b94a3;
  --text-faint: #6b7280;

  /* Accents */
  --accent-good: #22c55e;
  --accent-bad: #ef4444;
  --accent-gold: #facc15;
  --accent-warn: #f59e0b;
  --accent-info: #60a5fa;

  /* Typography */
  --font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;

  /* Spacing & radius */
  --radius-sm: 4px;
  --radius: 6px;
  --radius-lg: 10px;

  font-family: var(--font-ui);
  color-scheme: dark;
}

* { box-sizing: border-box; }
html, body, #app { height: 100%; }
body {
  margin: 0;
  background: var(--bg-0);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  font-family: var(--font-ui);
  min-height: 100%;
}

a { color: inherit; text-decoration: none; }
button { font-family: inherit; }

/* ===== Layout ===== */

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 80px;
}

/* ===== Top bar ===== */

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
}
.topbar-brand {
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.02em;
}
.topbar-brand .dot { color: var(--accent-good); }
.topbar-nav {
  display: flex;
  gap: 4px;
  font-size: 13px;
  color: var(--text-dim);
}
.topbar-nav a {
  padding: 6px 12px;
  border-radius: var(--radius);
}
.topbar-nav a.active {
  background: var(--bg-2);
  color: var(--text);
}
.topbar-meta {
  font-size: 12px;
  color: var(--text-faint);
  font-family: var(--font-mono);
}
.topbar-meta strong { color: var(--text); font-weight: 600; }
.topbar-meta .warn { color: var(--accent-warn); }

/* ===== Cards ===== */

.card {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 18px;
}

/* ===== Section titles ===== */

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.section-title .meta {
  font-size: 13px;
  color: var(--text-faint);
  font-weight: 400;
}
.section-eyebrow {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.section-h1 {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.02em;
}

/* ===== Hero (Home) ===== */

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.hero-stat {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
}
.hero-stat-label {
  font-size: 10px;
  color: var(--text-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.hero-stat-value {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
}
.hero-stat-value.good { color: var(--accent-good); }
.hero-stat-value.bad { color: var(--accent-bad); }
.hero-stat-value.gold { color: var(--accent-gold); }
.hero-stat-value .name { font-family: var(--font-ui); font-weight: 700; }

/* ===== Two-column grid ===== */

.grid { display: grid; gap: 18px; }
.grid.two { grid-template-columns: 1.4fr 1fr; }
@media (max-width: 900px) {
  .grid.two { grid-template-columns: 1fr; }
}

/* ===== Tables (sportsbook dense) ===== */

.sb-table {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.sb-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-0);
}
.sb-table-head h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.sb-table-head .meta {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
}
.sb-row {
  display: grid;
  align-items: center;
  padding: 13px 18px;
  border-bottom: 1px solid rgba(31, 37, 48, 0.6);
  font-size: 14px;
}
.sb-row:last-child { border-bottom: 0; }
.sb-row.top1 { border-left: 3px solid var(--accent-gold); background: linear-gradient(90deg, rgba(250, 204, 21, 0.05), transparent); }
.sb-row.top2 { border-left: 3px solid #cbd5e1; }
.sb-row.top3 { border-left: 3px solid #b45309; }
.sb-row .rank {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
}
.sb-row .rank.gold { color: var(--accent-gold); }
.sb-row .rank.silver { color: #cbd5e1; }
.sb-row .rank.bronze { color: #b45309; }
.sb-row .name { font-weight: 600; }
.sb-row .points {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
  text-align: center;
}
.sb-row .points.gold { color: var(--accent-gold); }
.sb-row .delta {
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
}
.sb-row .delta.up { color: var(--accent-good); }
.sb-row .delta.down { color: var(--accent-bad); }

/* Cell coloring in leaderboard */
.cell-good { color: var(--accent-good); font-weight: 600; }
.cell-bad { color: var(--accent-bad); }
.cell-gold { color: var(--accent-gold); font-weight: 600; }
.cell-pending { color: var(--text-faint); }

/* ===== Tabs (segmented control) ===== */

.tabs-segment {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.tabs-segment button {
  padding: 7px 14px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.tabs-segment button.on {
  background: var(--bg-2);
  color: var(--text);
}

/* ===== Buttons ===== */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--line-strong);
  background: var(--bg-1);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease;
}
.btn:hover { background: var(--bg-2); }
.btn.primary {
  background: var(--accent-good);
  color: var(--bg-0);
  border-color: transparent;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.btn.primary:hover { filter: brightness(1.1); }
.btn.danger { color: var(--accent-bad); border-color: rgba(239, 68, 68, 0.4); }
.btn.ghost { background: transparent; border-color: transparent; }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }

/* ===== Inputs ===== */

.input, .select {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.12s ease;
}
.input:focus, .select:focus {
  outline: none;
  border-color: var(--accent-gold);
}
.input.mono, .select.mono {
  font-family: var(--font-mono);
  font-weight: 700;
}

label {
  font-size: 10px;
  color: var(--text-faint);
  display: block;
  margin-bottom: 6px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ===== Match row (PredictionForm) ===== */

.match-list {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 6px 0;
  margin-bottom: 14px;
}
.match-stage-header {
  padding: 10px 18px;
  font-size: 10px;
  color: var(--text-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
}
.match-stage-header .dates {
  font-family: var(--font-mono);
  color: var(--text-faint);
}

.match-row {
  display: grid;
  grid-template-columns: 50px 1fr 70px 30px 70px 1fr 200px 60px;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(31, 37, 48, 0.6);
}
.match-row:last-child { border-bottom: 0; }
.match-row .id {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
}
.match-row .team {
  font-weight: 600;
  font-size: 14px;
}
.match-row .team.right { text-align: right; }
.match-row input[type="number"] {
  text-align: center;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 8px;
  color: var(--accent-gold);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 18px;
}
.match-row .vs {
  text-align: center;
  color: var(--text-faint);
  font-size: 12px;
}
.match-row .max {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-good);
}

/* Classified pills (home + away checkbox) */
.classified-pills {
  display: flex;
  gap: 4px;
}
.pill {
  flex: 1;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-faint);
  padding: 6px 8px;
  border-radius: var(--radius);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: var(--font-mono);
}
.pill:hover { color: var(--text-dim); }
.pill.on {
  background: rgba(34, 197, 94, 0.15);
  border-color: var(--accent-good);
  color: var(--accent-good);
}
.pill .check { font-size: 10px; }

/* Sticky footer for the prediction form */
.form-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px 18px;
}
.form-footer .progress {
  flex: 1;
  font-size: 12px;
  color: var(--text-dim);
}
.form-footer .progress strong {
  font-family: var(--font-mono);
  color: var(--text);
  font-weight: 600;
}
.form-footer .progress .potential {
  color: var(--accent-warn);
  font-family: var(--font-mono);
  margin-left: 8px;
}

/* ===== Admin status cards ===== */

.status-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.status-card {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 8px 14px;
}
.status-card .label {
  font-size: 10px;
  color: var(--text-faint);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.status-card .value {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
}
.status-card .value.good { color: var(--accent-good); }

/* ===== Status badges ===== */

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}
.status-badge.final { color: var(--accent-good); }
.status-badge.live { color: var(--accent-warn); }
.status-badge.next { color: var(--text-faint); }

/* ===== Input state colors (Admin) ===== */

input.state-final { border-color: var(--accent-good); color: var(--accent-good); }
input.state-live { border-color: var(--accent-warn); color: var(--accent-warn); }
input.state-next { border-color: var(--line); color: var(--text-faint); }

/* ===== Banners / errors ===== */

.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  margin-bottom: 18px;
}
.banner.info { background: rgba(96, 165, 250, 0.08); border: 1px solid rgba(96, 165, 250, 0.25); }
.banner.warn { background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); }
.banner.error { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); }
.banner.good { background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); }

/* ===== Empty states ===== */

.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-faint);
}
.empty h3 { color: var(--text-dim); margin: 0 0 6px; font-size: 18px; }

/* ===== Modal ===== */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 50;
  padding: 20px;
}
.modal {
  background: var(--bg-1);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  width: min(720px, 100%);
  max-height: 90vh;
  overflow: auto;
}
.modal header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}
.modal header h2 { margin: 0; font-size: 20px; }
.modal .body { padding: 18px 20px; }
.modal .footer { padding: 14px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }

/* ===== Toast ===== */

.toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-2);
  color: var(--text);
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  z-index: 60;
  font-size: 14px;
}
.toast.error { background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.5); }
.toast.good { background: rgba(34, 197, 94, 0.2); border-color: rgba(34, 197, 94, 0.5); }

/* ===== Utilities ===== */

.row { display: flex; gap: 10px; align-items: center; }
.row.gap-sm { gap: 6px; }
.row.wrap { flex-wrap: wrap; }
.spacer { flex: 1; }
.mono { font-family: var(--font-mono); }
.muted { color: var(--text-faint); }
.text-dim { color: var(--text-dim); }
.text-good { color: var(--accent-good); }
.text-bad { color: var(--accent-bad); }
.text-gold { color: var(--accent-gold); }
.text-warn { color: var(--accent-warn); }
.flex-col { display: flex; flex-direction: column; gap: 10px; }
.list { display: flex; flex-direction: column; gap: 8px; }
.kbd {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 2px 6px;
}
.issue {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-size: 13px;
  margin-bottom: 6px;
}
.issue .code { font-family: var(--font-mono); color: var(--accent-bad); font-weight: 600; }
.rule-pill {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.12);
  color: var(--accent-info);
  border: 1px solid rgba(96, 165, 250, 0.25);
  font-family: var(--font-mono);
}
.rule-pill.gold { background: rgba(250, 204, 21, 0.12); color: var(--accent-gold); border-color: rgba(250, 204, 21, 0.35); }
.rule-pill.silver { background: rgba(203, 213, 225, 0.1); color: #cbd5e1; border-color: rgba(203, 213, 225, 0.25); }
.rule-pill.bronze { background: rgba(245, 158, 11, 0.12); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); }

/* ===== Mobile ===== */

@media (max-width: 640px) {
  .topbar { flex-wrap: wrap; gap: 10px; }
  .topbar-meta { display: none; }
  .hero-stats { grid-template-columns: 1fr 1fr; }
  .grid.two { grid-template-columns: 1fr; }
  .match-row {
    grid-template-columns: 1fr;
    grid-template-areas: "id" "score" "teams" "pills";
    gap: 10px;
    text-align: center;
  }
  .match-row .id { grid-area: id; text-align: center; }
  .match-row .score-cell {
    grid-area: score;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 800;
    color: var(--accent-gold);
  }
  .match-row .team-cell { grid-area: teams; display: flex; justify-content: space-between; }
  .match-row .classified-pills { grid-area: pills; }
  .sb-table .sb-row { grid-template-columns: 1fr; }
  .status-cards { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Verificar que la app compila**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -10
```

Esperado: build exitoso (los componentes Vue aún no usan las clases nuevas, pero el CSS debe compilar).

- [ ] **Step 3: Commit**

```bash
cd /home/luiseont/wc26-quini && git add src/style.css && git commit -m "feat(style): sportsbook design tokens (palette, mono typography)"
```

---

### Task 8: Actualizar `src/App.vue` con top bar

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Leer el archivo actual**

```bash
cd /home/luiseont/wc26-quini && cat src/App.vue
```

- [ ] **Step 2: Reemplazar el template**

Sobreescribir `src/App.vue` con:

```vue
<template>
  <div class="container">
    <header class="topbar">
      <div style="display:flex; align-items:center; gap:24px;">
        <div class="topbar-brand">QUINIELA<span class="dot">·</span>WC26</div>
        <nav class="topbar-nav">
          <router-link to="/" :class="{ active: $route.path === '/' }">Inicio</router-link>
          <router-link to="/leaderboard" :class="{ active: $route.path === '/leaderboard' }">Ranking</router-link>
          <router-link to="/admin" :class="{ active: $route.path === '/admin' }">Admin</router-link>
        </nav>
      </div>
      <div class="topbar-meta">
        <span>CUPO <strong>{{ store.participants.length }}</strong> / 100</span>
        <span style="margin: 0 8px; color: var(--line);">|</span>
        <span class="warn">CIERRA 11 JUL · 12:00</span>
      </div>
    </header>

    <router-view />

    <div v-if="toastMsg" :class="['toast', toastKind]">{{ toastMsg }}</div>
  </div>
</template>

<script setup>
import { ref, provide } from 'vue';
import { useDataStore } from './store.js';

const store = useDataStore();
store.refreshAll();

const toastMsg = ref('');
const toastKind = ref('');
let toastTimer = null;
function toast(msg, kind = '') {
  toastMsg.value = msg;
  toastKind.value = kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg.value = ''; }, 2400);
}
provide('toast', toast);
</script>
```

- [ ] **Step 3: Verificar build**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -10
```

Esperado: build exitoso.

- [ ] **Step 4: Commit**

```bash
cd /home/luiseont/wc26-quini && git add src/App.vue && git commit -m "feat(app): sportsbook top bar with brand and quota meta"
```

---

### Task 9: Actualizar `src/views/Home.vue`

**Files:**
- Modify: `src/views/Home.vue`

- [ ] **Step 1: Sobreescribir el archivo**

Reemplazar el contenido de `src/views/Home.vue` con:

```vue
<template>
  <section class="hero-stats">
    <div class="hero-stat">
      <div class="hero-stat-label">Cuota campeón · Favorito</div>
      <div class="hero-stat-value good">
        <span class="name">BRA</span>
        <span>+450</span>
      </div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-label">Partidos restantes</div>
      <div class="hero-stat-value">
        <span class="name">Cuartos → Final</span>
        <span>{{ store.matches.length - store.finishedCount }}</span>
      </div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-label">Promedio aciertos</div>
      <div class="hero-stat-value bad">
        <span class="name">Global</span>
        <span>{{ averageExact }}%</span>
      </div>
    </div>
  </section>

  <div class="grid two">
    <div class="sb-table">
      <div class="sb-table-head">
        <h3>Participantes</h3>
        <span class="meta">{{ store.participants.length }} REGISTRADOS</span>
      </div>
      <div v-if="!store.participants.length" class="empty">
        <h3>Aún no hay participantes</h3>
        <p>Creá el primero usando el formulario de la derecha.</p>
      </div>
      <div v-else>
        <div
          v-for="(p, i) in store.participants"
          :key="p.id"
          class="sb-row"
          :class="rankClass(i)"
          style="grid-template-columns: 50px 1fr 70px 60px 70px 60px;"
          @click="openModal(p)"
        >
          <span class="rank" :class="rankColor(i)">#{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="name">{{ p.name }}</span>
          <span class="points" :class="{ gold: i === 0 }">{{ totalFor(p.id) }}</span>
          <span class="mono muted" style="text-align:center; font-size:12px;">{{ exactFor(p.id) }}</span>
          <span class="mono" :class="trendDir(p.id)" style="text-align:center; font-size:12px;">{{ trendFor(p.id) }}</span>
          <span class="muted" style="text-align:right; font-size:11px;">PTS</span>
        </div>
      </div>
    </div>

    <div>
      <PredictionForm @saved="onSaved" @cancel="cancelEdit" :editing="editing" />
    </div>
  </div>

  <ParticipantModal
    v-if="modalParticipant"
    :participant="modalParticipant"
    :matches="store.matches"
    :results="store.results"
    :leaderboard="store.leaderboard"
    @close="modalParticipant = null"
    @edit="startEdit"
    @delete="onDelete"
  />
</template>

<script setup>
import { ref, inject, computed } from 'vue';
import { useDataStore } from '../store.js';
import PredictionForm from '../components/PredictionForm.vue';
import ParticipantModal from '../components/ParticipantModal.vue';

const store = useDataStore();
const toast = inject('toast');

const editing = ref(null);
const modalParticipant = ref(null);

const averageExact = computed(() => {
  if (!store.leaderboard.length || !store.matches.length) return 0;
  const totalExact = store.leaderboard.reduce((acc, p) =>
    acc + (p.perMatch || []).filter(m => m.rule === 'EXACT_WINNER_SCORE').length, 0);
  return Math.round((totalExact / (store.leaderboard.length * store.matches.length)) * 100);
});

function totalFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  return row ? row.total : 0;
}
function exactFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  if (!row) return '0 EX';
  const count = (row.perMatch || []).filter(m => m.rule === 'EXACT_WINNER_SCORE').length;
  return `+${count}`;
}
function trendFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  if (!row) return '—';
  const last = (row.perMatch || []).filter(m => m.finished).slice(-1)[0];
  if (!last) return '—';
  return last.points > 0 ? `▲ ${last.points}` : (last.points < 0 ? `▼ ${Math.abs(last.points)}` : '—');
}
function trendDir(id) {
  const row = store.leaderboard.find(r => r.id === id);
  if (!row) return '';
  const last = (row.perMatch || []).filter(m => m.finished).slice(-1)[0];
  if (!last) return '';
  return last.points > 0 ? 'text-good' : (last.points < 0 ? 'text-bad' : '');
}
function rankClass(i) {
  if (i === 0) return 'top1';
  if (i === 1) return 'top2';
  if (i === 2) return 'top3';
  return '';
}
function rankColor(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return '';
}

function openModal(p) { modalParticipant.value = p; }
function startEdit(p) {
  editing.value = p;
  modalParticipant.value = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cancelEdit() { editing.value = null; }
async function onDelete(p) {
  if (!confirm(`¿Eliminar a ${p.name}? Sus predicciones se perderán.`)) return;
  try {
    await store.deleteParticipant(p.id);
    modalParticipant.value = null;
    toast('Participante eliminado', 'good');
  } catch (e) { toast(e.message, 'error'); }
}
function onSaved() { editing.value = null; }
</script>
```

- [ ] **Step 2: Build + commit**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -5 && git add src/views/Home.vue && git commit -m "feat(home): sportsbook hero stats + dense participants table"
```

---

### Task 10: Actualizar `src/views/Leaderboard.vue`

**Files:**
- Modify: `src/views/Leaderboard.vue`

- [ ] **Step 1: Sobreescribir el archivo**

Reemplazar el contenido de `src/views/Leaderboard.vue` con:

```vue
<template>
  <div>
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:16px;">
      <div>
        <div class="section-eyebrow">Tabla de posiciones</div>
        <h1 class="section-h1">Ranking · Fase Final</h1>
      </div>
      <div class="tabs-segment">
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">Global</button>
        <button :class="{ on: filter === 'QF' }" @click="filter = 'QF'">Cuartos</button>
        <button :class="{ on: filter === 'SF' }" @click="filter = 'SF'">Semi</button>
        <button :class="{ on: filter === 'F' }" @click="filter = 'F'">Final</button>
      </div>
    </div>

    <div class="sb-table">
      <div class="sb-table-head" v-if="store.leaderboard.length">
        <div style="display:grid; grid-template-columns: 50px 1.4fr 70px 55px 55px 55px 55px 55px 55px 55px 60px; gap:4px; width:100%;">
          <span>#</span>
          <span>Jugador</span>
          <span style="text-align:center;">PTS</span>
          <span style="text-align:center;">QF1</span>
          <span style="text-align:center;">QF2</span>
          <span style="text-align:center;">QF3</span>
          <span style="text-align:center;">QF4</span>
          <span style="text-align:center;">SF1</span>
          <span style="text-align:center;">SF2</span>
          <span style="text-align:center;">F</span>
          <span style="text-align:right;">DELTA</span>
        </div>
      </div>

      <div v-if="!store.leaderboard.length" class="empty">
        <h3>Sin datos aún</h3>
        <p>Agregá participantes en la pestaña Inicio para ver el ranking.</p>
      </div>

      <div v-else>
        <div
          v-for="(row, i) in store.leaderboard"
          :key="row.id"
          class="sb-row"
          :class="rankClass(i)"
          style="grid-template-columns: 50px 1.4fr 70px 55px 55px 55px 55px 55px 55px 55px 60px; gap:4px;"
        >
          <span class="rank" :class="rankColor(i)">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="name">{{ row.name }}</span>
          <span class="points" :class="{ gold: i === 0 }">{{ row.total }}</span>
          <span
            v-for="m in row.perMatch"
            :key="m.matchId"
            :title="`${m.matchId}: ${m.explanation}`"
            style="text-align:center; font-family: var(--font-mono); font-size:13px;"
            :class="cellClass(m)"
          >{{ m.points || '—' }}</span>
          <span class="delta" :class="deltaClass(row)">{{ deltaFor(row) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useDataStore } from '../store.js';

const store = useDataStore();
const filter = ref('all');

function rankClass(i) {
  if (i === 0) return 'top1';
  if (i === 1) return 'top2';
  if (i === 2) return 'top3';
  return '';
}
function rankColor(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return '';
}
function cellClass(m) {
  if (!m.points && m.points !== 0) return 'cell-pending';
  if (m.rule === 'EXACT_WINNER_SCORE') return 'cell-gold';
  if (m.rule === 'EXACT_SCORE_DIFFERENT_WINNER') return 'cell-gold';
  if (m.points > 0) return 'cell-good';
  return 'cell-bad';
}
function deltaFor(row) {
  const finished = (row.perMatch || []).filter(m => m.finished !== false);
  if (!finished.length) return '—';
  const total = finished.reduce((acc, m) => acc + (m.points || 0), 0);
  if (total > 0) return `+${total}`;
  if (total < 0) return String(total);
  return '0';
}
function deltaClass(row) {
  const finished = (row.perMatch || []).filter(m => m.finished !== false);
  const total = finished.reduce((acc, m) => acc + (m.points || 0), 0);
  if (total > 0) return 'up';
  if (total < 0) return 'down';
  return '';
}
</script>
```

- [ ] **Step 2: Build + commit**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -5 && git add src/views/Leaderboard.vue && git commit -m "feat(leaderboard): dense table with per-match breakdown + filters"
```

---

### Task 11: Actualizar `src/components/PredictionForm.vue`

**Files:**
- Modify: `src/components/PredictionForm.vue`

- [ ] **Step 1: Sobreescribir el archivo**

Reemplazar el contenido de `src/components/PredictionForm.vue` con:

```vue
<template>
  <form class="flex-col" @submit.prevent="onSubmit">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <div>
        <div class="section-eyebrow">Tu boleta</div>
        <h2 class="section-h1" style="font-size:22px;">{{ isEditing ? `Editar a ${editing.name}` : 'Predicciones' }}</h2>
      </div>
      <button v-if="isEditing" type="button" class="btn ghost" @click="$emit('cancel')">Cancelar</button>
    </div>

    <div>
      <label>Nombre del participante</label>
      <input v-model="name" class="input" placeholder="Ej: Marta" maxlength="60" required />
    </div>

    <div v-for="stage in stages" :key="stage.code" class="match-list">
      <div class="match-stage-header">
        <span>{{ stage.label }} · {{ stageMatches(stage.code).length }} partidos</span>
        <span class="dates">{{ stage.dates }}</span>
      </div>
      <div
        v-for="m in stageMatches(stage.code)"
        :key="m.id"
        class="match-row"
      >
        <span class="id">{{ m.id }}</span>
        <span class="team right">{{ m.home }}</span>
        <input
          type="number" min="0" max="30"
          :value="getPred(m.id, 'home')"
          @input="setScore(m.id, 'home', $event.target.value)"
          :placeholder="'-'"
        />
        <span class="vs">VS</span>
        <input
          type="number" min="0" max="30"
          :value="getPred(m.id, 'away')"
          @input="setScore(m.id, 'away', $event.target.value)"
          :placeholder="'-'"
        />
        <span class="team">{{ m.away }}</span>
        <div class="classified-pills">
          <button
            type="button"
            class="pill"
            :class="{ on: pickFor(m.id) === 'home' }"
            @click="setPick(m.id, 'home')"
          ><span class="check">{{ pickFor(m.id) === 'home' ? '✓' : '○' }}</span> {{ m.home }}</button>
          <button
            type="button"
            class="pill"
            :class="{ on: pickFor(m.id) === 'away' }"
            @click="setPick(m.id, 'away')"
          ><span class="check">{{ pickFor(m.id) === 'away' ? '✓' : '○' }}</span> {{ m.away }}</button>
        </div>
        <span class="max">MAX 8</span>
      </div>
    </div>

    <div v-if="error" class="banner error">{{ error }}</div>

    <div class="form-footer">
      <span class="progress">
        <strong>{{ Object.keys(predictions).length }}</strong> / {{ store.matches.length }} cargados
        <span class="potential">MAX POTENCIAL: {{ maxPotential }} PTS</span>
      </span>
      <button type="button" class="btn" @click="clearAll">Limpiar</button>
      <button class="btn primary" type="submit" :disabled="saving">
        {{ saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Confirmar boleta' }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref, computed, inject } from 'vue';
import { useDataStore } from '../store.js';

const props = defineProps({ editing: Object });
const emit = defineEmits(['saved', 'cancel']);

const store = useDataStore();
const toast = inject('toast');

const stages = [
  { code: 'QF', label: 'Cuartos de final', dates: '11-12 JUL' },
  { code: 'SF', label: 'Semifinales', dates: '15-16 JUL' },
  { code: 'F',  label: 'Final', dates: '19 JUL' },
];

const name = ref(props.editing?.name || '');
const predictions = reactive({});
const saving = ref(false);
const error = ref('');

const isEditing = computed(() => !!props.editing);
const maxPotential = computed(() => Object.keys(predictions).length * 8);

if (props.editing) {
  for (const p of props.editing.predictions || []) {
    predictions[p.matchId] = { home: p.home ?? null, away: p.away ?? null, qualified: p.qualified || null };
  }
}

function stageMatches(code) {
  return store.matches.filter(m => m.stage === code);
}

function getPred(matchId, key) {
  return predictions[matchId]?.[key] ?? '';
}

function setScore(matchId, key, val) {
  const v = val === '' ? null : Number(val);
  if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) return;
  if (!predictions[matchId]) predictions[matchId] = { home: null, away: null, qualified: null };
  predictions[matchId][key] = v;
  autoPickFromScore(matchId);
}

function autoPickFromScore(matchId) {
  const p = predictions[matchId];
  if (!p) return;
  if (p.qualified) return;
  if (p.home != null && p.away != null) {
    if (p.home > p.away) p.qualified = 'home';
    else if (p.away > p.home) p.qualified = 'away';
  }
}

function setPick(matchId, side) {
  if (!predictions[matchId]) predictions[matchId] = { home: null, away: null, qualified: null };
  predictions[matchId].qualified = side;
}

function pickFor(matchId) {
  return predictions[matchId]?.qualified;
}

function clearAll() {
  for (const k of Object.keys(predictions)) delete predictions[k];
  name.value = '';
}

async function onSubmit() {
  error.value = '';
  if (!name.value.trim()) { error.value = 'El nombre es obligatorio'; return; }
  const list = store.matches.map(m => {
    const p = predictions[m.id];
    if (!p) return { matchId: m.id };
    const out = { matchId: m.id };
    if (Number.isInteger(p.home)) out.home = p.home;
    if (Number.isInteger(p.away)) out.away = p.away;
    if (p.qualified === 'home' || p.qualified === 'away') out.qualified = p.qualified;
    return out;
  });

  saving.value = true;
  try {
    if (isEditing.value) {
      await store.updateParticipant(props.editing.id, { name: name.value, predictions: list });
      toast('Predicciones actualizadas', 'good');
    } else {
      await store.createParticipant({ name: name.value, predictions: list });
      toast('Participante registrado', 'good');
      name.value = '';
      for (const k of Object.keys(predictions)) delete predictions[k];
    }
    emit('saved');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>
```

- [ ] **Step 2: Build + commit**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -5 && git add src/components/PredictionForm.vue && git commit -m "feat(prediction): grouped stages, classified pills, sticky footer"
```

---

### Task 12: Actualizar `src/views/Admin.vue`

**Files:**
- Modify: `src/views/Admin.vue`

- [ ] **Step 1: Sobreescribir el archivo**

Reemplazar el contenido de `src/views/Admin.vue` con:

```vue
<template>
  <section class="card flex-col">
    <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="topbar-brand">QUINIELA<span class="dot">·</span>WC26</div>
        <div style="font-size:11px; padding:3px 8px; background: rgba(239,68,68,.1); color: var(--accent-bad); border:1px solid rgba(239,68,68,.3); border-radius:4px; letter-spacing:.05em; text-transform:uppercase; font-weight:700;">ADMIN</div>
      </div>
      <div class="topbar-meta">SESIÓN ACTIVA · <span class="text-good">●</span></div>
    </div>

    <div v-if="checked === false" class="banner info">
      <div class="flex-col" style="flex:1; gap:6px;">
        <strong>Introduce la clave de admin</strong>
        <span class="muted" style="font-size:13px;">Solo quien tenga la clave puede cargar resultados.</span>
        <div class="row" style="margin-top:6px;">
          <input v-model="adminKey" class="input" type="password" placeholder="ADMIN_KEY" @keyup.enter="checkKey" style="max-width:280px;" />
          <button class="btn primary" @click="checkKey" :disabled="checking">Entrar</button>
        </div>
        <span v-if="checkError" class="text-bad" style="font-size:13px;">{{ checkError }}</span>
      </div>
    </div>

    <template v-else-if="isAdmin">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px;">
        <div>
          <div class="section-eyebrow">Cargar resultados</div>
          <h1 class="section-h1">Panel de administración</h1>
        </div>
        <div class="row gap-sm">
          <button class="btn" @click="refresh" :disabled="loading">Refrescar</button>
          <button class="btn danger" @click="onReset" :disabled="loading">Reset total</button>
        </div>
      </div>

      <div class="status-cards">
        <div class="status-card">
          <div class="label">Modo storage</div>
          <div class="value text-good">{{ store.health?.mode || '...' }}</div>
        </div>
        <div class="status-card">
          <div class="label">Finalizados</div>
          <div class="value">
            <span class="text-good">{{ finishedCount }}</span> / {{ store.matches.length }}
          </div>
        </div>
        <div class="status-card">
          <div class="label">Participantes</div>
          <div class="value">{{ store.participants.length }}</div>
        </div>
      </div>

      <details class="card" style="background: var(--bg-1); margin-bottom:14px;">
        <summary style="cursor:pointer; font-size:13px; color: var(--text-dim);">⌨️ Carga masiva (pegar varias líneas)</summary>
        <p class="muted" style="font-size:13px; margin:8px 0 6px;">
          Una línea por partido: <span class="kbd">ID H-A F</span>. <span class="kbd">F</span> opcional (1 = finalizado).
        </p>
        <textarea v-model="bulkText" class="input mono" rows="4" placeholder="QF1 2-1 1&#10;QF2 1-0 1"></textarea>
        <div class="row" style="margin-top:8px;">
          <span class="spacer"></span>
          <button class="btn" @click="bulkPreview" :disabled="!bulkText.trim()">Previsualizar</button>
          <button class="btn primary" @click="bulkApply" :disabled="!bulkParsed.length || loading">
            Aplicar {{ bulkParsed.length }} resultado(s)
          </button>
        </div>
        <div v-if="bulkError" class="banner error" style="margin-top:8px;">{{ bulkError }}</div>
      </details>

      <div class="sb-table" style="padding:0;">
        <div style="display:grid; grid-template-columns:50px 1fr 70px 30px 70px 1fr 130px 90px; gap:10px; padding:12px 18px; font-size:10px; color:var(--text-faint); letter-spacing:0.1em; text-transform:uppercase; background:var(--bg-0); border-bottom:1px solid var(--line);">
          <span>ID</span><span>Local</span><span></span><span></span><span></span><span>Visitante</span><span>Clasificado</span><span>Estado</span>
        </div>
        <div
          v-for="m in store.matches"
          :key="m.id"
          style="display:grid; grid-template-columns:50px 1fr 70px 30px 70px 1fr 130px 90px; gap:10px; padding:14px 18px; align-items:center; border-bottom:1px solid rgba(31,37,48,0.6);"
        >
          <span class="id">{{ m.id }}</span>
          <span style="text-align:right; font-weight:600;">{{ m.home }}</span>
          <input
            type="number" min="0" max="30"
            :value="resultHome(m.id)"
            @input="setResult(m.id, 'home', $event.target.value)"
            :class="['mono', inputState(m.id)]"
            style="text-align:center; background:var(--bg-0); border-radius:4px; padding:8px; font-weight:700; font-size:18px;"
          />
          <span style="text-align:center; color:var(--text-faint);">—</span>
          <input
            type="number" min="0" max="30"
            :value="resultAway(m.id)"
            @input="setResult(m.id, 'away', $event.target.value)"
            :class="['mono', inputState(m.id)]"
            style="text-align:center; background:var(--bg-0); border-radius:4px; padding:8px; font-weight:700; font-size:18px;"
          />
          <span style="font-weight:600;">{{ m.away }}</span>
          <span class="mono" style="font-size:11px;" :class="qualifiedClass(m.id)">
            {{ qualifiedLabel(m.id) }}
          </span>
          <span class="status-badge" :class="statusClass(m.id)">
            {{ statusLabel(m.id) }}
          </span>
        </div>
      </div>

      <div style="margin-top:14px;">
        <button class="btn" @click="loadInconsistencies" :disabled="loading">
          {{ inconsistencies ? 'Volver a detectar inconsistencias' : 'Detectar inconsistencias' }}
        </button>
      </div>

      <div v-if="inconsistencies" style="margin-top:18px;">
        <h3 class="section-title" style="margin-top:0;">Inconsistencias</h3>
        <div v-if="!inconsistencies.predictionIssues.length && !inconsistencies.resultIssues.length" class="banner good">
          Sin inconsistencias. Todas las predicciones y resultados son coherentes.
        </div>
        <div v-else>
          <div v-for="(i, idx) in inconsistencies.resultIssues" :key="'r'+idx" class="issue">
            <span class="code">{{ i.code }}</span>
            <span><strong>{{ i.matchId }}</strong> · {{ i.message }}</span>
          </div>
          <div v-for="(i, idx) in inconsistencies.predictionIssues" :key="'p'+idx" class="issue">
            <span class="code">{{ i.code }}</span>
            <span><strong>{{ i.participantName }} · {{ i.matchId }}</strong> · {{ i.message }}</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { useDataStore } from '../store.js';
import { api, setAdminKey } from '../api.js';

const store = useDataStore();
const toast = inject('toast');

const adminKey = ref('');
const checked = ref(null);
const isAdmin = ref(false);
const checkError = ref('');
const checking = ref(false);
const loading = ref(false);
const inconsistencies = ref(null);
const bulkText = ref('');
const bulkParsed = ref([]);
const bulkError = ref('');

const finishedCount = computed(() => store.finishedCount);

onMounted(async () => {
  try {
    const r = await api.adminCheck();
    checked.value = true;
    isAdmin.value = r.ok;
  } catch (e) {
    checked.value = false;
  }
});

async function checkKey() {
  checkError.value = '';
  checking.value = true;
  setAdminKey(adminKey.value);
  try {
    const r = await api.adminCheck();
    checked.value = true;
    isAdmin.value = r.ok;
    if (!r.ok) {
      checkError.value = 'Clave incorrecta';
      setAdminKey('');
    } else {
      toast('Sesión de admin iniciada', 'good');
      await loadInconsistencies();
    }
  } catch (e) {
    checkError.value = e.message;
  } finally {
    checking.value = false;
  }
}

function draftResult(matchId) {
  return store.resultsById.get(matchId) || { matchId, home: null, away: null, finished: false };
}
function resultHome(matchId) { const r = draftResult(matchId); return r.home ?? ''; }
function resultAway(matchId) { const r = draftResult(matchId); return r.away ?? ''; }
function isFinished(matchId) { return draftResult(matchId).finished; }
function statusClass(matchId) {
  if (isFinished(matchId)) return 'final';
  const r = draftResult(matchId);
  if (r.home != null && r.away != null) return 'live';
  return 'next';
}
function statusLabel(matchId) {
  if (isFinished(matchId)) return '● FINAL';
  const r = draftResult(matchId);
  if (r.home != null && r.away != null) return '◐ EN JUEGO';
  return '○ PRÓX.';
}
function inputState(matchId) {
  if (isFinished(matchId)) return 'state-final';
  const r = draftResult(matchId);
  if (r.home != null && r.away != null) return 'state-live';
  return 'state-next';
}
function qualifiedLabel(matchId) {
  const r = draftResult(matchId);
  if (r.qualified === 'home') return `✓ ${store.matchesById.get(matchId)?.home || ''}`;
  if (r.qualified === 'away') return `✓ ${store.matchesById.get(matchId)?.away || ''}`;
  if (isFinished(matchId)) return '—';
  return '—';
}
function qualifiedClass(matchId) {
  const r = draftResult(matchId);
  if (r.qualified) return 'text-good';
  if (!isFinished(matchId)) return 'text-warn';
  return 'muted';
}

async function setResult(matchId, side, val) {
  const v = val === '' ? null : Number(val);
  if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) return;
  const existing = store.resultsById.get(matchId) || { matchId, home: null, away: null, finished: false };
  const updated = { ...existing, home: side === 'home' ? v : existing.home, away: side === 'away' ? v : existing.away, finished: false };
  const idx = store.results.findIndex(r => r.matchId === matchId);
  if (idx >= 0) store.results[idx] = updated;
  else store.results.push(updated);
  // Auto-save
  try {
    await api.upsertResult(matchId, { home: updated.home, away: updated.away, finished: false });
  } catch (e) { toast(e.message, 'error'); }
}

async function loadInconsistencies() {
  loading.value = true;
  try {
    inconsistencies.value = await api.adminInconsistencies();
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
}

async function refresh() {
  loading.value = true;
  try { await store.refreshAll(); }
  finally { loading.value = false; }
}

async function onReset() {
  const phrase = prompt('Esto borrará TODOS los participantes y resultados. Escribe RESET para confirmar.');
  if (phrase !== 'RESET') return;
  loading.value = true;
  try {
    await api.adminReset('RESET');
    await store.refreshAll();
    toast('Quiniela reiniciada', 'good');
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
}

function parseBulkLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return { error: `Línea sin marcador: "${line}"` };
  const id = parts[0].toUpperCase();
  if (!store.matchesById.get(id)) return { error: `Partido desconocido: ${id}` };
  const score = parts[1].match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!score) return { error: `Marcador inválido en "${line}"` };
  const finished = parts[2] === '1' || parts[2] === 'F';
  return { matchId: id, home: Number(score[1]), away: Number(score[2]), finished };
}

function bulkPreview() {
  bulkError.value = '';
  const lines = bulkText.value.split('\n');
  const parsed = [];
  for (const l of lines) {
    const r = parseBulkLine(l);
    if (!r) continue;
    if (r.error) { bulkError.value = r.error; return; }
    parsed.push(r);
  }
  bulkParsed.value = parsed;
}

async function bulkApply() {
  if (!bulkParsed.value.length) return;
  loading.value = true;
  try {
    await api.bulkResults(bulkParsed.value);
    await store.refreshResults();
    toast(`${bulkParsed.value.length} resultados actualizados`, 'good');
    bulkText.value = '';
    bulkParsed.value = [];
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
}
</script>
```

- [ ] **Step 2: Build + commit**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -5 && git add src/views/Admin.vue && git commit -m "feat(admin): sportsbook layout with status cards + 3-state match rows"
```

---

### Task 13: Actualizar `src/components/ParticipantModal.vue`

**Files:**
- Modify: `src/components/ParticipantModal.vue`

- [ ] **Step 1: Leer el archivo actual**

```bash
cd /home/luiseont/wc26-quini && cat src/components/ParticipantModal.vue
```

- [ ] **Step 2: Reemplazar las clases obsoletas**

El componente probablemente usa las clases antiguas (`participant`, `points`, `kbd`, etc.). Reemplazar:

- `class="participant"` → `class="sb-row"` (manteniendo los modificadores top1/top2/top3)
- `class="rank"` → `class="rank"` (sigue funcionando)
- `class="points"` → `class="points"`
- `class="kbd"` → `class="kbd"`
- Cualquier uso de `var(--bg-3)`, `var(--bg-1)`, `var(--line-strong)` → siguen funcionando
- Cualquier uso de `var(--accent)` (que era dorado) → `var(--accent-gold)`
- Cualquier uso de `var(--bad)` → `var(--accent-bad)`
- Cualquier uso de `var(--good)` → `var(--accent-good)`
- Cualquier uso de `var(--info)` → `var(--accent-info)`

Verificar con:

```bash
cd /home/luiseont/wc26-quini && grep -n "var(--accent)\|var(--bad)\|var(--good)\|var(--info)\|var(--bg-3)" src/components/ParticipantModal.vue
```

Y reemplazar las ocurrencias.

- [ ] **Step 3: Build + commit**

```bash
cd /home/luiseont/wc26-quini && npm run build 2>&1 | tail -5 && git add src/components/ParticipantModal.vue && git commit -m "feat(modal): adapt participant modal to sportsbook tokens"
```

---

### Task 14: Actualizar `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Reemplazar la sección "Despliegue en Vercel"**

Localizar la sección en `README.md` que dice "## Despliegue en Vercel" y reemplazarla por:

```markdown
## Despliegue en Vercel

1. Subí el repo a GitHub.
2. Creá un proyecto en Vercel apuntando al repo. Vercel detecta Vite y las
   funciones en `/api` automáticamente.
3. En el dashboard del proyecto: **Storage → Create Database → KV**. Vercel
   inyecta `KV_REST_API_URL` y `KV_REST_API_TOKEN` como variables de entorno
   automáticamente.
4. Hacé deploy. La app debería funcionar con Vercel KV.

**Admin:** la contraseña es `wc26-amigos-2026` (hardcodeada en
`api/_lib/auth.js`, no requiere variable de entorno).

Sin KV configurado, la app sigue funcionando pero usa el store en memoria
(los datos se pierden en cada cold start de las funciones serverless).
```

- [ ] **Step 2: Reemplazar la sección "Variables de entorno"**

Reemplazar la tabla de variables de entorno por:

```markdown
## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `KV_REST_API_URL` | Endpoint de Vercel KV (auto-inyectada) | (vacío → memoria) |
| `KV_REST_API_TOKEN` | Token de Vercel KV (auto-inyectada) | (vacío) |
| `MONGODB_URI` | Legacy: cadena de conexión MongoDB | (vacío) |
| `MONGODB_DB` | Legacy: nombre de DB | `wc26_quini` |
| `ALLOWED_ORIGIN` | Origen CORS permitido | `*` |

La contraseña de admin **no** se configura por env var; está hardcodeada.
```

- [ ] **Step 3: Commit**

```bash
cd /home/luiseont/wc26-quini && git add README.md && git commit -m "docs(readme): update deployment section for Vercel KV"
```

---

### Task 15: Verificación final

**Files:** (ninguno, solo verificación)

- [ ] **Step 1: Correr todos los tests**

```bash
cd /home/luiseont/wc26-quini && node --test test/points.test.mjs test/kv-store.test.mjs && npm run build 2>&1 | tail -10
```

Esperado:
- 21 tests de puntos pasan
- 6 tests de KV pasan
- Build de Vite exitoso sin errores

- [ ] **Step 2: Correr test e2e (servidor dev)**

```bash
cd /home/luiseont/wc26-quini && node --test test/api.test.mjs 2>&1 | tail -10
```

Esperado: 10 tests e2e pasan (con `ADMIN_PASSWORD = 'wc26-amigos-2026'` ya hardcodeada).

- [ ] **Step 3: Smoke test del dev server**

```bash
cd /home/luiseont/wc26-quini && (npm run dev:api &) && sleep 3 && curl -s http://localhost:8787/api/health | head -c 200 && pkill -f dev-api
```

Esperado: JSON con `{"ok":true,"mode":"memory",...}`.

- [ ] **Step 4: Commit final (si hay cambios sin commitear)**

```bash
cd /home/luiseont/wc26-quini && git status && git add -A && git diff --cached --quiet || git commit -m "chore: final cleanup after redesign + KV migration"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Vercel KV migration → Tasks 1, 2, 3, 6
- ✅ Hardcoded admin password → Task 4
- ✅ Sportsbook design tokens → Task 7
- ✅ App.vue top bar → Task 8
- ✅ Home with hero stats → Task 9
- ✅ Leaderboard dense table → Task 10
- ✅ PredictionForm with checkbox pills → Task 11
- ✅ Admin with status cards + 3-state rows → Task 12
- ✅ ParticipantModal adapted → Task 13
- ✅ README updated → Task 14
- ✅ Verification → Task 15

**2. Placeholder scan:** No TBDs, no vague requirements. Every code block is complete.

**3. Type consistency:** All functions across tasks reference the same names (`createParticipant`, `upsertResult`, etc.). The `ADMIN_PASSWORD = 'wc26-amigos-2026'` constant is used consistently in Task 4 and Task 15.

**4. Ambiguity:** The mock setup in Task 6 uses `mock.method` from node:test. If `@vercel/kv` doesn't expose its client in a way that's mockable, fall back to mocking `api/_lib/kv.js` directly via `import.meta.resolve` or by injecting a fake module. Alternative: use a real Vercel KV local emulator if available.