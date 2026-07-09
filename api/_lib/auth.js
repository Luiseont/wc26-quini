// Tiny admin guard. No real auth, but we require a shared secret that the
// admin enters in the UI and is stored in localStorage.
export function isAdminRequest(req) {
  const expected = (process.env.ADMIN_KEY || 'changeme').trim();
  const provided =
    req.headers['x-admin-key'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    new URL(req.url, 'http://x').searchParams.get('key');
  if (!expected) return true; // dev mode with no key configured
  return provided === expected;
}

export function adminStatus() {
  return { configured: !!process.env.ADMIN_KEY };
}
