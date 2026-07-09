import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCHES, resolveTeamFromResults, resolveMatches, getMatch } from '../api/_lib/matches.js';

test('MATCHES has the real QF matchups (France, Morocco, etc.)', () => {
  assert.equal(MATCHES.find(m => m.id === 'QF1').home, 'France');
  assert.equal(MATCHES.find(m => m.id === 'QF1').away, 'Morocco');
  assert.equal(MATCHES.find(m => m.id === 'QF2').home, 'Spain');
  assert.equal(MATCHES.find(m => m.id === 'QF2').away, 'Belgium');
  assert.equal(MATCHES.find(m => m.id === 'QF3').home, 'Norway');
  assert.equal(MATCHES.find(m => m.id === 'QF3').away, 'England');
  assert.equal(MATCHES.find(m => m.id === 'QF4').home, 'Argentina');
  assert.equal(MATCHES.find(m => m.id === 'QF4').away, 'Switzerland');
});

test('SF and F teams remain placeholders', () => {
  assert.equal(MATCHES.find(m => m.id === 'SF1').home, 'WQF1');
  assert.equal(MATCHES.find(m => m.id === 'SF1').away, 'WQF2');
  assert.equal(MATCHES.find(m => m.id === 'SF2').home, 'WQF3');
  assert.equal(MATCHES.find(m => m.id === 'SF2').away, 'WQF4');
  assert.equal(MATCHES.find(m => m.id === 'F1').home, 'WSF1');
  assert.equal(MATCHES.find(m => m.id === 'F1').away, 'WSF2');
});

test('resolveTeamFromResults returns placeholder when no result', () => {
  assert.equal(resolveTeamFromResults('WQF1', []), 'WQF1');
});

test('resolveTeamFromResults resolves to winner when finished', () => {
  const results = [
    { matchId: 'QF1', home: 2, away: 1, finished: true, qualified: 'home' },
  ];
  assert.equal(resolveTeamFromResults('WQF1', results), 'France');
});

test('resolveTeamFromResults uses explicit qualified for draws', () => {
  const results = [
    { matchId: 'QF2', home: 1, away: 1, finished: true, qualified: 'away' },
  ];
  assert.equal(resolveTeamFromResults('WQF2', results), 'Belgium');
});

test('resolveTeamFromResults derives from score when no qualified', () => {
  const results = [
    { matchId: 'QF3', home: 3, away: 0, finished: true },
  ];
  assert.equal(resolveTeamFromResults('WQF3', results), 'Norway');
});

test('resolveMatches resolves the whole bracket chain', () => {
  const results = [
    { matchId: 'QF1', home: 2, away: 1, finished: true, qualified: 'home' },   // France
    { matchId: 'QF2', home: 1, away: 1, finished: true, qualified: 'away' },  // Belgium
    { matchId: 'QF3', home: 0, away: 2, finished: true },                    // England
    { matchId: 'QF4', home: 3, away: 0, finished: true, qualified: 'home' },  // Argentina
  ];
  const resolved = resolveMatches(results);
  const sf1 = resolved.find(m => m.id === 'SF1');
  const sf2 = resolved.find(m => m.id === 'SF2');
  const f1 = resolved.find(m => m.id === 'F1');
  assert.equal(sf1.home, 'France');
  assert.equal(sf1.away, 'Belgium');
  assert.equal(sf2.home, 'England');
  assert.equal(sf2.away, 'Argentina');
  // F1 still has placeholders since SF1/SF2 are not finished
  assert.equal(f1.home, 'WSF1');
  assert.equal(f1.away, 'WSF2');
});

test('getMatch returns the right match or null', () => {
  assert.ok(getMatch('QF1'));
  assert.equal(getMatch('NOPE'), null);
});