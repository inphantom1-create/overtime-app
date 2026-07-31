/* ============================================================
   서비스워커 (PWA 오프라인 캐싱)
   sw.js

   캐싱 전략: Cache First (정적 자산) + Network First (API)
   ============================================================ */

const CACHE_NAME = 'overtime-v1.0.0';

/** 캐싱할 정적 파일 목록 */
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
];

/* ── 설치: 정적 자산 캐싱 ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // 즉시 활성화
  );
});

/* ── 활성화: 구버전 캐시 삭제 ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── 패치: 캐시 우선, API는 네트워크 우선 ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Google Apps Script API 호출은 항상 네트워크
  if (url.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 정적 자산: 캐시 우선
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
