import { handler, sendJson } from './_lib/http.js';
import { listParticipants, listResults } from './_lib/store.js';
import { totalFor } from './_lib/points.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  const [participants, results] = await Promise.all([listParticipants(), listResults()]);
  const board = participants.map(p => {
    const { total, perMatch } = totalFor(p.predictions || [], results);
    return {
      id: p.id,
      name: p.name,
      total,
      perMatch: perMatch.map(m => ({ matchId: m.matchId, points: m.points, rule: m.rule, explanation: m.explanation })),
    };
  }).sort((a, b) => b.total - a.total);
  return sendJson(res, 200, { leaderboard: board, results });
});
