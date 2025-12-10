/**
 * SOCIAL COLETOR - SERVICE WORKER
 * Responsável pelo cache e funcionalidade offline
 */

// Nome da cache e versão
const CACHE_NAME = 'social-coletor-v1.0';
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

// ============================================
// INSTALAÇÃO DO SERVICE WORKER
// ============================================

/**
 * Evento de instalação - cache dos assets estáticos
 */
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Cache aberto, adicionando assets...');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => {
        console.log('✅ Todos os assets em cache');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Falha ao cachear assets:', error);
      })
  );
});

// ============================================
// ATIVAÇÃO DO SERVICE WORKER
// ============================================

/**
 * Evento de ativação - limpeza de caches antigos
 */
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker ativado');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑️ Removendo cache antigo: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Caches antigos removidos');
      return self.clients.claim();
    })
  );
});

// ============================================
 // INTERCEPTAÇÃO DE REQUISIÇÕES
// ============================================

/**
 * Evento de fetch - estratégia Cache First com fallback para rede
 */
self.addEventListener('fetch', (event) => {
  // Ignorar requisições para o Apps Script (devem sempre ir para a rede)
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Retornar resposta do cache se disponível
        if (cachedResponse) {
          console.log('📦 Servindo do cache:', event.request.url);
          return cachedResponse;
        }
        
        // Se não estiver no cache, buscar da rede
        console.log('🌐 Buscando da rede:', event.request.url);
        return fetch(event.request)
          .then((networkResponse) => {
            // Se a resposta é válida, adicionar ao cache
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
                console.log('✅ Adicionado ao cache:', event.request.url);
              });
            
            return networkResponse;
          })
          .catch(() => {
            // Fallback para página offline se a rede falhar
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // Para outros recursos, retornar mensagem de erro
            return new Response('Conecte-se à internet para usar este recurso.', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// ============================================
 // SINCRONIZAÇÃO EM SEGUNDO PLANO
// ============================================

/**
 * Evento de sync - para sincronizar dados quando online
 */
self.addEventListener('sync', (event) => {
  console.log('🔄 Sincronização em segundo plano:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncPendingData());
  }
});

/**
 * Sincroniza dados pendentes
 */
async function syncPendingData() {
  console.log('🔄 Sincronizando dados pendentes...');
  
  // Aqui você implementaria a lógica para sincronizar
  // dados que foram salvos localmente enquanto offline
  
  // Exemplo: buscar dados do IndexedDB e enviar para o servidor
  const db = await openDatabase();
  const pendingData = await getAllPendingData(db);
  
  for (const data of pendingData) {
    try {
      await sendDataToServer(data);
      await markDataAsSynced(db, data.id);
      console.log('✅ Dado sincronizado:', data.id);
    } catch (error) {
      console.error('❌ Erro ao sincronizar dado:', error);
    }
  }
}

// ============================================
 // FUNÇÕES DE BANCO DE DADOS OFFLINE
// ============================================

/**
 * Abre conexão com IndexedDB
 */
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SocialColetorDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Criar object store para dados pendentes
      if (!db.objectStoreNames.contains('pendingData')) {
        const store = db.createObjectStore('pendingData', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Obtém todos os dados pendentes
 */
async function getAllPendingData(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingData'], 'readonly');
    const store = transaction.objectStore('pendingData');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (event) => reject(event.target.error);
  });
}

// ============================================
// NOTIFICAÇÕES PUSH
// ============================================

/**
 * Evento de push - para notificações push
 */
self.addEventListener('push', (event) => {
  console.log('🔔 Notificação push recebida');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Social Coletor';
  const options = {
    body: data.body || 'Novos dados disponíveis',
    icon: 'logo.png',
    badge: 'logo.png',
    tag: 'social-coletor-notification',
    data: data.url || '/'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Evento de clique em notificação
 */
self.addEventListener('notificationclick', (event) => {
  console.log('👆 Notificação clicada');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focar em janela existente se disponível
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Abrir nova janela se não existir
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data || '/');
        }
      })
  );
});

// ============================================
 // MENSAGENS DO CLIENT
// ============================================

/**
 * Evento de message - comunicação com clientes
 */
self.addEventListener('message', (event) => {
  console.log('💬 Mensagem do cliente:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_ASSETS') {
    cacheAdditionalAssets(event.data.assets);
  }
});

/**
 * Cache de assets adicionais
 */
async function cacheAdditionalAssets(assets) {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(assets);
  console.log('✅ Assets adicionais em cache');
}

console.log('👷 Service Worker carregado e pronto!');
