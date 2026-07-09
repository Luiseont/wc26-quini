<template>
  <section class="card flex-col">
    <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="topbar-brand">QUINIELA<span class="dot">·</span>WC26</div>
        <div style="font-size:11px; padding:3px 8px; background: rgba(239,68,68,.1); color: var(--accent-bad); border:1px solid rgba(239,68,68,.3); border-radius:4px; letter-spacing:.05em; text-transform:uppercase; font-weight:700;">ADMIN</div>
      </div>
      <div class="topbar-meta">SESIÓN ACTIVA · <span class="text-good">●</span></div>
    </div>

    <div v-if="checked === false" class="banner info">
      <div class="flex-col" style="flex:1; gap:6px;">
        <strong>Introduce la clave de admin</strong>
        <span class="muted" style="font-size:13px;">Solo quien tenga la clave puede cargar resultados.</span>
        <div class="row" style="margin-top:6px;">
          <input v-model="adminKey" class="input" type="password" placeholder="Contraseña de admin" @keyup.enter="checkKey" style="max-width:280px;" />
          <button class="btn primary" @click="checkKey" :disabled="checking">Entrar</button>
        </div>
        <span v-if="checkError" class="text-bad" style="font-size:13px;">{{ checkError }}</span>
      </div>
    </div>

    <template v-else-if="isAdmin">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px;">
        <div>
          <div class="section-eyebrow">Cargar resultados</div>
          <h1 class="section-h1">Panel de administración</h1>
        </div>
        <div class="row gap-sm">
          <button class="btn" @click="refresh" :disabled="loading">Refrescar</button>
          <button class="btn danger" @click="onReset" :disabled="loading">Reset total</button>
        </div>
      </div>

      <div class="status-cards">
        <div class="status-card">
          <div class="label">Modo storage</div>
          <div class="value text-good">{{ store.health?.mode || '...' }}</div>
        </div>
        <div class="status-card">
          <div class="label">Finalizados</div>
          <div class="value">
            <span class="text-good">{{ finishedCount }}</span> / {{ store.matches.length }}
          </div>
        </div>
        <div class="status-card">
          <div class="label">Participantes</div>
          <div class="value">{{ store.participants.length }}</div>
        </div>
      </div>

      <details class="card" style="background: var(--bg-1); margin-bottom:14px;">
        <summary style="cursor:pointer; font-size:13px; color: var(--text-dim);">⌨️ Carga masiva (pegar varias líneas)</summary>
        <p class="muted" style="font-size:13px; margin:8px 0 6px;">
          Una línea por partido: <span class="kbd">ID H-A F</span>. <span class="kbd">F</span> opcional (1 = finalizado).
        </p>
        <textarea v-model="bulkText" class="input mono" rows="4" placeholder="QF1 2-1 1&#10;QF2 1-0 1"></textarea>
        <div class="row" style="margin-top:8px;">
          <span class="spacer"></span>
          <button class="btn" @click="bulkPreview" :disabled="!bulkText.trim()">Previsualizar</button>
          <button class="btn primary" @click="bulkApply" :disabled="!bulkParsed.length || loading">
            Aplicar {{ bulkParsed.length }} resultado(s)
          </button>
        </div>
        <div v-if="bulkError" class="banner error" style="margin-top:8px;">{{ bulkError }}</div>
      </details>

      <div class="sb-table" style="padding:0;">
        <div style="display:grid; grid-template-columns:50px 1fr 70px 30px 70px 1fr 130px 90px; gap:10px; padding:12px 18px; font-size:10px; color:var(--text-faint); letter-spacing:0.1em; text-transform:uppercase; background:var(--bg-0); border-bottom:1px solid var(--line);">
          <span>ID</span><span>Local</span><span></span><span></span><span></span><span>Visitante</span><span>Clasificado</span><span>Estado</span>
        </div>
        <div
          v-for="m in store.matches"
          :key="m.id"
          style="display:grid; grid-template-columns:50px 1fr 70px 30px 70px 1fr 130px 90px; gap:10px; padding:14px 18px; align-items:center; border-bottom:1px solid rgba(31,37,48,0.6);"
        >
          <span class="id">{{ m.id }}</span>
          <span style="text-align:right; font-weight:600;">{{ m.home }}</span>
          <input
            type="number" min="0" max="30"
            :value="resultHome(m.id)"
            @input="setResult(m.id, 'home', $event.target.value)"
            :class="['mono', inputState(m.id)]"
            style="text-align:center; background:var(--bg-0); border-radius:4px; padding:8px; font-weight:700; font-size:18px;"
          />
          <span style="text-align:center; color:var(--text-faint);">—</span>
          <input
            type="number" min="0" max="30"
            :value="resultAway(m.id)"
            @input="setResult(m.id, 'away', $event.target.value)"
            :class="['mono', inputState(m.id)]"
            style="text-align:center; background:var(--bg-0); border-radius:4px; padding:8px; font-weight:700; font-size:18px;"
          />
          <span style="font-weight:600;">{{ m.away }}</span>
          <span class="mono" style="font-size:11px;" :class="qualifiedClass(m.id)">
            {{ qualifiedLabel(m.id) }}
          </span>
          <span class="status-badge" :class="statusClass(m.id)">
            {{ statusLabel(m.id) }}
          </span>
        </div>
      </div>

      <div style="margin-top:14px;">
        <button class="btn" @click="loadInconsistencies" :disabled="loading">
          {{ inconsistencies ? 'Volver a detectar inconsistencias' : 'Detectar inconsistencias' }}
        </button>
      </div>

      <div v-if="inconsistencies" style="margin-top:18px;">
        <h3 class="section-title" style="margin-top:0;">Inconsistencias</h3>
        <div v-if="!inconsistencies.predictionIssues.length && !inconsistencies.resultIssues.length" class="banner good">
          Sin inconsistencias. Todas las predicciones y resultados son coherentes.
        </div>
        <div v-else>
          <div v-for="(i, idx) in inconsistencies.resultIssues" :key="'r'+idx" class="issue">
            <span class="code">{{ i.code }}</span>
            <span><strong>{{ i.matchId }}</strong> · {{ i.message }}</span>
          </div>
          <div v-for="(i, idx) in inconsistencies.predictionIssues" :key="'p'+idx" class="issue">
            <span class="code">{{ i.code }}</span>
            <span><strong>{{ i.participantName }} · {{ i.matchId }}</strong> · {{ i.message }}</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { useDataStore } from '../store.js';
import { api, setAdminKey } from '../api.js';

const store = useDataStore();
const toast = inject('toast');

const adminKey = ref('');
const checked = ref(null);
const isAdmin = ref(false);
const checkError = ref('');
const checking = ref(false);
const loading = ref(false);
const inconsistencies = ref(null);
const bulkText = ref('');
const bulkParsed = ref([]);
const bulkError = ref('');

const finishedCount = computed(() => store.finishedCount);

onMounted(async () => {
  try {
    const r = await api.adminCheck();
    checked.value = true;
    isAdmin.value = r.ok;
  } catch (e) {
    checked.value = false;
  }
});

async function checkKey() {
  checkError.value = '';
  checking.value = true;
  setAdminKey(adminKey.value);
  try {
    const r = await api.adminCheck();
    checked.value = true;
    isAdmin.value = r.ok;
    if (!r.ok) {
      checkError.value = 'Clave incorrecta';
      setAdminKey('');
    } else {
      toast('Sesión de admin iniciada', 'good');
      await loadInconsistencies();
    }
  } catch (e) {
    checkError.value = e.message;
  } finally {
    checking.value = false;
  }
}

function draftResult(matchId) {
  return store.resultsById.get(matchId) || { matchId, home: null, away: null, finished: false };
}
function resultHome(matchId) { const r = draftResult(matchId); return r.home ?? ''; }
function resultAway(matchId) { const r = draftResult(matchId); return r.away ?? ''; }
function isFinished(matchId) { return draftResult(matchId).finished; }
function statusClass(matchId) {
  if (isFinished(matchId)) return 'final';
  const r = draftResult(matchId);
  if (r.home != null && r.away != null) return 'live';
  return 'next';
}
function statusLabel(matchId) {
  if (isFinished(matchId)) return '● FINAL';
  const r = draftResult(matchId);
  if (r.home != null && r.away != null) return '◐ EN JUEGO';
  return '○ PRÓX.';
}
function inputState(matchId) {
  if (isFinished(matchId)) return 'state-final';
  const r = draftResult(matchId);
  if (r.home != null && r.away != null) return 'state-live';
  return 'state-next';
}
function qualifiedLabel(matchId) {
  const r = draftResult(matchId);
  if (r.qualified === 'home') return `✓ ${store.matchesById.get(matchId)?.home || ''}`;
  if (r.qualified === 'away') return `✓ ${store.matchesById.get(matchId)?.away || ''}`;
  if (isFinished(matchId)) return '—';
  return '—';
}
function qualifiedClass(matchId) {
  const r = draftResult(matchId);
  if (r.qualified) return 'text-good';
  if (!isFinished(matchId)) return 'text-warn';
  return 'muted';
}

async function setResult(matchId, side, val) {
  const v = val === '' ? null : Number(val);
  if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) return;
  const existing = store.resultsById.get(matchId) || { matchId, home: null, away: null, finished: false };
  const updated = { ...existing, home: side === 'home' ? v : existing.home, away: side === 'away' ? v : existing.away, finished: false };
  const idx = store.results.findIndex(r => r.matchId === matchId);
  if (idx >= 0) store.results[idx] = updated;
  else store.results.push(updated);
  // Auto-save
  try {
    await api.upsertResult(matchId, { home: updated.home, away: updated.away, finished: false });
  } catch (e) { toast(e.message, 'error'); }
}

async function loadInconsistencies() {
  loading.value = true;
  try {
    inconsistencies.value = await api.adminInconsistencies();
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
}

async function refresh() {
  loading.value = true;
  try { await store.refreshAll(); }
  finally { loading.value = false; }
}

async function onReset() {
  const phrase = prompt('Esto borrará TODOS los participantes y resultados. Escribe RESET para confirmar.');
  if (phrase !== 'RESET') return;
  loading.value = true;
  try {
    await api.adminReset('RESET');
    await store.refreshAll();
    toast('Quiniela reiniciada', 'good');
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
}

function parseBulkLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return { error: `Línea sin marcador: "${line}"` };
  const id = parts[0].toUpperCase();
  if (!store.matchesById.get(id)) return { error: `Partido desconocido: ${id}` };
  const score = parts[1].match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!score) return { error: `Marcador inválido en "${line}"` };
  const finished = parts[2] === '1' || parts[2] === 'F';
  return { matchId: id, home: Number(score[1]), away: Number(score[2]), finished };
}

function bulkPreview() {
  bulkError.value = '';
  const lines = bulkText.value.split('\n');
  const parsed = [];
  for (const l of lines) {
    const r = parseBulkLine(l);
    if (!r) continue;
    if (r.error) { bulkError.value = r.error; return; }
    parsed.push(r);
  }
  bulkParsed.value = parsed;
}

async function bulkApply() {
  if (!bulkParsed.value.length) return;
  loading.value = true;
  try {
    await api.bulkResults(bulkParsed.value);
    await store.refreshResults();
    toast(`${bulkParsed.value.length} resultados actualizados`, 'good');
    bulkText.value = '';
    bulkParsed.value = [];
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
}
</script>
