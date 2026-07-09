<template>
  <div class="container">
    <header class="topbar">
      <div style="display:flex; align-items:center; gap:24px;">
        <div class="topbar-brand">QUINIELA<span class="dot">·</span>WC26</div>
        <nav class="topbar-nav">
          <router-link to="/" :class="{ active: $route.path === '/' }">Inicio</router-link>
          <router-link to="/leaderboard" :class="{ active: $route.path === '/leaderboard' }">Ranking</router-link>
          <router-link to="/admin" :class="{ active: $route.path === '/admin' }">Admin</router-link>
        </nav>
      </div>
      <div class="topbar-meta">
        <span>CUPO <strong>{{ store.participants.length }}</strong> / 100</span>
        <span style="margin: 0 8px; color: var(--line);">|</span>
        <span class="warn">CIERRA 11 JUL · 12:00</span>
      </div>
    </header>

    <router-view />

    <div v-if="toastMsg" :class="['toast', toastKind]">{{ toastMsg }}</div>
  </div>
</template>

<script setup>
import { ref, provide } from 'vue';
import { useDataStore } from './store.js';

const store = useDataStore();
store.refreshAll();

const toastMsg = ref('');
const toastKind = ref('');
let toastTimer = null;
function toast(msg, kind = '') {
  toastMsg.value = msg;
  toastKind.value = kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg.value = ''; }, 2400);
}
provide('toast', toast);
</script>
