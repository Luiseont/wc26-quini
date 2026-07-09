import { handler, sendJson } from './_lib/http.js';
import { MATCHES } from './_lib/matches.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  return sendJson(res, 200, { matches: MATCHES });
});
