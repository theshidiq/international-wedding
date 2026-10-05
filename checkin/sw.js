// Offline support: once opened online, the check-in app keeps working without internet.
const CACHE = "ka26-checkin-v2";
const FILES = ["./", "index.html", "checkin.css?v=1", "checkin.js?v=1", "manifest.webmanifest",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Network first (always fresh when online), cache as fallback when offline.
// Only the app's own files and the QR library are handled; everything else goes straight to the network.
const OWN = (url) => url.origin === self.location.origin || url.href.startsWith("https://cdn.jsdelivr.net/npm/jsqr@");
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || !OWN(url)) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
