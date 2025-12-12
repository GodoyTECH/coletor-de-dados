const CACHE_NAME = 'social-coletor-v1.0';
const OFFLINE_URL = '/offline.html';

// Arquivos estáticos para cache (sem index.html!)
const urlsToCache = [
  '/css/styles.css',
  '/js/script.js',
  '/js/send.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  OFFLINE_URL
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('📦 Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('📁 Cache aberto:', CACHE_NAME);
      return cache.addAll(urlsToCache);
    })
  );

  // Atualizar imediatamente
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('🔥 Ativando Service Worker...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );

  self.clients.claim();
});

// Interceptar requisições
self.addEventListener('fetch', event => {
  const req = event.request;

  // POST → Não intercepta
  if (req.method === 'POST') {
    return;
  }

  const url = new URL(req.url);

  // Pedidos externos → sempre rede
  if (url.origin !== self.location.origin) {
    return event.respondWith(fetch(req));
  }

  // Navegação (HTML) → NETWORK FIRST
  if (req.mode === 'navigate') {
    return event.respondWith(
      fetch(req)
        .then(response => response)
        .catch(() => caches.match(OFFLINE_URL))
    );
  }

  // Arquivos estáticos → Cache First
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(response => {
        if (!response || response.status !== 200) {
          return response;
        }

        const clone = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(req, clone);
        });

        return response;
      });
    })
  );
});

// Receber mensagens do app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// (Opcional) Sincronização em background
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  console.log('🔄 Sincronizando dados offline...');
  return Promise.resolve();
}

