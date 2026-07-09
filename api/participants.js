import { handler, readJson, sendJson } from './_lib/http.js';
import { listParticipants, createParticipant, listResults } from './_lib/store.js';
import { MATCHES } from './_lib/matches.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const participants = await listParticipants();
    return sendJson(res, 200, { participants, matches: MATCHES });
  }
  if (req.method === 'POST') {
    const results = await listResults();
    const started = results.some(r => r.finished || Number.isInteger(r.home) || Number.isInteger(r.away));
    if (started) {
      return sendJson(res, 409, {
        error: 'No se pueden registrar nuevas boletas: ya hay resultados cargados. Las predicciones se cierran al iniciar el torneo.',
      });
    }
    const body = await readJson(req);
    const participant = await createParticipant(body);
    return sendJson(res, 201, { participant });
  }
  sendJson(res, 405, { error: 'Método no permitido' });
});
