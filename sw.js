// Service worker Trackline: aplikasi bisa dibuka offline setelah pernah dimuat sekali.
const VERSION = 'v4';
const APP_CACHE = 'trackline-app-' + VERSION;
const TILE_CACHE = 'trackline-tiles';
const MAX_TILES = 600; // batas jumlah petak peta yang disimpan

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './lib/leaflet/leaflet.js',
  './lib/leaflet/leaflet.css',
  './lib/leaflet/images/layers.png',
  './lib/leaflet/images/layers-2x.png',
  './lib/leaflet/images/marker-icon.png',
  './lib/leaflet/images/marker-icon-2x.png',
  './lib/leaflet/images/marker-shadow.png',
  './lib/fonts/big-shoulders-display-latin-700-normal.woff2',
  './lib/fonts/big-shoulders-display-latin-800-normal.woff2',
  './lib/fonts/instrument-sans-latin-400-normal.woff2',
  './lib/fonts/instrument-sans-latin-600-normal.woff2',
  './lib/fonts/instrument-sans-latin-700-normal.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('trackline-app-') && k !== APP_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isTile(url) {
  return url.hostname === 'server.arcgisonline.com' && url.pathname.includes('/tile/');
}

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
  }
}

// Petak peta: pakai simpanan jika ada, jika tidak ambil dari jaringan lalu simpan.
// Hanya respons CORS yang disimpan (respons "opaque" memakan kuota penyimpanan besar).
async function handleTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  try {
    const res = await fetch(request.url, { mode: 'cors' });
    if (res.ok) {
      cache.put(request.url, res.clone()).then(() => trimTiles(cache)).catch(() => {});
      return res;
    }
  } catch (e) { /* server tanpa CORS atau sedang offline */ }
  try {
    return await fetch(request); // tampil saja tanpa disimpan
  } catch (e) {
    return Response.error();
  }
}

// File aplikasi: tampilkan simpanan dulu (cepat, bisa offline), perbarui di latar belakang.
async function handleApp(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const res = await network;
  if (res) return res;
  if (request.mode === 'navigate') return cache.match('./index.html');
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isTile(url)) {
    event.respondWith(handleTile(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(handleApp(request));
  }
});
