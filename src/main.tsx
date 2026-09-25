import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from '@/App'
import { applyTheme, useUIStore } from '@/store/uiStore'
import '@/index.css'

applyTheme(useUIStore.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Offline start: the service worker caches the app so the reloj checador opens with no Internet.
// Production only — in development it would serve stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    // Ask the browser not to evict the cached app and this device's stored identity when space is low.
    void navigator.storage?.persist?.()
  })
}
