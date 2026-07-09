import { handler, sendJson } from '../_lib/http.js';
import { isAdminRequest, adminStatus } from '../_lib/auth.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const ok = isAdminRequest(req);
  return sendJson(res, 200, { ok, ...adminStatus(), required: true });
});
