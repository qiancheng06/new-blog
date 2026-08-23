const STATIC_CACHE = "persona-static-v1"
const PRECACHE_URLS = [
  "/offline",
  "/icons/persona-192.png",
  "/icons/persona-512.png",
  "/icons/persona-maskable-512.png",
  "/icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Persona and Next API responses always remain network-only.
  if (url.pathname.startsWith("/persona-api/") || url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")))
    return
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") void cache.put(request, response.clone())
      return response
    })
    .catch((error) => {
      if (cached) return cached
      throw error
    })
  return cached || network
}
