<template>
  <section class="card flex-col">
    <h2 class="section-title">
      Panel de admin
      <span class="meta">
        <span v-if="checked === null">comprobando…</span>
        <span v-else-if="isAdmin" class="muted">acceso concedido</span>
        <span v-else class="muted">requiere clave</span>
      </span>
    </h2>

    <div v-if="checked === false" class="banner">
      <div class="flex-col" style="flex: 1; gap: 6px;">
        <strong>Introduce la clave de admin</strong>
        <span class="muted" style="font-size: 13px;">Solo quien tenga la clave puede cargar resultados.</span>
        <div class="row" style="margin-top: 6px;">
          <input
            v-model="adminKey"
            class="input"
            type="password"
            placeholder="ADMIN_KEY"
            @keyup.enter="checkKey"
            style="max-width: 280px;"
          />
          <button class="btn primary" @click="checkKey" :disabled="checking">Entrar</button>
        </div>
        <span v-if="checkError" class="text-dim" style="color: var(--bad); font-size: 13px;">{{ checkError }}</span>
      </div>
    </div>

    <template v-else-if="isAdmin">
      <div class="row wrap" style="justify-content: space-between; gap: 12px;">
        <div class="muted" style="font-size: 13px;">
          Modo de almacenamiento: <span class="kbd">{{ store.health?.mode || 'desconocido' }}</span>
        </div>
        <div class="row gap-sm">
          <button class="btn" @click="refresh" :disabled="loading">Refrescar</button>
          <button class="btn danger" @click="onReset" :disabled="loading">Reset total</button>
        </div>
      </div>

      <h3 class="section-title" style="margin-top: 20px;">
        Resultados
        <span class="meta">{{ finishedCount }} / {{ store.matches.length }} finalizados</span>
      </h3>

      <details class="card" style="background: var(--bg-2); margin-bottom: 12px;">
        <summary style="cursor: pointer; font-size: 14px; color: var(--text-dim);">
          ⌨️ Pegado rápido (carga varios a la vez)
        </summary>
        <p class="muted" style="font-size: 13px; margin: 8px 0 6px;">
          Una línea por partido en formato <code class="kbd">ID H-A F</code> separados por espacios.
          <code class="kbd">F</code> es opcional (<code class="kbd">1</code> = finalizado).
          Ejemplo: <code class="kbd">QF1 2-1 1</code>
        </p>
        <textarea
          v-model="bulkText"
          class="input"
          rows="4"
          style="font-family: ui-monospace, monospace; font-size: 13px; resize: vertical;"
          placeholder="QF1 2-1 1&#10;QF2 1-0 1&#10;QF3 0-2&#10;QF4 3-1 1"
        ></textarea>
        <div class="row" style="margin-top: 8px;">
          <span class="spacer"></span>
          <button class="btn" @click="bulkPreview" :disabled="!bulkText.trim()">Previsualizar</button>
          <button class="btn primary" @click="bulkApply" :disabled="!bulkParsed.length || loading">
            Aplicar {{ bulkParsed.length }} resultado(s)
          </button>
        </div>
        <div v-if="bulkError" class="banner error" style="margin-top: 8px;">{{ bulkError }}</div>
        <ul v-if="bulkParsed.length" style="margin: 8px 0 0; padding-left: 20px; font-size: 13px;">
          <li v-for="r in bulkParsed" :key="r.matchId">
            <strong>{{ r.matchId }}</strong>: {{ r.home }}-{{ r.away }}
            <span class="muted">· {{ r.finished ? 'finalizado' : 'pendiente' }}</span>
          </li>
        </ul>
      </details>

      <div v-for="m in store.matches" :key="m.id" class="match-row" :class="{ 'has-result': isFinished(m.id) }">
        <span class="stage">{{ m.label }}</span>
        <span class="team">{{ m.home }}</span>
        <input
          type="number" min="0" max="30"
          :value="resultHome(m.id)"
          @input="setResult(m.id, 'home', $event.target.value)"
        />
        <input
          type="number" min="0" max="30"
          :value="resultAway(m.id)"
          @input="setResult(m.id, 'away', $event.target.value)"
        />
        <span class="team right">{{ m.away }}</span>
        <div class="row" style="justify-content: center; gap: 4px;">
          <button
            type="button"
            class="btn"
            :class="{ primary: isFinished(m.id) }"
            :disabled="!canFinish(m.id) || savingId === m.id"
            @click="saveResult(m.id, true)"
            :title="canFinish(m.id) ? '' : 'Carga los dos marcadores antes'"
          >Finalizado</button>
        </div>
      </div>

      <div class="row" style="margin-top: 12px;">
        <span class="muted" style="font-size: 13px;">Tip: marca cada partido como finalizado cuando termine el encuentro para actualizar el ranking.</span>
        <span class="spacer"></span>
        <button class="btn primary" :disabled="loading" @click="recalc">
          Recalcular tabla
        </button>
      </div>

      <h3 class="section-title" style="margin-top: 24px;">Inconsistencias</h3>
      <div v-if="!inconsistencies" class="muted" style="font-size: 13px;">Pulsa "Detectar inconsistencias" para auditar predicciones y resultados.</div>
      <div v-else>
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
        <details style="margin-top: 10px;">
          <summary class="muted" style="cursor: pointer; font-size: 13px;">Auditoría de reglas (4 escenarios de prueba)</summary>
          <div v-for="r in inconsistencies.ruleAudit" :key="r.scenario" style="margin-top: 8px; font-size: 13px;">
            <strong>{{ r.scenario }}:</strong>
            <span class="rule-pill">{{ r.result.rule || 'NONE' }}</span>
            {{ r.result.explanation }} → {{ r.result.points }} pts
            <span v-if="r.result.issues.length" class="text-dim"> · issues: {{ r.result.issues.length }}</span>
          </div>
        </details>
        <button class="btn" style="margin-top: 10px;" @click="loadInconsistencies" :disabled="loading">
          Volver a detectar
        </button>
      </div>
      <div style="margin-top: 6px;">
        <button v-if="!inconsistencies" class="btn" @click="loadInconsistencies" :disabled="loading">Detectar inconsistencias</button>
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
const savingId = ref('');
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
function canFinish(matchId) {
  const r = draftResult(matchId);
  return Number.isInteger(r.home) && Number.isInteger(r.away);
}

function setResult(matchId, side, val) {
  const v = val === '' ? null : Number(val);
  if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) return;
  const existing = store.resultsById.get(matchId) || { matchId, home: null, away: null, finished: false };
  const updated = { ...existing, home: side === 'home' ? v : existing.home, away: side === 'away' ? v : existing.away, finished: false };
  // Optimistic local update
  const idx = store.results.findIndex(r => r.matchId === matchId);
  if (idx >= 0) store.results[idx] = updated;
  else store.results.push(updated);
}

async function saveResult(matchId, markFinished) {
  savingId.value = matchId;
  try {
    const r = draftResult(matchId);
    const payload = { home: r.home, away: r.away, finished: markFinished ? true : r.finished };
    const out = await api.upsertResult(matchId, payload);
    const idx = store.results.findIndex(x => x.matchId === matchId);
    if (idx >= 0) store.results[idx] = out.result;
    await store.refreshResults();
    toast('Resultado guardado', 'good');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    savingId.value = '';
  }
}

async function refresh() {
  loading.value = true;
  try { await store.refreshAll(); }
  finally { loading.value = false; }
}

async function recalc() {
  loading.value = true;
  try {
    await store.refreshResults();
    toast('Tabla recalculada', 'good');
  } finally { loading.value = false; }
}

async function loadInconsistencies() {
  loading.value = true;
  try {
    inconsistencies.value = await api.adminInconsistencies();
  } catch (e) {
    toast(e.message, 'error');
  } finally { loading.value = false; }
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
  // Accepts "QF1 2-1 1" or "QF1 2-1"
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
