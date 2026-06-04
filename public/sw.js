/*
 * 하루치 PWA Service Worker
 *
 * 캐싱 전략 (Caching Strategy)
 *  - precache              : 앱 셸 / 매니페스트 / 아이콘 (install 시)
 *  - cache-first           : /_next/static/* (해시된 immutable 정적 자산)
 *  - network-first         : 페이지 HTML 문서 (오프라인 대비 캐시 fallback)
 *  - stale-while-revalidate: 기타 동일 출처 GET (구글 폰트 등 cross-origin 포함)
 *  - network-only          : /api/*, supabase 통신 (항상 최신)
 *
 * 이 SW 파일은 자동 등록되지 않는다. 등록하려면 클라이언트 어딘가에서
 *   navigator.serviceWorker.register("/sw.js")
 * 를 호출하거나, 별도 PwaInstaller 컴포넌트를 추가해서 사용한다.
 *
 * localhost / 127.0.0.1 등 개발 환경에서는 SW 자체를 사용하지 않는다.
 *  (dev 서버가 /_next/static/* 청크에 ?v=<timestamp>를 매 빌드마다 새로 발급
 *   → SW가 캐시한 옛 URL을 fetch하면 ERR_FAILED)
 * 또한 이미 등록되어 망가져 있는 옛 SW를 만나도 다음 새로고침 한 번에
 * 자가 폐기되도록 install 시 모든 캐시를 비우고 unregister 한다.
 */

const isDevHost =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname.endsWith(".local");

if (isDevHost) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        } catch (e) {
          // ignore
        }
        try {
          await self.registration.unregister();
        } catch (e) {
          // ignore
        }
        try {
          const clients = await self.clients.matchAll({ type: "window" });
          clients.forEach((client) => {
            try {
              client.navigate(client.url);
            } catch (e) {
              // ignore
            }
          });
        } catch (e) {
          // ignore
        }
      })(),
    );
  });

  // fetch listener를 등록하지 않음 → 모든 요청은 SW를 우회하여 네트워크 직행
} else {

// v1.1.0 (2026-06-04): adultSignIn/Up 영어 에러 한글화 + URL sanitize 적용.
//   기존 PWA 클라이언트가 옛 JS 번들을 잡고 있어서 "Invalid path specified in
//   request URL" 같은 영어 메시지가 그대로 떨어지는 사례가 있었다. 버전을
//   올려 SW 가 새 캐시 키를 쓰면, activate 단계의 정리 로직이 옛 캐시를
//   삭제해 다음 새로고침에서 새 번들을 받게 된다.
const CACHE_VERSION = "v1.1.0";
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME_STATIC = `static-${CACHE_VERSION}`;
const RUNTIME_PAGES = `pages-${CACHE_VERSION}`;
const RUNTIME_OTHER = `other-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/bible-reading",
  "/manifest.json",
  "/logo.svg",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/apple-touch-icon.svg",
];

const OFFLINE_FALLBACK = "/bible-reading";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache
              .add(new Request(url, { cache: "reload" }))
              .catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const allowed = new Set([PRECACHE, RUNTIME_STATIC, RUNTIME_PAGES, RUNTIME_OTHER]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !allowed.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiOrDynamic(url) {
  if (url.pathname.startsWith("/api/")) return true;
  if (url.hostname.endsWith("supabase.co")) return true;
  if (url.hostname.endsWith("supabase.in")) return true;
  return false;
}

function isCacheableScheme(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

function safeCachePut(cache, request, response) {
  try {
    let reqUrl;
    try {
      reqUrl = new URL(request.url);
    } catch (e) {
      return;
    }
    if (!isCacheableScheme(reqUrl)) return;
    if (!response || response.status !== 200) return;
    if (response.type === "opaque" || response.type === "error") return;
    cache.put(request, response).catch(() => undefined);
  } catch (e) {
    // ignore
  }
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".css")
  );
}

function isHtmlNavigation(request, url) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") && url.origin === self.location.origin;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    safeCachePut(cache, request, response.clone());
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    safeCachePut(cache, request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await caches.match(OFFLINE_FALLBACK);
    if (fallback) return fallback;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      safeCachePut(cache, request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await networkPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  if (!isCacheableScheme(url)) return;

  if (isApiOrDynamic(url)) {
    return;
  }

  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/") &&
    url.search
  ) {
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_OTHER));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_STATIC));
    return;
  }

  if (isHtmlNavigation(request, url)) {
    event.respondWith(networkFirst(request, RUNTIME_PAGES));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_OTHER));
});

} // end of production-only block
