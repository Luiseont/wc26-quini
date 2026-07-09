import { handler, sendJson } from './_lib/http.js';
import { getStats } from './_lib/store.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const stats = await getStats();
  return sendJson(res, 200, { ok: true, ...stats, time: new Date().toISOString() });
});
