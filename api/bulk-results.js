import { handler, readJson, sendJson } from './_lib/http.js';
import { upsertResult } from './_lib/store.js';
import { isAdminRequest } from './_lib/auth.js';

// Admin-only bulk update. Body: { results: [{matchId, home, away, finished}] }.
// Lives at a different path than /api/results to avoid Vercel routing
// conflicts with the dynamic /api/results/[matchId].js function.
export default handler(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
  if (!isAdminRequest(req)) return sendJson(res, 401, { error: 'Clave de admin requerida' });
  const body = await readJson(req);
  if (!Array.isArray(body.results)) return sendJson(res, 400, { error: 'results[] requerido' });
  const updated = [];
  for (const r of body.results) {
    if (!r.matchId) continue;
    updated.push(await upsertResult(r.matchId, r));
  }
  return sendJson(res, 200, { results: updated });
});
