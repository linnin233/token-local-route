import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import Overview from './views/Overview.vue';
import RequestLog from './views/RequestLog.vue';
import Config from './views/Config.vue';

const routes = [
  { path: '/', component: Overview },
  { path: '/requests', component: RequestLog },
  { path: '/config', component: Config },
];

const router = createRouter({ history: createWebHashHistory(), routes });
createApp(App).use(router).mount('#app');
