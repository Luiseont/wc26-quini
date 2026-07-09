import { handler, sendJson } from '../_lib/http.js';
import { isAdminRequest, adminStatus } from '../_lib/auth.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const provided = req.headers['x-admin-key'] || new URL(req.url, 'http://x').searchParams.get('key');
  const expected = (process.env.ADMIN_KEY || '').trim();
  const ok = !expected || provided === expected;
  return sendJson(res, 200, { ok, ...adminStatus(), required: !!expected });
});
