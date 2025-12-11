/**
 * SOCIAL COLETOR - SERVICE WORKER OTIMIZADO
 * Com auto-update e melhor controle de cache
 */

const CACHE_NAME = 'social-coletor-v2.0';
const API_CACHE = 'social-coletor-api-v1';
const OFFLINE_PAGE = '/index.html';

// Assets que devem ser cacheados na instalação
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/send.js',
  '/manifest.json',
  '/logo.png',
  'https://unpkg.com/tesseract.js@v4.0.2/dist/tesseract.min.js'
];

// URLs que NÃO devem ser cacheadas
const IGNORE_LIST = [
  'chrome-extension',
  'favicon.ico',
  'script.google.com',  // API do Google
  'ocr.space',         // API do OCR
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cloudflare',
  'unpkg.com/tesseract'  // Já está em CACHE_ASSETS
];

// ================================
// INSTALAÇÃO
// ================================
self.addEventListener('install', event => {
  console.log("🔧 Service Worker: Instalando v2.0...");
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("📦 Cacheando recursos essenciais...");
        // Usar cache.addAll() mas com tratamento de erro individual
        return Promise.all(
          CACHE_ASSETS.map(asset => {
            return cache.add(asset).catch(err => {
              console.warn(`⚠️ Não foi possível cachear: ${asset}`, err);
              return null;
            });
          })
        );
      })
      .then(() => {
        console.log("✅ Instalação completa!");
        // Ativar imediatamente o novo service worker
        return self.skipWaiting();
      })
      .catch(err => console.error('❌ Erro na instalação:', err))
  );
});

// ================================
// ATIVAÇÃO (Auto-update)
// ================================
self.addEventListener('activate', event => {
  console.log("🚀 Service Worker: Ativando v2.0...");
  
  event.waitUntil(
    Promise.all([
      // Limpar caches antigos
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME && cache !== API_CACHE) {
              console.log(`🗑️ Removendo cache antigo: ${cache}`);
              return caches.delete(cache);
            }
          })
        );
      }),
      
      // Tomar controle imediato de todas as abas
      self.clients.claim()
    ]).then(() => {
      console.log("✅ Service Worker ativado e pronto!");
      
      // Enviar mensagem para todas as abas informando sobre o update
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: '2.0',
            timestamp: new Date().toISOString()
          });
        });
      });
    })
  );
});

// ================================
// FETCH (Estratégia Cache First com Network Fallback)
// ================================
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Ignorar requisições da lista de ignore
  if (IGNORE_LIST.some(item => url.includes(item))) {
    return;
  }
  
  // Para APIs, usar Network First
  if (url.includes('script.google.com') || url.includes('ocr.space')) {
    event.respondWith(apiFirstStrategy(event));
    return;
  }
  
  // Para navegação, servir a página offline se falhar
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationStrategy(event));
    return;
  }
  
  // Para assets estáticos, usar Cache First
  event.respondWith(cacheFirstStrategy(event));
});

// ================================
// ESTRATÉGIAS DE CACHE
// ================================
async function cacheFirstStrategy(event) {
  try {
    // Primeiro tenta do cache
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      // console.log(`📦 Cache hit: ${event.request.url}`);
      return cachedResponse;
    }
    
    // Se não tem no cache, busca na rede
    // console.log(`🌐 Network: ${event.request.url}`);
    const networkResponse = await fetch(event.request);
    
    // Clona a resposta para cachear
    const responseToCache = networkResponse.clone();
    
    // Abre o cache e armazena a resposta
    const cache = await caches.open(CACHE_NAME);
    cache.put(event.request, responseToCache).catch(err => {
      console.warn(`⚠️ Não foi possível cachear: ${event.request.url}`, err);
    });
    
    return networkResponse;
    
  } catch (error) {
    console.error(`❌ Erro em cacheFirstStrategy: ${error.message}`);
    
    // Fallback: tenta servir a página offline
    if (event.request.mode === 'navigate') {
      const offlinePage = await caches.match(OFFLINE_PAGE);
      if (offlinePage) return offlinePage;
    }
    
    return new Response('Offline - Recursos não disponíveis', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function apiFirstStrategy(event) {
  try {
    // Tenta primeiro na rede para APIs
    const networkResponse = await fetch(event.request);
    
    // Clona para cache (só se for sucesso)
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      const responseToCache = networkResponse.clone();
      cache.put(event.request, responseToCache).catch(err => {
        console.warn(`⚠️ Não foi possível cachear API: ${event.request.url}`, err);
      });
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log(`🌐 API offline, tentando cache: ${event.request.url}`);
    
    // Se falhou na rede, tenta do cache
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response(JSON.stringify({
      error: 'API offline',
      message: 'Sem conexão e sem dados em cache'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function navigationStrategy(event) {
  try {
    // Primeiro tenta na rede para páginas
    const networkResponse = await fetch(event.request);
    
    // Atualiza o cache com a nova versão
    const cache = await caches.open(CACHE_NAME);
    const responseToCache = networkResponse.clone();
    cache.put(event.request, responseToCache).catch(err => {
      console.warn(`⚠️ Não foi possível cachear página: ${event.request.url}`, err);
    });
    
    return networkResponse;
    
  } catch (error) {
    console.log(`📄 Navegação offline, servindo página cacheadas`);
    
    // Serve a página offline do cache
    const cachedPage = await caches.match(OFFLINE_PAGE);
    if (cachedPage) {
      return cachedPage;
    }
    
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Social Coletor - Offline</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: #f5f5f5;
            margin: 0;
          }
          .offline-container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          h1 { color: #666; }
          p { color: #999; }
        </style>
      </head>
      <body>
        <div class="offline-container">
          <h1>📡 Sem Conexão</h1>
          <p>Você está offline. Reconecte-se para usar o Social Coletor.</p>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// ================================
// SYNC BACKGROUND (para envios offline)
// ================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-data') {
    console.log('🔄 Background Sync: Sincronizando dados pendentes...');
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  try {
    // Aqui você implementaria a sincronização dos dados pendentes
    // usando IndexedDB ou localStorage
    console.log('✅ Background sync concluído');
  } catch (error) {
    console.error('❌ Erro no background sync:', error);
  }
}

// ================================
// MENSAGENS DO CLIENT
// ================================
self.addEventListener('message', event => {
  console.log('📨 Mensagem do client:', event.data);
  
  switch(event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting().then(() => {
        console.log('⏩ Service Worker pulou espera');
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        console.log('🗑️ Cache limpo a pedido do usuário');
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      });
      break;
      
    case 'CHECK_UPDATE':
      // Forçar check de atualização
      self.registration.update().then(() => {
        console.log('🔍 Update check realizado');
      });
      break;
      
    case 'GET_CACHE_INFO':
      caches.open(CACHE_NAME).then(cache => {
        cache.keys().then(keys => {
          event.source.postMessage({
            type: 'CACHE_INFO',
            count: keys.length,
            keys: keys.map(k => k.url)
          });
        });
      });
      break;
  }
});

// ================================
// PUSH NOTIFICATIONS
// ================================
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const title = data.title || 'Social Coletor';
  const body = data.body || 'Nova atualização disponível';
  const icon = data.icon || '/logo.png';
  const badge = data.badge || '/logo.png';
  
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      vibrate: [200, 100, 200],
      data: data.url || '/'
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data || '/');
      }
    })
  );
});

// ================================
// AUTO-UPDATE PERIÓDICO
// ================================
// Verificar atualizações periodicamente (a cada 24h)
setInterval(() => {
  self.registration.update().catch(err => {
    console.warn('⚠️ Auto-update falhou:', err);
  });
}, 24 * 60 * 60 * 1000); // 24 horas

// ================================
// CHECK DE ATUALIZAÇÃO NA INSTALAÇÃO
// ================================
self.addEventListener('controllerchange', () => {
  console.log('🔄 Controller change detectado - nova versão disponível');
  
  // Enviar mensagem para recarregar a página
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NEW_VERSION_AVAILABLE',
        action: 'reload',
        message: 'Nova versão carregada! Atualizando...'
      });
    });
  });
});

console.log("👷 Service Worker v2.0 carregado com auto-update!");
