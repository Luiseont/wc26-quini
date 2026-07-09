import { createRouter, createWebHistory } from 'vue-router';
import Home from './views/Home.vue';
import Leaderboard from './views/Leaderboard.vue';
import Admin from './views/Admin.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/leaderboard', component: Leaderboard },
    { path: '/admin', component: Admin },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
