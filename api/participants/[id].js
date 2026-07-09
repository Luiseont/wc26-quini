import { handler, readJson, sendJson } from '../_lib/http.js';
import { getParticipant, updateParticipant, deleteParticipant, listResults } from '../_lib/store.js';

export default handler(async (req, res) => {
  const id = req.query?.id || (req.url || '').split('?')[0].split('/').pop();
  return sendJson(res, 200, { ok: true, id });
  if (!id) return sendJson(res, 400, { error: 'id requerido' });

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
        error: 'No se puede eliminar el participante: ya hay resultados cargados. Las predicciones son inmutables una vez que inicia el torneo.',
      });
    }
    await deleteParticipant(id);
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 405, { error: 'Método no permitido' });
});
