<template>
  <div>
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:16px; gap:12px; flex-wrap: wrap;">
      <div>
        <div class="section-eyebrow">Tabla de posiciones</div>
        <h1 class="section-h1">Ranking · Fase Final</h1>
      </div>
      <div class="row gap-sm">
        <span class="muted mono" style="font-size:11px;">{{ lastUpdated || '—' }}</span>
        <button class="btn" @click="refresh" :disabled="refreshing">Refrescar</button>
        <div class="tabs-segment">
          <button :class="{ on: filter === 'all' }" @click="filter = 'all'">Global</button>
          <button :class="{ on: filter === 'QF' }" @click="filter = 'QF'">Cuartos</button>
          <button :class="{ on: filter === 'SF' }" @click="filter = 'SF'">Semi</button>
          <button :class="{ on: filter === 'F' }" @click="filter = 'F'">Final</button>
        </div>
      </div>
    </div>

    <div class="sb-table">
      <div class="sb-table-head" v-if="store.leaderboard.length">
        <div style="display:grid; grid-template-columns: 50px 1.4fr 70px 55px 55px 55px 55px 55px 55px 55px 60px; gap:4px; width:100%;">
          <span>#</span>
          <span>Jugador</span>
          <span style="text-align:center;">PTS</span>
          <span style="text-align:center;">QF1</span>
          <span style="text-align:center;">QF2</span>
          <span style="text-align:center;">QF3</span>
          <span style="text-align:center;">QF4</span>
          <span style="text-align:center;">SF1</span>
          <span style="text-align:center;">SF2</span>
          <span style="text-align:center;">F</span>
          <span style="text-align:right;">DELTA</span>
        </div>
      </div>

      <div v-if="!store.leaderboard.length" class="empty">
        <h3>Sin datos aún</h3>
        <p>Agregá participantes en la pestaña Inicio para ver el ranking.</p>
      </div>

      <div v-else>
        <div
          v-for="(row, i) in store.leaderboard"
          :key="row.id"
          class="sb-row"
          :class="rankClass(i)"
          style="grid-template-columns: 50px 1.4fr 70px 55px 55px 55px 55px 55px 55px 55px 60px; gap:4px;"
        >
          <span class="rank" :class="rankColor(i)">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="name">{{ row.name }}</span>
          <span class="points" :class="{ gold: i === 0 }">{{ row.total }}</span>
          <span
            v-for="m in row.perMatch"
            :key="m.matchId"
            :title="`${m.matchId}: ${m.explanation}`"
            style="text-align:center; font-family: var(--font-mono); font-size:13px;"
            :class="cellClass(m)"
          >{{ m.points || '—' }}</span>
          <span class="delta" :class="deltaClass(row)">{{ deltaFor(row) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue';
import { useDataStore } from '../store.js';

const store = useDataStore();
const filter = ref('all');
const refreshing = ref(false);
const lastUpdated = ref('');

async function refresh() {
  refreshing.value = true;
  try {
    await store.refreshAll();
    lastUpdated.value = new Date().toLocaleTimeString();
  } finally {
    refreshing.value = false;
  }
}

onMounted(refresh);

function rankClass(i) {
  if (i === 0) return 'top1';
  if (i === 1) return 'top2';
  if (i === 2) return 'top3';
  return '';
}
function rankColor(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return '';
}
function cellClass(m) {
  if (!m.points && m.points !== 0) return 'cell-pending';
  if (m.rule === 'EXACT_WINNER_SCORE') return 'cell-gold';
  if (m.rule === 'EXACT_SCORE_DIFFERENT_WINNER') return 'cell-gold';
  if (m.rule === 'INVERTED_SCORE') return 'cell-warn';
  if (m.points > 0) return 'cell-good';
  return 'cell-bad';
}
function deltaFor(row) {
  const finished = (row.perMatch || []).filter(m => m.finished !== false);
  if (!finished.length) return '—';
  const total = finished.reduce((acc, m) => acc + (m.points || 0), 0);
  if (total > 0) return `+${total}`;
  if (total < 0) return String(total);
  return '0';
}
function deltaClass(row) {
  const finished = (row.perMatch || []).filter(m => m.finished !== false);
  const total = finished.reduce((acc, m) => acc + (m.points || 0), 0);
  if (total > 0) return 'up';
  if (total < 0) return 'down';
  return '';
}
</script>
