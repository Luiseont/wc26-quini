// Pure scoring logic. Given a prediction and an actual result, compute the
// points earned and flag any logical inconsistency. No I/O, no side effects.
//
// Rules (highest applicable wins, in order):
//   1. Winner correct + exact score         -> 8 pts
//   2. Winner correct + goals_for OR goals_against match (but not both) -> 7 pts
//   3. Winner correct                       -> 6 pts
//   4. Qualified team correct               -> 5 pts  (rare in a knockout, see below)
//   5. Exact score regardless of winner     -> 3 pts
//
// In a knockout match the team that wins IS the team that qualifies, so rules
// 3 and 4 are mutually exclusive: rule 3 always wins. Rule 4 only fires when
// the actual match is recorded with an explicit `qualified` field that differs
// from the score-derived winner (e.g. penalty shootout where the score is
// listed as 1-1 but the admin tagged one team as the qualifier). The audit
// reports any such cases.
//
// Rule 6 (added 2026-07): inverted score — predicted.home == actual.away
// and predicted.away == actual.home (e.g., you said A wins 3-0 but B
// actually wins 3-0). Worth 2 pts as a consolation when you read the match
// upside-down. Lower priority than all other rules.

export const RULE_POINTS = [8, 7, 6, 5, 3, 2];

export function determineWinner(home, away) {
  if (home == null || away == null) return null;
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

export function isValidScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 30;
}

function emptyBreakdown() {
  return {
    predictedWinner: null,
    actualWinner: null,
    predictedQualifier: null,
    actualQualifier: null,
    exactScore: false,
    partialScore: false,
    goalsHomeMatch: false,
    goalsAwayMatch: false,
  };
}

export function scorePrediction(prediction, result) {
  const issues = [];
  const breakdown = emptyBreakdown();

  const predScoreValid = isValidScore(prediction.home) && isValidScore(prediction.away);
  const resultScoreValid = isValidScore(result.home) && isValidScore(result.away);
  if (!predScoreValid) issues.push({ code: 'INVALID_PREDICTION_SCORE', message: 'Predicción con puntaje inválido' });
  if (result.finished && !resultScoreValid) issues.push({ code: 'INVALID_RESULT_SCORE', message: 'Resultado con puntaje inválido' });

  // Flag obvious prediction issues even before the result is loaded.
  if (predScoreValid && prediction.home === prediction.away) {
    issues.push({ code: 'PREDICTED_DRAW', message: `Predijiste empate (${prediction.home}-${prediction.away}) en una eliminatoria` });
  }

  if (!result.finished || !resultScoreValid || !predScoreValid) {
    return {
      matchId: prediction.matchId,
      points: 0,
      rule: null,
      explanation: !result.finished ? 'Partido no finalizado' : 'Predicción incompleta',
      issues,
      breakdown,
    };
  }

  const actualWinner = determineWinner(result.home, result.away);
  const actualQualifier = result.qualified === 'home' || result.qualified === 'away'
    ? result.qualified
    : (actualWinner === 'draw' ? null : actualWinner);

  const predictedWinner = determineWinner(prediction.home, prediction.away);
  const predictedQualifier = prediction.qualified === 'home' || prediction.qualified === 'away'
    ? prediction.qualified
    : (predictedWinner === 'draw' ? null : predictedWinner);

  breakdown.predictedWinner = predictedWinner;
  breakdown.actualWinner = actualWinner;
  breakdown.predictedQualifier = predictedQualifier;
  breakdown.actualQualifier = actualQualifier;

  if (actualWinner === 'draw') {
    issues.push({
      code: 'RESULT_IS_DRAW',
      message: 'El resultado es un empate; en eliminatorias alguien debe clasificar (define el clasificado)',
    });
  }
  if (actualWinner === 'draw' && !result.qualified) {
    return {
      matchId: prediction.matchId,
      points: 0,
      rule: null,
      explanation: 'Resultado sin clasificado definido',
      issues,
      breakdown,
    };
  }

  const exactScore = prediction.home === result.home && prediction.away === result.away;
  const goalsHomeMatch = prediction.home === result.home;
  const goalsAwayMatch = prediction.away === result.away;
  const partialScore = (goalsHomeMatch || goalsAwayMatch) && !exactScore;
  const scoreInverted = !exactScore && prediction.home === result.away && prediction.away === result.home;

  breakdown.exactScore = exactScore;
  breakdown.partialScore = partialScore;
  breakdown.goalsHomeMatch = goalsHomeMatch;
  breakdown.goalsAwayMatch = goalsAwayMatch;
  breakdown.scoreInverted = scoreInverted;

  const winnerCorrect = predictedWinner !== 'draw' && predictedWinner === actualWinner;
  const qualifierCorrect = predictedQualifier && actualQualifier && predictedQualifier === actualQualifier;

  // Compute which rules are satisfied to audit for inconsistencies.
  const ruleFires = {
    EXACT_WINNER_SCORE: winnerCorrect && exactScore,
    WINNER_PLUS_PARTIAL_SCORE: winnerCorrect && partialScore,
    WINNER_ONLY: winnerCorrect && !exactScore && !partialScore,
    QUALIFIED_TEAM: qualifierCorrect && !winnerCorrect,
    EXACT_SCORE_DIFFERENT_WINNER: exactScore && !winnerCorrect,
    INVERTED_SCORE: scoreInverted,
  };

  // Pick the highest-priority rule.
  const order = ['EXACT_WINNER_SCORE', 'WINNER_PLUS_PARTIAL_SCORE', 'WINNER_ONLY', 'QUALIFIED_TEAM', 'EXACT_SCORE_DIFFERENT_WINNER', 'INVERTED_SCORE'];
  let rule = null;
  let points = 0;
  let explanation = 'Sin acierto';
  for (const k of order) {
    if (ruleFires[k]) {
      rule = k;
      points = RULE_POINTS[order.indexOf(k)];
      explanation = {
        EXACT_WINNER_SCORE: 'Ganador + marcador exacto',
        WINNER_PLUS_PARTIAL_SCORE: 'Ganador + acierto parcial de marcador',
        WINNER_ONLY: 'Acertaste el ganador',
        QUALIFIED_TEAM: 'El equipo que respaldaste clasificó (sin acertar ganador)',
        EXACT_SCORE_DIFFERENT_WINNER: 'Marcador exacto, pero con ganador equivocado',
        INVERTED_SCORE: 'Marcador invertido (acertaste los goles pero no los equipos)',
      }[k];
      break;
    }
  }

  // Inconsistencies to surface
  if (predictedQualifier && actualQualifier && predictedQualifier !== actualQualifier) {
    issues.push({
      code: 'WINNER_QUALIFIER_MISMATCH',
      message: `Predijiste que clasifica "${predictedQualifier}" pero el resultado marca a "${actualQualifier}" como clasificado`,
    });
  }
  if (predictedWinner === 'draw' && predictedQualifier) {
    issues.push({
      code: 'PREDICTION_DRAW_MISMATCH',
      message: 'Tu predicción es empate, así que no hay clasificado posible',
    });
  }
  if (rule === 'QUALIFIED_TEAM') {
    issues.push({
      code: 'RULE_4_TRIGGERED',
      message: 'Se aplicó la regla 4 (5 pts): el ganador y el clasificado fueron definidos por separado',
    });
  }
  if (rule === 'EXACT_SCORE_DIFFERENT_WINNER' && !exactScore) {
    issues.push({ code: 'RULE_MISMATCH', message: 'Asignaste 3 pts sin marcador exacto' });
  }
  if (rule === 'EXACT_WINNER_SCORE' && (!exactScore || !winnerCorrect)) {
    issues.push({ code: 'RULE_MISMATCH', message: 'Asignaste 8 pts sin ganador+exacto' });
  }

  return {
    matchId: prediction.matchId,
    points,
    rule,
    explanation,
    issues,
    breakdown,
  };
}

export function totalFor(predictions, results) {
  const byId = new Map(results.map(r => [r.matchId, r]));
  let total = 0;
  const perMatch = [];
  for (const p of predictions) {
    const r = byId.get(p.matchId);
    if (!r) {
      perMatch.push({ matchId: p.matchId, points: 0, rule: null, explanation: 'Sin resultado cargado' });
      continue;
    }
    const s = scorePrediction(p, r);
    total += s.points;
    perMatch.push(s);
  }
  return { total, perMatch };
}

export function collectInconsistencies(allScored) {
  const seen = new Map();
  for (const entry of allScored) {
    for (const match of entry.perMatch) {
      for (const issue of match.issues || []) {
        const key = `${entry.participantId}:${match.matchId}:${issue.code}`;
        if (!seen.has(key)) {
          seen.set(key, { ...issue, participantId: entry.participantId, participantName: entry.participantName, matchId: match.matchId });
        }
      }
    }
  }
  return [...seen.values()];
}
