// Frontend API client. Reads the admin key from localStorage and sends it via
// the x-admin-key header on protected calls.
const KEY_STORAGE = 'wc26.adminKey';

function getAdminKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

export function setAdminKey(v) {
  try {
    if (v) localStorage.setItem(KEY_STORAGE, v);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {}
}

async function request(path, { method = 'GET', body, admin = false, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) {
    const k = getAdminKey();
    if (k) headers['x-admin-key'] = k;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (isJson && data?.error) || res.statusText || 'Error';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  matches: () => request('/api/matches'),
  results: () => request('/api/results'),
  participants: () => request('/api/participants'),
  participant: (id) => request(`/api/participants/${encodeURIComponent(id)}`),
  createParticipant: (payload) => request('/api/participants', { method: 'POST', body: payload }),
  updateParticipant: (id, payload) => request(`/api/participants/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),
  deleteParticipant: (id) => request(`/api/participants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  upsertResult: (matchId, payload) => request(`/api/results/${encodeURIComponent(matchId)}`, { method: 'PUT', body: payload, admin: true }),
  bulkResults: (results) => request('/api/bulk-results', { method: 'POST', body: { results }, admin: true }),
  leaderboard: () => request('/api/leaderboard'),
  adminCheck: () => request('/api/admin/check', { admin: true }),
  adminInconsistencies: () => request('/api/admin/inconsistencies', { admin: true }),
  adminReset: (confirm) => request('/api/admin/reset', { method: 'POST', body: { confirm }, admin: true }),
};
