/**
 * SOCIAL COLETOR - SERVICE WORKER CORRIGIDO
 * Totalmente otimizado, sem loops, com cache seguro e sync funcionando.
 */

const CACHE_NAME = 'social-coletor-v2.0';

// Lista mínima de arquivos a cachear
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/send.js',
  '/manifest.json'
];

// URLs que NÃO devem ser interceptadas nem cacheadas
const IGNORE_LIST = [
  "logo.png",                    // Vai causar 404 se cachear
  "favicon",                     // Evita warnings
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "tesseract",                   // Tesseract.js não pode ser cacheado
  "unpkg.com",
  "cloudflare",
  "googleapis"
];

// ======================= INSTALL ==========================

self.addEventListener('install', event => {
  console.log("🔧 Instalando Service Worker...");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("📦 Cache inicial carregado");
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// ======================= ACTIVATE ==========================

self.addEventListener('activate', event => {
  console.log("🚀 Service Worker ativado");

  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log("🗑️ Deletando cache antigo:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ======================= FETCH ==========================

self.addEventListener('fetch', event => {

  const url = event.request.url;

  // Ignorar URLs específicas
  if (IGNORE_LIST.some(item => url.includes(item))) {
    // console.log("⏩ Ignorando:", url);
    return; // deixa a requisição ir direto para a internet
  }

  // Ignorar Google Apps Script (sempre rede)
  if (url.includes("script.google.com")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cacheRes => {
      if (cacheRes) {
        console.log("📦 Cache:", url);
        return cacheRes;
      }

      console.log("🌐 Rede:", url);

      return fetch(event.request)
        .then(networkRes => {
          // Não cachear respostas inválidas
          if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') {
            return networkRes;
          }

          const clone = networkRes.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });

          return networkRes;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match('/index.html');
          }

          return new Response("Falha ao carregar recurso offline.", {
            status: 408,
            headers: { "Content-Type": "text/plain" }
          });
        });
    })
  );
});

// ======================= SYNC ==========================

self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log("🔄 Sincronização iniciada...");
    event.waitUntil(syncPendingData());
  }
});

// Banco local
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("SocialColetorDB", 1);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingData")) {
        db.createObjectStore("pendingData", { keyPath: "id", autoIncrement: true });
      }
    };

    req.onerror = e => reject(e.target.error);
    req.onsuccess = e => resolve(e.target.result);
  });
}

async function getAllPendingData(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["pendingData"], "readonly");
    const store = tx.objectStore("pendingData");
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

async function syncPendingData() {
  const db = await openDatabase();
  const items = await getAllPendingData(db);

  for (const item of items) {
    try {
      await fetch(item.url, {
        method: "POST",
        body: JSON.stringify(item.data),
        headers: { "Content-Type": "application/json" }
      });

      console.log("✅ Sincronizado:", item.id);
    } catch (err) {
      console.error("❌ Erro ao sincronizar:", err);
    }
  }
}

// ======================= PUSH Notifications ==========================

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "Social Coletor";
  const body = data.body || "Nova atualização disponível";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.url || "/"
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data || "/")
  );
});

// ======================= MESSAGES ==========================

self.addEventListener('message', event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

console.log("👷 Novo Service Worker carregado com sucesso!");

  
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
