import { handler, sendJson } from '../_lib/http.js';
import { isAdminRequest } from '../_lib/auth.js';
import { listParticipants, listResults } from '../_lib/store.js';
import { totalFor, collectInconsistencies, scorePrediction } from '../_lib/points.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  if (!isAdminRequest(req)) return sendJson(res, 401, { error: 'Clave de admin requerida' });

  const [participants, results] = await Promise.all([listParticipants(), listResults()]);
  const byId = new Map(results.map(r => [r.matchId, r]));

  // 1. Issues coming from individual predictions.
  const entries = participants.map(p => {
    const { total, perMatch } = totalFor(p.predictions || [], results);
    return { participantId: p.id, participantName: p.name, total, perMatch };
  });
  const predictionIssues = collectInconsistencies(entries);

  // 2. Issues coming from the results themselves (e.g. draw in a knockout).
  const resultIssues = [];
  for (const r of results) {
    if (!r.finished) continue;
    if (r.home === r.away) {
      resultIssues.push({
        code: 'RESULT_IS_DRAW',
        matchId: r.matchId,
        message: 'Resultado registrado como empate en una eliminatoria',
      });
    }
    if (r.home != null && r.home < 0) resultIssues.push({ code: 'NEGATIVE_SCORE', matchId: r.matchId, message: 'Goles negativos' });
  }

  // 3. Sanity: run the same scenario through all rules to make sure the
  //    ranking is internally consistent (no two rules fire on the same input).
  const ruleAudit = [];
  const sample = (winner, exact) => {
    const fakePred = { matchId: 'TEST', qualified: winner, home: 2, away: 1 };
    const fakeRes = { matchId: 'TEST', finished: true, home: exact ? 2 : 3, away: 1, qualified: 'home' };
    return scorePrediction(fakePred, fakeRes);
  };
  ruleAudit.push({ scenario: 'winner+exact', result: sample('home', true) });
  ruleAudit.push({ scenario: 'winner+partial-home', result: (() => {
    const fp = { matchId: 'T', qualified: 'home', home: 2, away: 1 };
    const fr = { matchId: 'T', finished: true, home: 2, away: 0, qualified: 'home' };
    return scorePrediction(fp, fr);
  })() });
  ruleAudit.push({ scenario: 'winner-only', result: (() => {
    const fp = { matchId: 'T', qualified: 'home', home: 2, away: 1 };
    const fr = { matchId: 'T', finished: true, home: 3, away: 0, qualified: 'home' };
    return scorePrediction(fp, fr);
  })() });
  ruleAudit.push({ scenario: 'exact-diff-winner', result: (() => {
    const fp = { matchId: 'T', qualified: 'home', home: 2, away: 1 };
    const fr = { matchId: 'T', finished: true, home: 0, away: 2, qualified: 'away' };
    return scorePrediction(fp, fr);
  })() });

  return sendJson(res, 200, {
    predictionIssues,
    resultIssues,
    ruleAudit,
    counts: {
      participants: participants.length,
      results: results.length,
      finished: results.filter(r => r.finished).length,
    },
  });
});
