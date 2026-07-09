import { handler, readJson, sendJson } from './_lib/http.js';
import { listResults, upsertResult } from './_lib/store.js';
import { isAdminRequest } from './_lib/auth.js';
import { MATCHES } from './_lib/matches.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const results = await listResults();
    return sendJson(res, 200, { results, matches: MATCHES });
  }
  sendJson(res, 405, { error: 'Método no permitido' });
});
