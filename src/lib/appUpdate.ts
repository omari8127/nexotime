import { create } from 'zustand'

/**
 * Keeps an open page from staying on an old build.
 *
 * A browser only looks for a new service worker when the page is navigated to (or about once a day),
 * and a kiosk tablet is never navigated: it sits on /clock for weeks. A new build was downloaded and
 * activated in the background, yet the tablet kept running the old code in memory, and the settings
 * showed none of the new options. So the worker is asked for updates now and then, and when a new
 * one takes over, the page says so (the reloj reloads itself when nobody is clocking in).
 */
interface UpdateState {
  ready: boolean
}

export const useUpdateStore = create<UpdateState>(() => ({ ready: false }))

const CHECK_EVERY_MS = 5 * 60_000
let watching = false

export function watchForUpdates(registration: ServiceWorkerRegistration) {
  if (watching || !('serviceWorker' in navigator)) return
  watching = true
  // The very first install also changes the controller; that is not an update.
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) useUpdateStore.setState({ ready: true })
    hadController = true
  })

  const check = () => void registration.update().catch(() => undefined)
  window.setInterval(check, CHECK_EVERY_MS)
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  check()
}
