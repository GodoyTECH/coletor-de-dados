/**
 * SOCIAL COLETOR - SERVICE WORKER SIMPLIFICADO
 * Sem cache para HTML + Background Sync para envios offline
 */

const CACHE_NAME = 'social-coletor-' + new Date().toISOString().split('T')[0];

// URLs que devem SEMPRE buscar da rede (não cachear)
const NETWORK_ONLY = [
  'index.html',
  'script.js',
  'send.js'
];

self.addEventListener('install', event => {
  console.log("🔧 Service Worker instalado");
  self.skipWaiting(); // Ativar IMEDIATAMENTE
});

self.addEventListener('activate', event => {
  console.log("🚀 Service Worker ativado");
  event.waitUntil(self.clients.claim());
});

// ESTRATÉGIA SIMPLES: HTML sempre da rede, outros recursos do cache
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Para navegação (HTML), SEMPRE da rede
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Atualiza o cache com a nova versão
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback: tentar do cache
          return caches.match(event.request)
            .then(cached => cached || offlinePage());
        })
    );
    return;
  }
  
  // Para arquivos que devem ser sempre da rede
  if (NETWORK_ONLY.some(file => url.includes(file))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Para outros recursos: Cache First
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          return cached;
        }
        return fetch(event.request)
          .then(response => {
            // Cachear resposta
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return response;
          })
          .catch(() => {
            // Se é imagem, retornar placeholder
            if (event.request.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
              return new Response(
                `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                  <rect width="100%" height="100%" fill="#f0f0f0"/>
                  <text x="50%" y="50%" text-anchor="middle" fill="#666">Imagem Offline</text>
                </svg>`,
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// BACKGROUND SYNC para envios offline
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-data') {
    console.log('🔄 Background Sync acionado');
    event.waitUntil(syncData());
  }
});

// Função para sincronizar dados pendentes
async function syncData() {
  try {
    const db = await openDatabase();
    const pendentes = await getPendingData(db);
    
    for (const item of pendentes) {
      try {
        const response = await fetch(item.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });
        
        if (response.ok) {
          await deletePendingData(db, item.id);
          console.log(`✅ Enviado: ${item.id}`);
          
          // Enviar notificação
          self.registration.showNotification('✅ Envio Concluído', {
            body: `Registro ${item.id} enviado com sucesso!`,
            icon: '/logo.png'
          });
        }
      } catch (err) {
        console.error(`❌ Falha no envio ${item.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Erro no sync:', err);
  }
}

// IndexedDB para armazenar dados pendentes
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SocialColetorDB', 1);
    
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        const store = db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    
    request.onsuccess = function(event) {
      resolve(event.target.result);
    };
    
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

function getPendingData(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending'], 'readonly');
    const store = transaction.objectStore('pending');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function savePendingData(db, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending'], 'readwrite');
    const store = transaction.objectStore('pending');
    const request = store.add({
      ...data,
      timestamp: new Date().toISOString()
    });
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function deletePendingData(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending'], 'readwrite');
    const store = transaction.objectStore('pending');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// Página offline
function offlinePage() {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Social Coletor - Offline</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 50px;
          background: #f5f5f5;
        }
        h1 { color: #666; }
        button {
          background: #0a0e29;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <h1>📡 Você está offline</h1>
      <p>Conecte-se à internet para usar o Social Coletor</p>
      <button onclick="location.reload()">🔄 Tentar Novamente</button>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } });
}

// Forçar update quando solicitado
self.addEventListener('message', event => {
  if (event.data === 'UPDATE') {
    self.skipWaiting();
  }
});

console.log("👷 Service Worker carregado - Modo Offline + Sync");
