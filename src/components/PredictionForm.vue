<template>
  <form class="card flex-col" @submit.prevent="onSubmit">
    <h2 class="section-title">
      {{ isEditing ? `Editar a ${editing.name}` : 'Nueva participación' }}
      <button v-if="isEditing" type="button" class="btn ghost" @click="$emit('cancel')">Cancelar</button>
    </h2>

    <div>
      <label>Nombre del participante</label>
      <input v-model="name" class="input" placeholder="Ej: Marta" maxlength="60" required />
    </div>

    <div>
      <label>Predicciones</label>
      <p class="muted" style="margin: 0 0 10px; font-size: 13px;">
        Para cada partido indica el <strong>marcador exacto</strong> y pulsa el botón del equipo que crees que clasifica.
      </p>

      <div v-for="m in store.matches" :key="m.id" class="match-row" :class="{ 'has-result': resultOf(m.id) }">
        <span class="stage">{{ m.label }}</span>
        <span class="team" :class="{ winner: pickFor(m.id) === 'home' }">
          {{ m.home }}
        </span>
        <input
          type="number" min="0" max="30"
          :value="getPred(m.id, 'home')"
          @input="setScore(m.id, 'home', $event.target.value)"
          :placeholder="'-'"
        />
        <input
          type="number" min="0" max="30"
          :value="getPred(m.id, 'away')"
          @input="setScore(m.id, 'away', $event.target.value)"
          :placeholder="'-'"
        />
        <span class="team right" :class="{ winner: pickFor(m.id) === 'away' }">
          {{ m.away }}
        </span>
        <div class="pick-toggle">
          <button
            type="button"
            :class="{ on: pickFor(m.id) === 'home' }"
            @click="setPick(m.id, 'home')"
          >{{ m.home }}</button>
          <button
            type="button"
            :class="{ on: pickFor(m.id) === 'away' }"
            @click="setPick(m.id, 'away')"
          >{{ m.away }}</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="banner error">{{ error }}</div>

    <div class="row">
      <span class="muted" style="font-size: 13px;">
        {{ Object.keys(predictions).length }} / {{ store.matches.length }} partidos con marcador
      </span>
      <span class="spacer"></span>
      <button class="btn primary" type="submit" :disabled="saving">
        {{ saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar' }}
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

const name = ref(props.editing?.name || '');
const predictions = reactive({}); // matchId -> { home, away, qualified }
const saving = ref(false);
const error = ref('');

const isEditing = computed(() => !!props.editing);

// Hydrate form on edit
if (props.editing) {
  for (const p of props.editing.predictions || []) {
    predictions[p.matchId] = { home: p.home ?? null, away: p.away ?? null, qualified: p.qualified || null };
  }
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
  // Only auto-pick if the user hasn't manually picked yet
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

function resultOf(matchId) {
  return store.resultsById.get(matchId);
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
      // Reset form
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
