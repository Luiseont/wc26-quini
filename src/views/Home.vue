<template>
  <div class="row" style="justify-content: flex-end; margin-bottom: 10px;">
    <button class="btn" @click="showRules = true">
      <span>?</span> Cómo se calculan los puntos
    </button>
  </div>

  <section class="hero-stats">
    <div class="hero-stat">
      <div class="hero-stat-label">Partidos restantes</div>
      <div class="hero-stat-value">
        <span class="name">Cuartos → Final</span>
        <span>{{ store.matches.length - store.finishedCount }}</span>
      </div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-label">Promedio aciertos</div>
      <div class="hero-stat-value bad">
        <span class="name">Global</span>
        <span>{{ averageExact }}%</span>
      </div>
    </div>
  </section>

  <div class="grid two">
    <div class="sb-table">
      <div class="sb-table-head">
        <h3>Participantes</h3>
        <span class="meta">{{ store.participants.length }} REGISTRADOS</span>
      </div>
      <div v-if="!store.participants.length" class="empty">
        <h3>Aún no hay participantes</h3>
        <p>Creá el primero usando el formulario de la derecha.</p>
      </div>
      <div v-else>
        <div
          v-for="(p, i) in store.participants"
          :key="p.id"
          class="sb-row"
          :class="rankClass(i)"
          style="grid-template-columns: 50px 1fr 70px 60px 70px 60px;"
          @click="openModal(p)"
        >
          <span class="rank" :class="rankColor(i)">#{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="name">{{ p.name }}</span>
          <span class="points" :class="{ gold: i === 0 }">{{ totalFor(p.id) }}</span>
          <span class="mono muted" style="text-align:center; font-size:12px;">{{ exactFor(p.id) }}</span>
          <span class="mono" :class="trendDir(p.id)" style="text-align:center; font-size:12px;">{{ trendFor(p.id) }}</span>
          <span class="muted" style="text-align:right; font-size:11px;">PTS</span>
        </div>
      </div>
    </div>

    <div>
      <div v-if="tournamentStarted" class="banner warn" style="margin-bottom: 14px;">
        <span><strong>Torneo en curso.</strong> Las predicciones están cerradas: ya hay resultados cargados.</span>
      </div>
      <PredictionForm v-else @saved="onSaved" :editing="editing" />
    </div>
  </div>

  <ParticipantModal
    v-if="modalParticipant"
    :participant="modalParticipant"
    :matches="store.matches"
    :results="store.results"
    :leaderboard="store.leaderboard"
    @close="modalParticipant = null"
    @delete="onDelete"
  />

  <div v-if="showRules" class="modal-backdrop" @click.self="showRules = false">
    <div class="modal" role="dialog" aria-modal="true">
      <header>
        <h2>Reglas de puntuación</h2>
        <button class="btn ghost" @click="showRules = false" aria-label="Cerrar">✕</button>
      </header>
      <div class="body">
        <p class="muted" style="font-size:13px; margin-top:0;">
          Las reglas se evalúan en cascada: se aplica la de mayor valor que coincida.
          Si ninguna aplica, sumás 0 puntos.
        </p>
        <div class="rules-list">
          <div class="rule-item">
            <span class="rule-pts rule-pts-1">8 pts</span>
            <div class="rule-text">
              <strong>Ganador + marcador exacto.</strong>
              <span class="muted">Acertaste quién gana Y el resultado exacto.</span>
            </div>
          </div>
          <div class="rule-item">
            <span class="rule-pts rule-pts-2">7 pts</span>
            <div class="rule-text">
              <strong>Ganador + acierto parcial.</strong>
              <span class="muted">Acertaste el ganador y uno de los dos goles (a favor <strong>o</strong> en contra).</span>
            </div>
          </div>
          <div class="rule-item">
            <span class="rule-pts rule-pts-3">6 pts</span>
            <div class="rule-text">
              <strong>Solo el ganador.</strong>
              <span class="muted">Acertaste quién gana pero no acertaste ningún gol.</span>
            </div>
          </div>
          <div class="rule-item">
            <span class="rule-pts rule-pts-4">5 pts</span>
            <div class="rule-text">
              <strong>Clasificado correcto (solo penales).</strong>
              <span class="muted">El partido terminó empate y elegiste bien quién pasó (técnicamente, ganador ≠ clasificado).</span>
            </div>
          </div>
          <div class="rule-item">
            <span class="rule-pts rule-pts-5">3 pts</span>
            <div class="rule-text">
              <strong>Marcador exacto, ganador errado.</strong>
              <span class="muted">Adivinaste los goles pero no quién clasificó (caso típico de empate mal definido).</span>
            </div>
          </div>
          <div class="rule-item">
            <span class="rule-pts rule-pts-6">2 pts</span>
            <div class="rule-text">
              <strong>Marcador invertido.</strong>
              <span class="muted">Acertaste los goles pero los equipos están al revés (ej: predijiste 3-0 local, terminó 0-3).</span>
            </div>
          </div>
        </div>
        <p class="muted" style="font-size:12px; margin-top:18px;">
          Las inconsistencias lógicas (empates en eliminatorias, predicciones contradictorias) se listan en el panel de admin.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, computed } from 'vue';
import { useDataStore } from '../store.js';
import PredictionForm from '../components/PredictionForm.vue';
import ParticipantModal from '../components/ParticipantModal.vue';

const store = useDataStore();
const toast = inject('toast');

const editing = ref(null);
const modalParticipant = ref(null);
const showRules = ref(false);

const averageExact = computed(() => {
  if (!store.leaderboard.length || !store.matches.length) return 0;
  const totalExact = store.leaderboard.reduce((acc, p) =>
    acc + (p.perMatch || []).filter(m => m.rule === 'EXACT_WINNER_SCORE').length, 0);
  return Math.round((totalExact / (store.leaderboard.length * store.matches.length)) * 100);
});

// Tournament is "started" when any result has scores or is finalized.
const tournamentStarted = computed(() =>
  store.results.some(r => r.finished || Number.isInteger(r.home) || Number.isInteger(r.away))
);

function totalFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  return row ? row.total : 0;
}
function exactFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  if (!row) return '0 EX';
  const count = (row.perMatch || []).filter(m => m.rule === 'EXACT_WINNER_SCORE').length;
  return `+${count}`;
}
function trendFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  if (!row) return '—';
  const last = (row.perMatch || []).filter(m => m.finished).slice(-1)[0];
  if (!last) return '—';
  return last.points > 0 ? `▲ ${last.points}` : (last.points < 0 ? `▼ ${Math.abs(last.points)}` : '—');
}
function trendDir(id) {
  const row = store.leaderboard.find(r => r.id === id);
  if (!row) return '';
  const last = (row.perMatch || []).filter(m => m.finished).slice(-1)[0];
  if (!last) return '';
  return last.points > 0 ? 'text-good' : (last.points < 0 ? 'text-bad' : '');
}
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

function openModal(p) { modalParticipant.value = p; }
async function onDelete(p) {
  if (!confirm(`¿Eliminar a ${p.name}? Sus predicciones se perderán.`)) return;
  try {
    await store.deleteParticipant(p.id);
    modalParticipant.value = null;
    toast('Participante eliminado', 'good');
  } catch (e) { toast(e.message, 'error'); }
}
function onSaved() { editing.value = null; }
</script>
