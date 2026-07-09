import { handler, sendJson } from './_lib/http.js';
import { resolveMatches } from './_lib/matches.js';
import { listResults } from './_lib/store.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const results = await listResults();
  return sendJson(res, 200, { matches: resolveMatches(results) });
});
