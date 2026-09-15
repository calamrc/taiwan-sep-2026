const CACHE = "taiwan-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./logic.js",
  "./styles.css",
  "./itinerary.json",
  "./manifest.json",
  "./icon.svg",
  "./fonts/outfit.woff2",
];

function precache() {
  return caches.open(CACHE).then((cache) =>
    Promise.all(
      ASSETS.map((url) =>
        fetch(url, { cache: "reload" })
          .then((res) => (res.ok ? cache.put(url, res) : null))
          .catch(() => null)
      )
    )
  );
}

function dropOldCaches() {
  return caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
  );
}

function reloadWindows() {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windows) => Promise.all(windows.map((client) => client.navigate(client.url))));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    dropOldCaches()
      .then(() => self.clients.claim())
      .then(reloadWindows)
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res.ok || !cached ? res : cached;
        })
        .catch(() => cached)
    )
  );
});
