// service-worker.js - Social Coletor PWA
// ======================================

const APP_VERSION = '2.2.0';
const CACHE_NAME = `social-coletor-${APP_VERSION}`;

// Arquivos para cache (App Shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/send.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ================================
// INSTALAÇÃO
// ================================
self.addEventListener('install', (event) => {
  console.log(`👷 Service Worker ${APP_VERSION} instalando...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Cache aberto:', CACHE_NAME);
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('✅ App Shell cacheado com sucesso');
        return self.skipWaiting();
      })
  );
});

// ================================
// ATIVAÇÃO
// ================================
self.addEventListener('activate', (event) => {
  console.log('🔥 Service Worker ativando...');
  
  event.waitUntil(
    Promise.all([
      // Limpar caches antigos
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName.startsWith('social-coletor-')) {
              console.log('🗑️ Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Tomar controle de todas as tabs abertas
      self.clients.claim()
    ])
    .then(() => {
      console.log(`✅ Service Worker ${APP_VERSION} ativado e pronto!`);
    })
  );
});

// ================================
// INTERCEPTAÇÃO DE REQUESTS
// ================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ignorar requisições que não são GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignorar APIs externas
  if (url.href.includes('ocr.space') || url.href.includes('google.com')) {
    return fetch(event.request);
  }
  
  // Para arquivos locais, usar estratégia Cache First com Network Fallback
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Se tem no cache, retornar
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Se não tem, buscar na rede
        return fetch(event.request)
          .then((networkResponse) => {
            // Se a resposta é válida, cachear
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Se offline e não tem no cache, retornar fallback para navegação
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Recurso não disponível offline');
          });
      })
  );
});

// ================================
// BACKGROUND SYNC
// ================================
self.addEventListener('sync', (event) => {
  console.log('🔄 Sync event:', event.tag);
  
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  console.log('📡 Service Worker: Sincronização offline iniciada');
  
  // Notificar o app principal para fazer a sincronização
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_OFFLINE_DATA',
      timestamp: new Date().toISOString()
    });
  });
}

// ================================
// MESSAGING
// ================================
self.addEventListener('message', (event) => {
  console.log('📩 Mensagem recebida do app:', event.data);
  
  const { type } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      });
      break;
  }
});

// ================================
// FUNÇÕES AUXILIARES
// ================================
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('🧹 Todos os caches foram limpos');
}

// Verificar atualizações periodicamente (a cada 30 minutos)
if (self.registration && self.registration.update) {
  setInterval(() => {
    self.registration.update();
  }, 30 * 60 * 1000);
}

console.log(`🚀 Service Worker ${APP_VERSION} carregado e pronto!`);
