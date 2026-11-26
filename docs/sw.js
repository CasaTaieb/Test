// Shell: cache first. Lessons data: network first, cache fallback (offline).
var CACHE = "hm-v2";
var SHELL = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "fonts/frank-ruhl-libre-hebrew-400-normal.woff2",
  "fonts/frank-ruhl-libre-hebrew-500-normal.woff2",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/data/lecons.json") || url.pathname.endsWith("app.js") || url.pathname.endsWith("styles.css") || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
    e.respondWith(fetch(e.request).then(function (r) {
      var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
});
