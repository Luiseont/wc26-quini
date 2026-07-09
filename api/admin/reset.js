import { handler, readJson, sendJson } from '../_lib/http.js';
import { isAdminRequest } from '../_lib/auth.js';
import { listParticipants, listResults, resetAll } from '../_lib/store.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
  if (!isAdminRequest(req)) return sendJson(res, 401, { error: 'Clave de admin requerida' });
  const body = await readJson(req).catch(() => ({}));
  if (!body.confirm || body.confirm !== 'RESET') {
    return sendJson(res, 400, { error: 'Confirmación inválida: envía { confirm: "RESET" }' });
  }
  await resetAll();
  const [participants, results] = await Promise.all([listParticipants(), listResults()]);
  return sendJson(res, 200, { ok: true, participants, results });
});
