const CACHE_NAME = 'social-coletor-v4';
const OFFLINE_URL = '/offline.html';

// URLs para cache
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/script.js',
  '/js/send.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('✅ Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache aberto:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('🔄 Recursos em cache');
        return self.skipWaiting();
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('🔥 Service Worker ativado');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Cache atualizado');
      return self.clients.claim();
    })
  );
});

// Interceptar requisições
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // SEMPRE permitir POST requests para APIs externas
  if (event.request.method === 'POST') {
    console.log('📤 POST request permitido para:', url.origin);
    return;
  }
  
  // Permitir requests para APIs externas (OCR, Google Sheets)
  if (url.origin !== self.location.origin) {
    console.log('🌐 Request externo permitido:', url.href);
    return fetch(event.request);
  }
  
  // Estratégia: Cache First, depois Network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('📦 Servindo do cache:', event.request.url);
          return response;
        }
        
        return fetch(event.request)
          .then(response => {
            // Não cachear se não for bem sucedido
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
                console.log('➕ Adicionado ao cache:', event.request.url);
              });
            
            return response;
          })
          .catch(error => {
            console.log('❌ Fetch falhou:', error);
            // Se offline e tentando acessar página, mostrar offline
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            return new Response('Offline', { 
              status: 503, 
              statusText: 'Service Unavailable' 
            });
          });
      })
  );
});

// Mensagens do app principal
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Sincronização em background (para dados offline)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-data') {
    console.log('🔄 Sincronizando dados offline...');
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  // Implementação da sincronização
  console.log('📡 Sincronizando...');
  return Promise.resolve();
}
