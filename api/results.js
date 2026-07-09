import { handler, readJson, sendJson } from './_lib/http.js';
import { getResult, getParticipant, updateParticipant, deleteParticipant, listResults, upsertResult } from './_lib/store.js';
import { isAdminRequest } from './_lib/auth.js';
import { MATCHES } from './_lib/matches.js';

// Single file for all result-related operations. Vercel's serverless routing
// is unreliable with api/foo.js + api/foo/[id].js, so we keep ONE function
// and dispatch by URL parsing. The catch-all rewrite in vercel.json forwards
// /api/results/* to this function.
export default handler(async (req, res) => {
  // URL: /api/results or /api/results/<matchId>
  const path = (req.url || '').split('?')[0];
  const tail = path.replace(/^\/api\/results\/?/, '');
  const matchId = tail ? decodeURIComponent(tail) : null;

  // POST /api/results is the bulk-save endpoint (moved here for routing safety;
  // the bulk URL also lives at /api/bulk-results for backwards compat).
  if (req.method === 'POST' && !matchId) {
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

  if (req.method === 'GET' && !matchId) {
    const results = await listResults();
    return sendJson(res, 200, { results, matches: MATCHES });
  }

  if (matchId) {
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
  }

  return sendJson(res, 405, { error: 'Método no permitido' });
});
