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
            <div style="font-size: 28px; font-weight: 800; color: var(--accent);">{{ total }} pts</div>
          </div>
          <div class="card" style="flex: 1; padding: 14px;">
            <div class="muted" style="font-size: 12px;">Predicciones</div>
            <div style="font-size: 28px; font-weight: 800;">{{ predCount }} / {{ matches.length }}</div>
          </div>
        </div>

        <div v-for="m in matches" :key="m.id" class="match-row" :class="rowClass(m.id)">
          <span class="stage">{{ m.label }}</span>
          <span class="team" :class="{ winner: pickOf(m.id) === 'home' }">{{ m.home }}</span>
          <span class="score">{{ scoreStr(predOf(m.id), 'home') }} – {{ scoreStr(predOf(m.id), 'away') }}</span>
          <span class="team right" :class="{ winner: pickOf(m.id) === 'away' }">{{ m.away }}</span>
          <span class="pts" v-if="resultOf(m.id)">{{ pointsFor(m.id) }}<small>{{ ruleLabel(m.id) }}</small></span>
          <span class="pts" v-else style="opacity: 0.5;">—<small>sin resultado</small></span>
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
        <button class="btn" @click="$emit('edit', participant)">Editar predicciones</button>
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
const perMatchById = computed(() => {
  const row = props.leaderboard.find(r => r.id === props.participant.id);
  if (!row) return new Map();
  return new Map(row.perMatch.map(m => [m.matchId, m]));
});

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

function rowClass(matchId) {
  const r = resultOf(matchId);
  if (r && r.finished) return 'result has-result';
  return '';
}

const RULE_LABELS = {
  EXACT_WINNER_SCORE: '8 pts',
  WINNER_PLUS_PARTIAL_SCORE: '7 pts',
  WINNER_ONLY: '6 pts',
  QUALIFIED_TEAM: '5 pts',
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
