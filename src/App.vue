<template>
  <div class="container">
    <header class="hero">
      <div class="row wrap" style="justify-content: space-between; gap: 16px;">
        <div>
          <h1>Quiniela WC 2026</h1>
          <p>4tos de final → Final · Selecciona los marcadores y al equipo que avanza en cada partido.</p>
        </div>
        <div class="row" style="gap: 8px;">
          <span v-if="store.health" class="kbd" :title="`Modo de almacenamiento: ${store.health.mode}`">
            {{ store.health.finished }} / {{ store.health.totalMatches }} partidos
            · {{ store.health.participants }} participantes
          </span>
          <button class="btn ghost" @click="reload" :disabled="store.loading">
            {{ store.loading ? 'Cargando…' : 'Actualizar' }}
          </button>
          <router-link to="/admin" class="btn">Admin</router-link>
        </div>
      </div>
      <nav class="tabs">
        <router-link to="/" :class="{ active: $route.path === '/' }">Quiniela</router-link>
        <router-link to="/leaderboard" :class="{ active: $route.path === '/leaderboard' }">Tabla</router-link>
      </nav>
    </header>

    <div v-if="store.error" class="banner error">
      <strong>Error:</strong> {{ store.error }}
    </div>
    <div v-else-if="store.health && store.health.mode === 'memory'" class="banner warn">
      <strong>Modo memoria.</strong> Los datos se perderán al reiniciar.
      Configura <code class="kbd">MONGODB_URI</code> en Vercel para persistencia real.
    </div>

    <router-view />

    <div v-if="toast" class="toast" :class="toastClass">{{ toast }}</div>
  </div>
</template>

<script setup>
import { onMounted, ref, provide, watch } from 'vue';
import { useDataStore } from './store.js';

const store = useDataStore();
const toast = ref('');
const toastKind = ref('good');
let toastTimer = null;

const toastClass = ref('good');
watch(toastKind, v => { toastClass.value = v; });

function showToast(msg, kind = 'good') {
  toast.value = msg;
  toastKind.value = kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 2400);
}

provide('toast', showToast);

onMounted(() => store.refreshAll());

async function reload() {
  await store.refreshAll();
  showToast('Datos actualizados');
}
</script>
