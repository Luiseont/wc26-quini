import { defineStore } from 'pinia';
import { api } from './api.js';

export const useDataStore = defineStore('data', {
  state: () => ({
    matches: [],
    participants: [],
    results: [],
    leaderboard: [],
    health: null,
    loading: false,
    error: '',
  }),
  getters: {
    finishedCount: (s) => s.results.filter(r => r.finished).length,
    resultsById: (s) => new Map(s.results.map(r => [r.matchId, r])),
    matchesById: (s) => new Map(s.matches.map(m => [m.id, m])),
    participantsById: (s) => new Map(s.participants.map(p => [p.id, p])),
  },
  actions: {
    async refreshAll() {
      this.loading = true;
      this.error = '';
      try {
        const [matches, results, participants, board, health] = await Promise.all([
          api.matches(),
          api.results(),
          api.participants(),
          api.leaderboard(),
          api.health().catch(() => null),
        ]);
        this.matches = matches.matches;
        this.results = results.results;
        this.participants = participants.participants;
        this.leaderboard = board.leaderboard;
        this.health = health;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    async refreshResults() {
      const [results, board] = await Promise.all([api.results(), api.leaderboard()]);
      this.results = results.results;
      this.leaderboard = board.leaderboard;
    },
    async refreshParticipants() {
      const [p, board] = await Promise.all([api.participants(), api.leaderboard()]);
      this.participants = p.participants;
      this.leaderboard = board.leaderboard;
    },
    async createParticipant(payload) {
      const r = await api.createParticipant(payload);
      this.participants.push(r.participant);
      await this.refreshParticipants();
      return r.participant;
    },
    async updateParticipant(id, payload) {
      const r = await api.updateParticipant(id, payload);
      await this.refreshParticipants();
      return r.participant;
    },
    async deleteParticipant(id) {
      await api.deleteParticipant(id);
      await this.refreshParticipants();
    },
  },
});
