const CACHE_NAME = 'social-coletor-v1.3';

const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/send.js',
  '/manifest.json'
];

const IGNORE_LIST = [
 
  "favicon",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "tesseract",
  "unpkg.com",
  "cloudflare",
  "googleapis"
];

self.addEventListener('install', event => {
  console.log("🔧 Instalando Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("📦 Cache inicial carregado");
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('Erro no install do SW:', err))
  );
});

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

self.addEventListener('fetch', event => {
  const url = event.request.url;

  if (IGNORE_LIST.some(item => url.includes(item))) {
    return;
  }

  if (url.includes("script.google.com")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cacheRes => {
      if (cacheRes) {
        // console.log("📦 Cache:", url);
        return cacheRes;
      }

      // console.log("🌐 Rede:", url);
      return fetch(event.request)
        .then(networkRes => {
          if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') {
            return networkRes;
          }

          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone).catch(err => {
              console.warn('Não foi possível armazenar no cache:', err);
            });
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

self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log("🔄 Sincronização iniciada...");
    event.waitUntil(syncPendingData());
  }
});

// IndexedDB util
function openDatabase() {
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

function getAllPendingData(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["pendingData"], "readonly");
    const store = tx.objectStore("pendingData");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

async function syncPendingData() {
  try {
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
        console.error("❌ Erro ao sincronizar item:", item.id, err);
      }
    }
  } catch (err) {
    console.error('Erro ao abrir DB para sync:', err);
  }
}

// Push notifications
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
  event.waitUntil(clients.openWindow(event.notification.data || "/"));
});

// Mensagens vindas da página (ex: pedir cache de assets adicionais)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === 'CACHE_ASSETS' && Array.isArray(event.data.assets)) {
    cacheAdditionalAssets(event.data.assets).catch(err => {
      console.error('Erro ao cachear assets adicionais:', err);
    });
  }
});

/**
 * Cache de assets adicionais (usado via postMessage)
 */
async function cacheAdditionalAssets(assets) {
  if (!Array.isArray(assets) || assets.length === 0) return;
  const cache = await caches.open(CACHE_NAME);
  try {
    await cache.addAll(assets);
    console.log('✅ Assets adicionais em cache:', assets);
  } catch (err) {
    console.error('❌ Falha em cacheAdditionalAssets:', err);
  }
}

console.log("👷 Service Worker carregado e pronto!");
