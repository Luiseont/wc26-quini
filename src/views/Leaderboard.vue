<template>
  <section class="card">
    <h2 class="section-title">
      Tabla de posiciones
      <span class="meta">{{ store.leaderboard.length }} participantes · {{ store.finishedCount }} / {{ store.matches.length }} partidos finalizados</span>
    </h2>

    <div v-if="!store.leaderboard.length" class="empty">
      <h3>Sin datos aún</h3>
      <p>Agrega participantes en la pestaña Quiniela para ver el ranking.</p>
    </div>

    <div v-else class="list">
      <div
        v-for="(row, i) in store.leaderboard"
        :key="row.id"
        class="participant"
        :class="rankClass(i)"
        style="cursor: default;"
      >
        <span class="rank">#{{ i + 1 }}</span>
        <span class="name">{{ row.name }}</span>
        <span class="points">
          {{ row.total }}
          <small>puntos</small>
        </span>
        <div class="row gap-sm" v-if="row.perMatch.length">
          <span
            v-for="m in row.perMatch"
            :key="m.matchId"
            :title="`${m.matchId}: ${m.explanation}`"
            class="kbd"
            :style="{ opacity: m.points ? 1 : 0.4, color: m.points ? 'var(--accent)' : 'var(--text-faint)' }"
          >{{ m.matchId }} {{ m.points }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useDataStore } from '../store.js';
const store = useDataStore();

function rankClass(i) {
  if (i === 0) return 'top1';
  if (i === 1) return 'top2';
  if (i === 2) return 'top3';
  return '';
}
</script>
