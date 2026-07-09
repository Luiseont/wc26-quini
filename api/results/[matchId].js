import { handler, readJson, sendJson } from '../_lib/http.js';
import { getResult, upsertResult } from '../_lib/store.js';
import { isAdminRequest } from '../_lib/auth.js';

export default handler(async (req, res) => {
  // Diagnostic: log that this function was invoked
  console.log('[results/[matchId]] hit:', { method: req.method, url: req.url, query: req.query });
  const matchId = req.query?.matchId || (req.url || '').split('?')[0].split('/').pop();
  if (!matchId) return sendJson(res, 400, { error: 'matchId requerido' });

  if (req.method === 'GET') {
    const result = await getResult(matchId);
    return sendJson(res, 200, { result });
  }
  if (req.method === 'PUT' || req.method === 'PATCH') {
    if (!isAdminRequest(req)) return sendJson(res, 401, { error: 'Clave de admin requerida' });
    const body = await readJson(req);
    const result = await upsertResult(matchId, body);
    return sendJson(res, 200, { result });
  }
  sendJson(res, 405, { error: 'Método no permitido' });
});
