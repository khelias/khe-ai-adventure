// The dev server has no worker, so `npm run dev` always shows the current code.
export function registerWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((error: unknown) => {
      console.warn('Service worker registration failed', error)
    })
  })
}
