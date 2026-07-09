import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePrediction, totalFor, determineWinner, isValidScore, RULE_POINTS } from '../api/_lib/points.js';

const p = (matchId, home, away) => ({ matchId, home, away });
const r = (matchId, home, away, finished = true, qualified) => ({ matchId, home, away, finished, qualified });

test('determineWinner', () => {
  assert.equal(determineWinner(2, 1), 'home');
  assert.equal(determineWinner(1, 2), 'away');
  assert.equal(determineWinner(1, 1), 'draw');
  assert.equal(determineWinner(null, 1), null);
});

test('isValidScore', () => {
  assert.ok(isValidScore(0));
  assert.ok(isValidScore(30));
  assert.ok(!isValidScore(-1));
  assert.ok(!isValidScore(31));
  assert.ok(!isValidScore(1.5));
  assert.ok(!isValidScore(null));
  assert.ok(!isValidScore('2'));
});

test('Rule 1: winner + exact score -> 8 pts', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 2, 1));
  assert.equal(s.points, 8);
  assert.equal(s.rule, 'EXACT_WINNER_SCORE');
});

test('Rule 2: winner + goals home match only -> 7 pts', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 2, 0));
  assert.equal(s.points, 7);
  assert.equal(s.rule, 'WINNER_PLUS_PARTIAL_SCORE');
});

test('Rule 2: winner + goals away match only -> 7 pts', () => {
  // predicted: home 2-1, actual: home 5-1 (home wins, away goals match)
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 5, 1));
  assert.equal(s.points, 7);
});

test('Rule 3: winner only (no score match) -> 6 pts', () => {
  // predicted: home 2-1, actual: home 3-0 (home wins, neither score matches)
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 3, 0));
  assert.equal(s.points, 6);
  assert.equal(s.rule, 'WINNER_ONLY');
});

test('Rule 4: qualifier correct without winner (e.g. penalties recorded as 0-0 with explicit qualifier) -> 5 pts', () => {
  // predicted: home 1-0, actual: 0-0 with home tagged as qualifier (penalty win for home)
  // winnerCorrect is false (the score is a draw), but qualifierCorrect is true.
  const s = scorePrediction(p('QF1', 1, 0), r('QF1', 0, 0, true, 'home'));
  assert.equal(s.points, 5);
  assert.equal(s.rule, 'QUALIFIED_TEAM');
});

test('Rule 4: qualifier mismatch (predicted home, actual away qualifier) -> 0 pts', () => {
  const s = scorePrediction(p('QF1', 1, 0), r('QF1', 0, 0, true, 'away'));
  assert.equal(s.points, 0);
  assert.ok(s.issues.some(i => i.code === 'WINNER_QUALIFIER_MISMATCH'));
});

test('Rule 5: exact score with different winner -> 3 pts', () => {
  // predicted: 1-2 (away), actual: 1-2 — but the prediction is 1-2 (away wins), so winner is correct.
  // To trigger rule 5 we need same score, different winner: this can only happen if a
  // draw (in a no-draw match) is recorded with a manual qualifier. We model that case:
  // predicted: 1-1, actual: 1-1 with explicit qualifier 'home' — score matches exactly, but
  // predicted "no winner" while actual has home qualifier.
  const s = scorePrediction(p('QF1', 1, 1), r('QF1', 1, 1, true, 'home'));
  // Predicted winner is draw → winnerCorrect=false. Score is exact. Qualifier diff: pred=null, actual=home.
  // qualifierCorrect = pred && actual && pred === actual → false (pred is null).
  // So rule 5 (EXACT_SCORE_DIFFERENT_WINNER) requires winnerCorrect=false and exact=true.
  // Our predicted winner is 'draw', so the rule 5 check `!winnerCorrect` is true. But we also
  // need to check the predictedQualifier comparison.
  assert.equal(s.points, 3);
  assert.equal(s.rule, 'EXACT_SCORE_DIFFERENT_WINNER');
});

test('No match -> 0 pts', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 0, 0));
  assert.equal(s.points, 0);
  assert.equal(s.rule, null);
});

test('Unfinished match -> 0 pts', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 2, 1, false));
  assert.equal(s.points, 0);
  assert.match(s.explanation, /no finalizado/i);
});

test('Predicting a draw in a knockout is flagged (PREDICTED_DRAW)', () => {
  const s = scorePrediction(p('QF1', 1, 1), r('QF1', 2, 1));
  // predicted winner = draw, actual winner = home. winnerCorrect? No. qualifierCorrect? No (pred is null).
  // exact? 1!=2, 1!=1. So no rule fires → 0 pts.
  assert.equal(s.points, 0);
  assert.ok(s.issues.some(i => i.code === 'PREDICTED_DRAW'));
});

test('Result registered as a draw without qualifier is flagged', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 1, 1));
  assert.equal(s.points, 0);
  assert.ok(s.issues.some(i => i.code === 'RESULT_IS_DRAW'));
});

test('Result registered as a draw WITH explicit qualifier triggers a normal match', () => {
  // predicted home 1-0, actual 0-0 with home qualifier (e.g. decided by penalties)
  const s = scorePrediction(p('QF1', 1, 0), r('QF1', 0, 0, true, 'home'));
  // predicted winner = home, actual qualifier = home. winnerCorrect=false (actual winner is draw),
  // but qualifierCorrect=true. So rule 4 → 5 pts.
  assert.equal(s.points, 5);
  assert.equal(s.rule, 'QUALIFIED_TEAM');
});

test('Rule priority: winner+exact beats qualified (in a normal knockout)', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 2, 1));
  assert.equal(s.points, 8);
  assert.equal(s.rule, 'EXACT_WINNER_SCORE');
});

test('Rule priority: winner+partial beats winner+no-score', () => {
  const s = scorePrediction(p('QF1', 2, 1), r('QF1', 2, 0));
  assert.equal(s.points, 7);
});

test('Rule priority: winner+no-score beats exact+wrong-winner (impossible by definition but covers priority)', () => {
  // We can't construct a case where both winner+exact AND exact+wrong-winner apply, so
  // this is more of a regression check that rule order is correct.
  const s = scorePrediction(p('QF1', 1, 2), r('QF1', 1, 2)); // away wins, both 1-2
  assert.equal(s.points, 8); // away is the winner, score exact
  assert.equal(s.rule, 'EXACT_WINNER_SCORE');
});

test('totalFor sums across matches and handles missing results', () => {
  const predictions = [
    p('QF1', 2, 1), // 8 pts (winner + exact)
    p('QF2', 1, 0), // 6 pts (winner only, result 3-2)
    p('QF3', 0, 2), // 6 pts (predicted away wins 0-2, actual away wins 1-3)
  ];
  const results = [
    r('QF1', 2, 1),
    r('QF2', 3, 2),
    r('QF3', 1, 3),
  ];
  const { total, perMatch } = totalFor(predictions, results);
  assert.equal(total, 8 + 6 + 6);
  assert.equal(perMatch.length, 3);
});

test('totalFor with missing result contributes 0 and reports it', () => {
  const { total, perMatch } = totalFor([p('QF1', 2, 1)], []);
  assert.equal(total, 0);
  assert.equal(perMatch[0].points, 0);
  assert.match(perMatch[0].explanation, /sin resultado/i);
});

test('Rule 5 vs 1 priority when both could apply (penalty case)', () => {
  // If the predicted score is a draw but the actual is the same draw with an explicit
  // qualifier, the predicted winner is "draw" so rule 1 (winner+exact) is unreachable.
  // Rule 5 should still apply because exact=true and winnerCorrect=false.
  const s = scorePrediction(p('QF1', 1, 1), r('QF1', 1, 1, true, 'home'));
  assert.equal(s.points, 3);
  assert.equal(s.rule, 'EXACT_SCORE_DIFFERENT_WINNER');
});

test('Rule 4: predicted qualifier correct on a draw (penalty win)', () => {
  // Luis predicted 0-0 with qualified=away. Actual is 1-1 with qualified=away.
  // Scores differ so rule 5 (exact score) doesn't apply.
  // predictedWinner='draw', predictedQualifier='away' (explicit).
  // winnerCorrect=false, qualifierCorrect=true.
  // → Rule 4 (QUALIFIED_TEAM): 5 pts.
  const s = scorePrediction(
    { matchId: 'QF2', home: 0, away: 0, qualified: 'away' },
    { matchId: 'QF2', home: 1, away: 1, finished: true, qualified: 'away' },
  );
  assert.equal(s.points, 5);
  assert.equal(s.rule, 'QUALIFIED_TEAM');
});

test('Rule 4: predicted qualifier wrong on a draw', () => {
  // Luis predicted away qualifies, but home qualified in the actual result.
  const s = scorePrediction(
    { matchId: 'QF2', home: 0, away: 0, qualified: 'away' },
    { matchId: 'QF2', home: 1, away: 1, finished: true, qualified: 'home' },
  );
  assert.equal(s.points, 0);
  assert.equal(s.rule, null);
});

test('RULE_POINTS exports the expected canonical order', () => {
  assert.deepEqual(RULE_POINTS, [8, 7, 6, 5, 3]);
});
