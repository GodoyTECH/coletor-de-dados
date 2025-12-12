/**
 * SOCIAL COLETOR - SERVICE WORKER CORRIGIDO
 * Não tenta cachear requisições POST
 */

const CACHE_NAME = 'social-coletor-' + Date.now();

self.addEventListener('install', event => {
  console.log("🔧 Service Worker instalado");
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log("🚀 Service Worker ativado");
  event.waitUntil(self.clients.claim());
});

// ESTRATÉGIA SIMPLES - NUNCA CACHEAR POST
self.addEventListener('fetch', event => {
  const request = event.request;
  
  // BLOQUEAR CACHE PARA REQUISIÇÕES POST
  if (request.method === 'POST') {
    // Apenas passar adiante, sem cache
    event.respondWith(fetch(request));
    return;
  }
  
  // Para navegação, tentar rede primeiro
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  
  // Para outros GET, cache como fallback
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request))
  );
});

// Background Sync simplificado
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-data') {
    console.log('🔁 Sync acionado');
    // Apenas notificar a página para sincronizar
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_DATA' });
        });
      })
    );
  }
});

console.log("👷 Service Worker carregado - Sem cache POST");
