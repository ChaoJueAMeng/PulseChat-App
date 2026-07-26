import { createSSRApp } from 'vue'
import App from './App.vue'
import { createPiniaLikeStore } from './store/index.js'
import { installFeedback } from './utils/feedback.js'

export function createApp() {
  installFeedback()
  const app = createSSRApp(App)
  const store = createPiniaLikeStore()
  app.config.globalProperties.$store = store
  app.provide('store', store)
  return { app }
}
