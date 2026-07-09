import { handler, readJson, sendJson } from './_lib/http.js';
import { listResults, upsertResult } from './_lib/store.js';
import { isAdminRequest } from './_lib/auth.js';
import { MATCHES } from './_lib/matches.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const results = await listResults();
    return sendJson(res, 200, { results, matches: MATCHES });
  }
  if (req.method === 'POST') {
    // Admin-only bulk update. Body: { results: [{matchId, home, away, finished}] }
    if (!isAdminRequest(req)) return sendJson(res, 401, { error: 'Clave de admin requerida' });
    const body = await readJson(req);
    if (!Array.isArray(body.results)) return sendJson(res, 400, { error: 'results[] requerido' });
    const updated = [];
    for (const r of body.results) {
      if (!r.matchId) continue;
      updated.push(await upsertResult(r.matchId, r));
    }
    return sendJson(res, 200, { results: updated });
  }
  sendJson(res, 405, { error: 'Método no permitido' });
});
