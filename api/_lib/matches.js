// Canonical list of matches for the World Cup 2026 quiniela, from quarterfinals
// to the final. Quarterfinal teams are the real QF matchups (confirmed bracket).
// Semifinal and final team names are placeholders ("WQF1", "WSF1") that the
// frontend resolves dynamically based on actual results (admin) or user
// predictions (prediction form).
export const MATCHES = [
  { id: 'QF1', stage: 'QF', label: 'Cuartos 1', home: 'Francia',  away: 'Marruecos',   order: 1 },
  { id: 'QF2', stage: 'QF', label: 'Cuartos 2', home: 'España',   away: 'Bélgica',     order: 2 },
  { id: 'QF3', stage: 'QF', label: 'Cuartos 3', home: 'Noruega',  away: 'Inglaterra',  order: 3 },
  { id: 'QF4', stage: 'QF', label: 'Cuartos 4', home: 'Argentina', away: 'Suiza',       order: 4 },
  { id: 'SF1', stage: 'SF', label: 'Semifinal 1', home: 'WQF1', away: 'WQF2', order: 5 },
  { id: 'SF2', stage: 'SF', label: 'Semifinal 2', home: 'WQF3', away: 'WQF4', order: 6 },
  { id: 'F1',  stage: 'F',  label: 'Final',       home: 'WSF1',  away: 'WSF2',  order: 7 },
];

export const STAGES = {
  QF: 'Cuartos de final',
  SF: 'Semifinales',
  F:  'Final',
};

export function getMatch(id) {
  return MATCHES.find(m => m.id === id) || null;
}

// Resolve a team placeholder like "WQF1" against actual results.
// Returns the resolved team name, or the placeholder if the source match
// isn't finished yet or has no resolvable winner.
export function resolveTeamFromResults(team, results) {
  if (typeof team !== 'string' || !team.startsWith('W') || team.length < 3) return team;
  const sourceMatchId = team.slice(1);
  const sourceMatch = MATCHES.find(m => m.id === sourceMatchId);
  if (!sourceMatch) return team;
  const result = results.find(r => r.matchId === sourceMatchId);
  if (!result || !result.finished) return team;
  if (result.home == null || result.away == null) return team;
  let side = null;
  if (result.qualified === 'home' || result.qualified === 'away') {
    side = result.qualified;
  } else if (result.home > result.away) {
    side = 'home';
  } else if (result.away > result.home) {
    side = 'away';
  } else {
    return team;
  }
  return side === 'home' ? sourceMatch.home : sourceMatch.away;
}

// Returns a copy of MATCHES with team placeholders resolved against the
// given results (used by the /api/matches endpoint).
export function resolveMatches(results) {
  return MATCHES.map(m => ({
    ...m,
    home: resolveTeamFromResults(m.home, results),
    away: resolveTeamFromResults(m.away, results),
  }));
}
