import './assets/main.css'

import { createApp } from 'vue'
import 'element-plus/dist/index.css'
import '@/assets/dark.css';

import ConferenceApp from './ConferenceApp.vue'

const app = createApp(ConferenceApp)
app.mount('#app')
