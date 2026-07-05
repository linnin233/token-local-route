import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import Overview from './views/Overview.vue';
import RequestLog from './views/RequestLog.vue';
import SpeedTest from './views/SpeedTest.vue';

const routes = [
  { path: '/', component: Overview },
  { path: '/requests', component: RequestLog },
  { path: '/speed', component: SpeedTest },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

const app = createApp(App);
app.use(router);
app.mount('#app');
