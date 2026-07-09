<template>
  <form class="flex-col" @submit.prevent="onSubmit">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <div>
        <div class="section-eyebrow">Tu boleta</div>
        <h2 class="section-h1" style="font-size:22px;">{{ isEditing ? `Editar a ${editing.name}` : 'Predicciones' }}</h2>
      </div>
      <button v-if="isEditing" type="button" class="btn ghost" @click="$emit('cancel')">Cancelar</button>
    </div>

    <div>
      <label>Nombre del participante</label>
      <input v-model="name" class="input" placeholder="Ej: Marta" maxlength="60" required />
    </div>

    <div v-for="stage in stages" :key="stage.code" class="match-list">
      <div class="match-stage-header">
        <span>{{ stage.label }} · {{ stageMatches(stage.code).length }} partidos</span>
        <span class="dates">{{ stage.dates }}</span>
      </div>
      <div
        v-for="m in stageMatches(stage.code)"
        :key="m.id"
        class="match-row"
        :class="{ 'has-source': m.home.startsWith('W') || m.away.startsWith('W') }"
      >
        <span class="id">{{ m.id }}</span>
        <span class="team right">{{ m.home }}</span>
        <input
          type="number" min="0" max="30"
          :value="getPred(m.id, 'home')"
          @input="setScore(m.id, 'home', $event.target.value)"
          :placeholder="'-'"
        />
        <span class="vs">VS</span>
        <input
          type="number" min="0" max="30"
          :value="getPred(m.id, 'away')"
          @input="setScore(m.id, 'away', $event.target.value)"
          :placeholder="'-'"
        />
        <span class="team">{{ m.away }}</span>
        <div class="classified-pills">
          <button
            type="button"
            class="pill"
            :class="{ on: pickFor(m.id) === 'home' }"
            @click="setPick(m.id, 'home')"
          ><span class="check">{{ pickFor(m.id) === 'home' ? '✓' : '○' }}</span> {{ m.home }}</button>
          <button
            type="button"
            class="pill"
            :class="{ on: pickFor(m.id) === 'away' }"
            @click="setPick(m.id, 'away')"
          ><span class="check">{{ pickFor(m.id) === 'away' ? '✓' : '○' }}</span> {{ m.away }}</button>
        </div>
        <span class="max">MAX 8</span>
      </div>
    </div>

    <div v-if="error" class="banner error">{{ error }}</div>

    <div class="form-footer">
      <span class="progress">
        <strong>{{ Object.keys(predictions).length }}</strong> / {{ store.matches.length }} cargados
        <span class="potential">MAX POTENCIAL: {{ maxPotential }} PTS</span>
      </span>
      <button type="button" class="btn" @click="clearAll">Limpiar</button>
      <button class="btn primary" type="submit" :disabled="saving">
        {{ saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Confirmar boleta' }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref, computed, inject } from 'vue';
import { useDataStore } from '../store.js';

const props = defineProps({ editing: Object });
const emit = defineEmits(['saved', 'cancel']);

const store = useDataStore();
const toast = inject('toast');

const stages = [
  { code: 'QF', label: 'Cuartos de final', dates: '11-12 JUL' },
  { code: 'SF', label: 'Semifinales', dates: '15-16 JUL' },
  { code: 'F',  label: 'Final', dates: '19 JUL' },
];

const name = ref(props.editing?.name || '');
const predictions = reactive({});
const saving = ref(false);
const error = ref('');

const isEditing = computed(() => !!props.editing);
const maxPotential = computed(() => Object.keys(predictions).length * 8);

if (props.editing) {
  for (const p of props.editing.predictions || []) {
    predictions[p.matchId] = { home: p.home ?? null, away: p.away ?? null, qualified: p.qualified || null };
  }
}

// Resolve "WQF1"/"WSF1" placeholders against the user's CURRENT predictions
// for the source match. Falls back to the placeholder text if the user
// hasn't predicted that source match yet.
function resolveTeamForUser(team) {
  if (typeof team !== 'string' || !team.startsWith('W') || team.length < 3) return team;
  const sourceMatchId = team.slice(1);
  const sourceMatch = store.matches.find(m => m.id === sourceMatchId);
  if (!sourceMatch) return team;
  const pred = predictions[sourceMatchId];
  if (!pred) return team;
  let side = null;
  if (pred.qualified === 'home' || pred.qualified === 'away') {
    side = pred.qualified;
  } else if (pred.home != null && pred.away != null) {
    if (pred.home > pred.away) side = 'home';
    else if (pred.away > pred.home) side = 'away';
  }
  if (!side) return team;
  return side === 'home' ? sourceMatch.home : sourceMatch.away;
}

// Same as stageMatches but with team names resolved against user's predictions.
const resolvedMatches = computed(() =>
  store.matches.map(m => ({
    ...m,
    home: resolveTeamForUser(m.home),
    away: resolveTeamForUser(m.away),
  }))
);

function stageMatches(code) {
  return resolvedMatches.value.filter(m => m.stage === code);
}

function getPred(matchId, key) {
  return predictions[matchId]?.[key] ?? '';
}

function setScore(matchId, key, val) {
  const v = val === '' ? null : Number(val);
  if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) return;
  if (!predictions[matchId]) predictions[matchId] = { home: null, away: null, qualified: null };
  predictions[matchId][key] = v;
  autoPickFromScore(matchId);
}

function autoPickFromScore(matchId) {
  const p = predictions[matchId];
  if (!p) return;
  if (p.qualified) return;
  if (p.home != null && p.away != null) {
    if (p.home > p.away) p.qualified = 'home';
    else if (p.away > p.home) p.qualified = 'away';
  }
}

function setPick(matchId, side) {
  if (!predictions[matchId]) predictions[matchId] = { home: null, away: null, qualified: null };
  predictions[matchId].qualified = side;
}

function pickFor(matchId) {
  return predictions[matchId]?.qualified;
}

function clearAll() {
  for (const k of Object.keys(predictions)) delete predictions[k];
  name.value = '';
}

async function onSubmit() {
  error.value = '';
  if (!name.value.trim()) { error.value = 'El nombre es obligatorio'; return; }
  const list = store.matches.map(m => {
    const p = predictions[m.id];
    if (!p) return { matchId: m.id };
    const out = { matchId: m.id };
    if (Number.isInteger(p.home)) out.home = p.home;
    if (Number.isInteger(p.away)) out.away = p.away;
    if (p.qualified === 'home' || p.qualified === 'away') out.qualified = p.qualified;
    return out;
  });

  saving.value = true;
  try {
    if (isEditing.value) {
      await store.updateParticipant(props.editing.id, { name: name.value, predictions: list });
      toast('Predicciones actualizadas', 'good');
    } else {
      await store.createParticipant({ name: name.value, predictions: list });
      toast('Participante registrado', 'good');
      name.value = '';
      for (const k of Object.keys(predictions)) delete predictions[k];
    }
    emit('saved');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>
