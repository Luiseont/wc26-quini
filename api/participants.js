import { handler, readJson, sendJson } from './_lib/http.js';
import { listParticipants, createParticipant, getParticipant, updateParticipant, deleteParticipant, listResults } from './_lib/store.js';
import { isAdminRequest } from './_lib/auth.js';
import { MATCHES } from './_lib/matches.js';

// Single file for all participant operations. Vercel's serverless routing
// is unreliable with api/foo.js + api/foo/[id].js, so we keep ONE function
// and dispatch by URL parsing. The catch-all rewrite in vercel.json forwards
// /api/participants/* to this function.
export default handler(async (req, res) => {
  // URL: /api/participants or /api/participants/<id>
  const path = (req.url || '').split('?')[0];
  const tail = path.replace(/^\/api\/participants\/?/, '');
  const id = tail ? decodeURIComponent(tail) : null;

  if (req.method === 'GET' && !id) {
    const participants = await listParticipants();
    return sendJson(res, 200, { participants, matches: MATCHES });
  }

  if (req.method === 'POST' && !id) {
    const body = await readJson(req);
    const participant = await createParticipant(body);
    return sendJson(res, 201, { participant });
  }

  if (id) {
    if (req.method === 'GET') {
      const participant = await getParticipant(id);
      if (!participant) return sendJson(res, 404, { error: 'No encontrado' });
      return sendJson(res, 200, { participant });
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readJson(req);
      const participant = await updateParticipant(id, body);
      return sendJson(res, 200, { participant });
    }
    if (req.method === 'DELETE') {
      const existing = await getParticipant(id);
      if (!existing) return sendJson(res, 404, { error: 'Participante no encontrado' });
      const results = await listResults();
      const started = results.some(r => r.finished || Number.isInteger(r.home) || Number.isInteger(r.away));
      if (started) {
        return sendJson(res, 409, {
          error: 'No se puede eliminar el participante: ya hay resultados cargados.',
        });
      }
      await deleteParticipant(id);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 405, { error: 'Método no permitido' });
});
