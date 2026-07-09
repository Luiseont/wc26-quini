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
