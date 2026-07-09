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
