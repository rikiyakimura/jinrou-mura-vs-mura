const CACHE_NAME = 'jinrou-v2';

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// キャッシュ優先、バックグラウンドで更新
self.addEventListener('fetch', (event) => {
  // API呼び出しはキャッシュしない
  if (event.request.url.includes('supabase')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // キャッシュがあれば即座に返す
      const fetchPromise = fetch(event.request).then((response) => {
        // 成功したらキャッシュを更新
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
