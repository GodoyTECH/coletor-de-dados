/**
 * send.js - Social Coletor (versão simplificada)
 * - Apenas modal de envio
 * - Envio online → sucesso silencioso
 * - Erro offline → salva no IndexedDB
 * - SyncManager automático
 */

/* ================================
   CONFIGURAÇÕES
   ================================ */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDVVzZheEEEfwzjJGaBfZjUxoZzXrstoFOHu6wi8qt697bbElCdzUQrvVNTJVAd99D3Q/exec";

const DB_NAME = "SocialColetorDB";

/* ================================
   MODAL ÚNICO DE ENVIO
   ================================ */

function showModal(title = "Enviando...", message = "", showSpinner = true) {
  hideModal();
  const overlay = document.createElement("div");
  overlay.id = "sc-modal";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 99999;
  `;
  overlay.innerHTML = `
    <div style="
      background:#fff; padding:20px 25px; border-radius:14px; width:92%; max-width:380px;
      text-align:center; color:#111; box-shadow:0 8px 28px rgba(0,0,0,0.22);
    ">
      <h3 style="margin:0 0 10px 0; font-size:19px;">${title}</h3>
      <p style="margin:0 0 5px 0; color:#444;">${message}</p>
      ${showSpinner ? `<div style="margin-top:10px; font-size:13px; color:#777;">Processando...</div>` : ""}
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideModal() {
  const m = document.getElementById("sc-modal");
  if (m) m.remove();
}

/* ================================
   INDEXEDDB
   ================================ */

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("submissions")) {
        db.createObjectStore("submissions", { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function saveOffline(db, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("submissions", "readwrite");
    const store = tx.objectStore("submissions");
    const entry = { data, timestamp: new Date().toISOString(), status: "pending", attempts: 0 };
    const r = store.add(entry);

    r.onsuccess = () => resolve(r.result);
    r.onerror = (e) => reject(e.target.error);
  });
}

function getPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("submissions", "readonly");
    const store = tx.objectStore("submissions");
    const r = store.getAll();

    r.onsuccess = () => resolve(r.result);
    r.onerror = (e) => reject(e.target.error);
  });
}

function markSent(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("submissions", "readwrite");
    const store = tx.objectStore("submissions");

    const r = store.get(id);
    r.onsuccess = () => {
      const obj = r.result;
      if (obj) {
        obj.status = "sent";
        obj.sentAt = new Date().toISOString();
        store.put(obj);
      }
      resolve();
    };
    r.onerror = (e) => reject(e.target.error);
  });
}

function incrementAttempts(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction("submissions", "readwrite");
    const store = tx.objectStore("submissions");

    const r = store.get(id);
    r.onsuccess = () => {
      const obj = r.result;
      if (obj) {
        obj.attempts++;
        if (obj.attempts >= 3) obj.status = "failed";
        store.put(obj);
      }
      resolve();
    };
  });
}

/* ================================
   SYNC AUTOMÁTICO
   ================================ */

async function syncPending() {
  if (!navigator.onLine) return;

  const db = await openDatabase();
  const pending = await getPending(db);

  if (!pending.length) return;

  showModal("Sincronizando...", `${pending.length} registros...`, true);

  let success = 0;

  for (const item of pending) {
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.data),
      });

      if (resp.ok) {
        await markSent(db, item.id);
        success++;
      } else {
        await incrementAttempts(db, item.id);
      }
    } catch {
      await incrementAttempts(db, item.id);
    }
  }

  hideModal();
}

/* ================================
   ENVIO PRINCIPAL
   ================================ */

async function sendToGoogleSheets(formData) {
  showModal("Enviando...", "Aguarde...", true);

  const payload = {
    ...formData,
    quantidade: parseFloat(formData.quantidade) || 0,
    timestamp: new Date().toISOString(),
  };

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    hideModal();

    if (resp.ok) {
      return { success: true, online: true };
    }

    return await saveOfflineFallback(payload);
  } catch {
    hideModal();
    return await saveOfflineFallback(payload);
  }
}

/* ================================
   SALVAR OFFLINE
   ================================ */

async function saveOfflineFallback(payload) {
  const db = await openDatabase();
  const id = await saveOffline(db, payload);

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    reg.sync.register("sync-offline-data");
  }

  return { success: false, offline: true, id };
}

/* ================================
   EVENTOS DE REDE
   ================================ */

window.addEventListener("online", () => {
  setTimeout(syncPending, 1000);
});

/* ================================
   EXPORTS
   ================================ */

window.sendToGoogleSheets = sendToGoogleSheets;
window.syncPendingSubmissions = syncPending;

console.log("send.js simplificado carregado");
