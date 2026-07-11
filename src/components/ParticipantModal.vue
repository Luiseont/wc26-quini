<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true">
      <header>
        <h2>{{ participant.name }}</h2>
        <button class="btn ghost" @click="$emit('close')" aria-label="Cerrar">✕</button>
      </header>
      <div class="body">
        <div class="row" style="margin-bottom: 16px;">
          <div class="card" style="flex: 1; padding: 14px;">
            <div class="muted" style="font-size: 12px;">Total</div>
            <div style="font-size: 28px; font-weight: 800; color: var(--accent-gold);">{{ total }} pts</div>
          </div>
          <div class="card" style="flex: 1; padding: 14px;">
            <div class="muted" style="font-size: 12px;">Predicciones</div>
            <div style="font-size: 28px; font-weight: 800;">{{ predCount }} / {{ matches.length }}</div>
          </div>
        </div>

        <div class="sb-table" style="padding: 0;">
          <div style="display:grid; grid-template-columns: 50px 1fr 50px 50px 1fr 90px; gap:10px; padding:12px 18px; font-size:10px; color:var(--text-faint); letter-spacing:0.1em; text-transform:uppercase; background:var(--bg-0); border-bottom:1px solid var(--line);">
            <span>ID</span>
            <span style="text-align: right;">Local</span>
            <span style="text-align: center;">Pts</span>
            <span style="text-align: center;">Pts</span>
            <span>Visitante</span>
            <span style="text-align: right;">Puntos</span>
          </div>
          <div v-for="m in displayMatches" :key="m.id" class="modal-match-block">
            <div v-if="actualResultFor(m.id)" class="actual-result">
              <span class="actual-result-label">Resultado</span>
              <span class="actual-result-score">
                <strong>{{ m.home }}</strong>
                <span class="actual-result-numbers">{{ actualResultFor(m.id).home }} – {{ actualResultFor(m.id).away }}</span>
                <strong>{{ m.away }}</strong>
              </span>
              <span class="actual-result-winner">→ {{ actualResultWinner(m.id) }} clasificó</span>
            </div>
            <div style="display:grid; grid-template-columns: 50px 1fr 50px 50px 1fr 90px; gap:10px; padding:13px 18px; align-items:center; border-bottom: 1px solid rgba(31, 37, 48, 0.6);">
              <span class="muted mono" style="font-size: 11px;">{{ m.id }}</span>
              <span :class="{ 'text-gold': pickOf(m.id) === 'home' }" style="font-weight: 600; text-align: right;">{{ m.home }}</span>
              <span class="mono" style="text-align: center;">{{ scoreStr(predOf(m.id), 'home') }}</span>
              <span class="mono" style="text-align: center;">{{ scoreStr(predOf(m.id), 'away') }}</span>
              <span :class="{ 'text-gold': pickOf(m.id) === 'away' }" style="font-weight: 600;">{{ m.away }}</span>
              <span v-if="resultOf(m.id)" style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                <span class="mono" :class="pointsClass(m.id)" style="font-weight: 700; font-size: 16px;">{{ pointsFor(m.id) }}</span>
                <span v-if="ruleLabel(m.id)" class="muted mono" style="font-size: 10px;">{{ ruleLabel(m.id) }}</span>
              </span>
              <span v-else class="muted" style="text-align: right; font-size: 12px;">—</span>
            </div>
          </div>
        </div>

        <div v-if="resultIssues.length" style="margin-top: 18px;">
          <h3 style="font-size: 14px; margin: 0 0 8px;">Inconsistencias detectadas</h3>
          <div v-for="(i, idx) in resultIssues" :key="idx" class="issue">
            <span class="code">{{ i.code }}</span>
            <span>{{ i.matchId }} · {{ i.message }}</span>
          </div>
        </div>
      </div>
      <div class="footer">
        <button class="btn danger" @click="$emit('delete', participant)">Eliminar</button>
        <button class="btn primary" @click="$emit('close')">Cerrar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  participant: { type: Object, required: true },
  matches: Array,
  results: Array,
  leaderboard: Array,
});
defineEmits(['close', 'edit', 'delete']);

const resultsById = computed(() => new Map(props.results.map(r => [r.matchId, r])));
const matchesById = computed(() => new Map((props.matches || []).map(m => [m.id, m])));
const perMatchById = computed(() => {
  const row = props.leaderboard.find(r => r.id === props.participant.id);
  if (!row) return new Map();
  return new Map(row.perMatch.map(m => [m.matchId, m]));
});

// Static team map (real QF matchups) + placeholders for SF/F. Used to
// resolve WQF1/WSF1 placeholders against the participant's own predictions
// when actual results haven't been loaded yet.
const STATIC_TEAMS = {
  QF1: { home: 'Francia',   away: 'Marruecos' },
  QF2: { home: 'España',    away: 'Bélgica' },
  QF3: { home: 'Noruega',   away: 'Inglaterra' },
  QF4: { home: 'Argentina', away: 'Suiza' },
  SF1: { home: 'WQF1', away: 'WQF2' },
  SF2: { home: 'WQF3', away: 'WQF4' },
  F1:  { home: 'WSF1', away: 'WSF2' },
};

function resolveTeamForParticipant(team, depth = 0) {
  if (depth > 4) return team;
  if (typeof team !== 'string' || !team.startsWith('W') || team.length < 3) return team;
  const sourceMatchId = team.slice(1);
  const sourceStatic = STATIC_TEAMS[sourceMatchId];
  if (!sourceStatic) return team;
  const pred = (props.participant.predictions || []).find(p => p.matchId === sourceMatchId);
  let side = null;
  if (pred) {
    if (pred.qualified === 'home' || pred.qualified === 'away') {
      side = pred.qualified;
    } else if (Number.isInteger(pred.home) && Number.isInteger(pred.away)) {
      if (pred.home > pred.away) side = 'home';
      else if (pred.away > pred.home) side = 'away';
    }
  }
  if (!side) return team;
  const winningTeam = side === 'home' ? sourceStatic.home : sourceStatic.away;
  if (winningTeam.startsWith('W')) return resolveTeamForParticipant(winningTeam, depth + 1);
  return winningTeam;
}

const displayMatches = computed(() =>
  (props.matches || []).map(m => ({
    ...m,
    home: resolveTeamForParticipant(m.home),
    away: resolveTeamForParticipant(m.away),
  }))
);

const total = computed(() => {
  const row = props.leaderboard.find(r => r.id === props.participant.id);
  return row ? row.total : 0;
});

const predCount = computed(() => (props.participant.predictions || []).filter(p => Number.isInteger(p.home) && Number.isInteger(p.away)).length);

function predOf(matchId) {
  return props.participant.predictions?.find(p => p.matchId === matchId);
}

function resultOf(matchId) {
  return resultsById.value.get(matchId);
}

function actualResultFor(matchId) {
  const r = resultOf(matchId);
  return r && r.finished ? r : null;
}

function actualResultWinner(matchId) {
  const r = actualResultFor(matchId);
  if (!r) return '';
  const m = matchesById.value.get(matchId);
  if (!m) return '';
  if (r.qualified === 'home') return m.home || '';
  if (r.qualified === 'away') return m.away || '';
  if (r.home > r.away) return m.home || '';
  if (r.away > r.home) return m.away || '';
  return '';
}

function pickOf(matchId) {
  return predOf(matchId)?.qualified;
}

function pointsFor(matchId) {
  return perMatchById.value.get(matchId)?.points ?? 0;
}

function scoreStr(pred, side) {
  if (!pred || !Number.isInteger(pred[side])) return '·';
  return pred[side];
}

function pointsClass(matchId) {
  const r = perMatchById.value.get(matchId);
  if (!r || !r.rule) return 'cell-pending';
  if (r.rule === 'EXACT_WINNER_SCORE' || r.rule === 'EXACT_SCORE_DIFFERENT_WINNER') return 'cell-gold';
  if (r.rule === 'INVERTED_SCORE') return 'cell-warn';
  if (r.points > 0) return 'cell-good';
  if (r.points < 0) return 'cell-bad';
  return 'cell-pending';
}

const RULE_LABELS = {
  EXACT_WINNER_SCORE: '8 pts',
  WINNER_PLUS_PARTIAL_SCORE: '7 pts',
  WINNER_ONLY: '6 pts',
  QUALIFIED_TEAM_ON_DRAW_EXACT: '5 pts',
  QUALIFIED_TEAM: '2 pts',
  EXACT_SCORE_DIFFERENT_WINNER: '3 pts',
};

function ruleLabel(matchId) {
  const r = perMatchById.value.get(matchId);
  if (!r || !r.rule) return '';
  return RULE_LABELS[r.rule] || '';
}

// Re-run scoring locally to surface issues for this participant. We mirror the
// server logic so the modal is self-contained.
const resultIssues = computed(() => {
  const out = [];
  for (const p of props.participant.predictions || []) {
    const r = resultsById.value.get(p.matchId);
    if (!r) continue;
    if (Number.isInteger(p.home) && Number.isInteger(p.away) && p.home === p.away) {
      out.push({ code: 'PREDICTED_DRAW', matchId: p.matchId, message: 'Predijiste empate en una eliminatoria' });
    }
    if (r.finished && Number.isInteger(r.home) && Number.isInteger(r.away) && r.home === r.away) {
      out.push({ code: 'RESULT_IS_DRAW', matchId: r.matchId, message: 'El resultado es un empate en eliminatoria' });
    }
    if (p.qualified && Number.isInteger(p.home) && Number.isInteger(p.away)) {
      const winner = p.home > p.away ? 'home' : p.away > p.home ? 'away' : 'draw';
      if (winner !== 'draw' && p.qualified !== winner) {
        out.push({
          code: 'PREDICTION_SELF_CONTRADICTION',
          matchId: p.matchId,
          message: `Marcaste "${p.qualified}" como clasificado pero el marcador (${p.home}-${p.away}) indica otro ganador`,
        });
      }
    }
  }
  return out;
});
</script>