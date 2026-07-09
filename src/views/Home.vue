<template>
  <div class="grid two">
    <section class="card">
      <h2 class="section-title">
        Participantes
        <span class="meta">{{ store.participants.length }} registrados</span>
      </h2>

      <div v-if="!store.participants.length" class="empty">
        <h3>Aún no hay participantes</h3>
        <p>Crea el primero usando el formulario de la derecha.</p>
      </div>

      <div v-else class="list">
        <button
          v-for="(p, i) in store.participants"
          :key="p.id"
          class="participant"
          :class="rankClass(i)"
          @click="openModal(p)"
        >
          <span class="rank">#{{ i + 1 }}</span>
          <span class="name">{{ p.name }}</span>
          <span class="points">
            {{ totalFor(p.id) }}
            <small>puntos</small>
          </span>
        </button>
      </div>
    </section>

    <section>
      <PredictionForm @saved="onSaved" @cancel="cancelEdit" :editing="editing" />
    </section>
  </div>

  <ParticipantModal
    v-if="modalParticipant"
    :participant="modalParticipant"
    :matches="store.matches"
    :results="store.results"
    :leaderboard="store.leaderboard"
    @close="modalParticipant = null"
    @edit="startEdit"
    @delete="onDelete"
  />
</template>

<script setup>
import { ref, inject } from 'vue';
import { useDataStore } from '../store.js';
import PredictionForm from '../components/PredictionForm.vue';
import ParticipantModal from '../components/ParticipantModal.vue';

const store = useDataStore();
const toast = inject('toast');

const editing = ref(null);
const modalParticipant = ref(null);

function totalFor(id) {
  const row = store.leaderboard.find(r => r.id === id);
  return row ? row.total : 0;
}

function rankClass(i) {
  if (i === 0) return 'top1';
  if (i === 1) return 'top2';
  if (i === 2) return 'top3';
  return '';
}

function openModal(p) {
  modalParticipant.value = p;
}

function startEdit(p) {
  editing.value = p;
  modalParticipant.value = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editing.value = null;
}

async function onDelete(p) {
  if (!confirm(`¿Eliminar a ${p.name}? Sus predicciones se perderán.`)) return;
  try {
    await store.deleteParticipant(p.id);
    modalParticipant.value = null;
    toast('Participante eliminado', 'good');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function onSaved() {
  editing.value = null;
}
</script>
