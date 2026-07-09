import { handler, sendJson } from './_lib/http.js';
import { listResults } from './_lib/store.js';
import { MATCHES } from './_lib/matches.js';

// List endpoint for all results. Lives at /api/all-results to avoid
// Vercel routing conflicts with the dynamic /api/results/[matchId].js.
export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const results = await listResults();
  return sendJson(res, 200, { results, matches: MATCHES });
});
