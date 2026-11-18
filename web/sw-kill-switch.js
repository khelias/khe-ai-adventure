// Withdraws the installed app's worker (estate ADR-041 point 4); AGENTS.md "Kill-switch" has
// the procedure. It does not reload open windows, so a game in progress keeps running.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('adventure-shell-')) await caches.delete(name)
    }
    await self.registration.unregister()
  })())
})
