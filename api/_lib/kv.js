// TCP-based Redis client. Works with REDIS_URL (e.g.,
//   rediss://default:TOKEN@HOST:PORT:6379)
// which Vercel injects when you create a "Redis - Official Redis for
// Vercel" database. Values are JSON-encoded so objects round-trip cleanly.
//
// Serverless note: Vercel functions are short-lived. The client is created
// once on first call within a warm function instance and reused; on cold
// starts a new connection is established. We lazily reconnect on error.
import { createClient } from 'redis';

let client = null;
let connectPromise = null;

async function getClient() {
  if (client && client.isOpen) return client;
  if (!connectPromise) {
    const url = process.env.REDIS_URL || process.env.KV_REST_API_URL;
    if (!url) throw new Error('REDIS_URL no está definida');
    // rediss:// is TLS; redis:// is plaintext. node-redis handles both via URL.
    client = createClient({ url });
    client.on('error', (err) => {
      // Don't spam logs on every cold start error
      console.error('[kv] redis error:', err.message);
    });
    connectPromise = client.connect().catch((err) => {
      client = null;
      connectPromise = null;
      throw err;
    });
  }
  await connectPromise;
  return client;
}

// JSON encoding for arbitrary values; pass strings through verbatim so we
// don't double-encode things the store layer already serialized.
function serialize(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function deserialize(v) {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return v; }
}

export async function kget(key) {
  const c = await getClient();
  return deserialize(await c.get(key));
}

export async function kset(key, value) {
  const c = await getClient();
  await c.set(key, serialize(value));
  return 'OK';
}

export async function kdel(key) {
  const c = await getClient();
  return (await c.del(key)) > 0 ? 1 : 0;
}

export async function ksmembers(key) {
  const c = await getClient();
  return c.sMembers(key);
}

export async function ksadd(key, ...members) {
  const c = await getClient();
  return c.sAdd(key, members);
}

export async function ksrem(key, ...members) {
  const c = await getClient();
  return c.sRem(key, members);
}

export async function kexists(key) {
  const c = await getClient();
  return (await c.exists(key)) === 1;
}

// For tests / debugging: returns the underlying client (may be null).
export function getKv() {
  return client;
}