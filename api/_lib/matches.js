// Canonical list of matches for the World Cup 2026 quiniela, from quarterfinals
// to the final. Teams are intentionally generic: the admin updates them once the
// real bracket is known. Stage ordering is important because the UI builds a
// bracket visualisation from it.
export const MATCHES = [
  { id: 'QF1', stage: 'QF', label: 'Cuartos 1', home: '1A', away: '2B', order: 1 },
  { id: 'QF2', stage: 'QF', label: 'Cuartos 2', home: '1C', away: '2D', order: 2 },
  { id: 'QF3', stage: 'QF', label: 'Cuartos 3', home: '1E', away: '2F', order: 3 },
  { id: 'QF4', stage: 'QF', label: 'Cuartos 4', home: '1G', away: '2H', order: 4 },
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
