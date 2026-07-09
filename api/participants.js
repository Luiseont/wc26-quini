import { handler, readJson, sendJson } from './_lib/http.js';
import { listParticipants, createParticipant } from './_lib/store.js';
import { MATCHES } from './_lib/matches.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') {
    const participants = await listParticipants();
    return sendJson(res, 200, { participants, matches: MATCHES });
  }
  if (req.method === 'POST') {
    const body = await readJson(req);
    const participant = await createParticipant(body);
    return sendJson(res, 201, { participant });
  }
  sendJson(res, 405, { error: 'Método no permitido' });
});
