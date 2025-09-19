const CACHE_NAME = "recorder-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "icon.png",
  "/style.css",
  "/script.js",
  "/manifest.json"
];

// Cài đặt service worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Kích hoạt service worker (xóa cache cũ nếu có)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
});

// Intercept request và phục vụ từ cache nếu offline
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((resp) => resp || fetch(event.request))
  );
});
