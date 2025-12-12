/**
 * send.js - Social Coletor (corrigido)
 * - Envio online com verificação de resposta
 * - Salvamento automático offline (IndexedDB)
 * - SyncManager com tag 'sync-offline-data'
 * - Modais simples (loading / success / offline / error)
 */

/* ================================
   CONFIGURAÇÕES
   ================================ */

// URL do Apps Script (recebida)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwID1I2Wz186kMLtl704gPtTZc0Tka44nNDyrwSNx3xePjpyRPEJd3tHvbLV9f3hbai/exec';

// (Opcional) URL direta da planilha Google Sheets (coloque aqui se tiver)
// Caso não tenha, o botão "Ver Planilha" abrirá o APPS_SCRIPT_URL como fallback.
const SPREADSHEET_URL = ''; // ex: 'https://docs.google.com/spreadsheets/d/SEU_ID/edit#gid=0'

/* ================================
   VARIÁVEIS GLOBAIS
   ================================ */
const DB_NAME = 'SocialColetorDB';
let isOnline = navigator.onLine;

/* ================================
   UTILITÁRIOS DE UI (modal simples)
   ================================ */

function showModal(title = 'Aguarde', message = '', showSpinner = false) {
  hideModal(); // garante que não haja múltiplos
  const overlay = document.createElement('div');
  overlay.id = 'sc-modal-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.45); z-index: 99999;
  `;
  overlay.innerHTML = `
    <div style="
      background: #fff; color:#222; padding:20px 24px; border-radius:12px; width: 90%; max-width:420px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2); text-align:center;
    ">
      <h3 style="margin:0 0 8px 0; font-size:18px;">${title}</h3>
      <p style="margin:0 0 12px 0; color:#555;">${message}</p>
      ${showSpinner ? `<div style="margin-top:6px;"><small style="color:#999">Processando...</small></div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideModal() {
  const existing = document.getElementById('sc-modal-overlay');
  if (existing) existing.remove();
}

/* ================================
   DIALOGS SIMPLES (success / offline / error)
   ================================ */

function createSimpleDialog(title, message, buttons = []) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.45); z-index: 99999;
  `;

  const btnsHtml = buttons.map(btn => {
    const color = btn.color || '#0a0e29';
    return `<button data-action="${btn.action}" style="
              background:${color}; color:#fff; border:none; padding:10px 16px; margin:6px;
              border-radius:8px; cursor:pointer; min-width:120px; font-weight:600;">
              ${btn.text}
            </button>`;
  }).join('');

  dialog.innerHTML = `
    <div style="background:#fff; padding:22px; border-radius:12px; max-width:420px; width:92%; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.18);">
      <h3 style="margin:0 0 8px 0; color:#0a0e29;">${title}</h3>
      <p style="margin:0 0 14px 0; color:#444;">${message}</p>
      <div style="display:flex; justify-content:center; flex-wrap:wrap;">${btnsHtml}</div>
    </div>
  `;

  // Delegação de clique nos botões
  dialog.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    dialog.remove();
    handleDialogButtonClick(action);
  });

  return dialog;
}

function showSuccessOptions() {
  const dialog = createSimpleDialog(
    '✅ Dados Enviados!',
    'Seus dados foram enviados para a planilha com sucesso.',
    [
      { text: '📊 Abrir Planilha', action: 'view', color: '#2e7d32' },
      { text: '↩️ Voltar', action: 'back', color: '#616161' }
    ]
  );
  document.body.appendChild(dialog);
}

function showOfflineSuccessOptions(savedId) {
  const dialog = createSimpleDialog(
    '💾 Salvo para envio',
    `Você está offline. Os dados foram salvos (ID: ${savedId}) e serão enviados automaticamente quando a conexão voltar.`,
    [
      { text: '📊 Ver Planilha', action: 'view', color: '#2e7d32' },
      { text: '↩️ Continuar', action: 'back', color: '#616161' }
    ]
  );
  document.body.appendChild(dialog);
}

function showErrorOptions(message = 'Erro ao processar os dados') {
  const dialog = createSimpleDialog(
    '⚠️ Erro',
    message,
    [
      { text: '↩️ Voltar', action: 'back', color: '#616161' }
    ]
  );
  document.body.appendChild(dialog);
}

// Ação dos botões (view/back)
function handleDialogButtonClick(action) {
  switch(action) {
    case 'view':
      // Abre a planilha se houver, senão abre o Apps Script como fallback
      const target = SPREADSHEET_URL && SPREADSHEET_URL.trim() !== '' ? SPREADSHEET_URL : APPS_SCRIPT_URL;
      window.open(target, '_blank');
      break;
    case 'back':
    default:
      // Apenas fecha o diálogo — o comportamento de voltar ao formulário fica a cargo do script principal
      break;
  }
}

/* ================================
   INDEXEDDB - helpers
   ================================ */

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('submissions')) {
        const store = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function saveToIndexedDB(db, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['submissions'], 'readwrite');
    const store = tx.objectStore('submissions');
    const entry = {
      data,
      timestamp: new Date().toISOString(),
      status: 'pending',
      attempts: 0
    };
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getPendingSubmissions(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['submissions'], 'readonly');
    const store = tx.objectStore('submissions');
    const idx = store.index('status');
    const req = idx.getAll('pending');
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

function markAsSent(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['submissions'], 'readwrite');
    const store = tx.objectStore('submissions');
    const req = store.get(id);
    req.onsuccess = () => {
      const obj = req.result;
      if (!obj) return resolve();
      obj.status = 'sent';
      obj.sentAt = new Date().toISOString();
      store.put(obj);
      resolve();
    };
    req.onerror = e => reject(e.target.error);
  });
}

function incrementAttempts(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['submissions'], 'readwrite');
    const store = tx.objectStore('submissions');
    const req = store.get(id);
    req.onsuccess = () => {
      const obj = req.result;
      if (!obj) return resolve();
      obj.attempts = (obj.attempts || 0) + 1;
      if (obj.attempts >= 3) obj.status = 'failed';
      store.put(obj);
      resolve();
    };
    req.onerror = e => reject(e.target.error);
  });
}

/* ================================
   SINCRONIZAÇÃO AUTOMÁTICA
   ================================ */

async function syncPendingSubmissions() {
  if (!navigator.onLine) return;
  try {
    const db = await openDatabase();
    const pending = await getPendingSubmissions(db);
    if (!pending || pending.length === 0) return;

    console.log(`🔄 Sincronizando ${pending.length} pendente(s)...`);
    showModal('Sincronizando', `Enviando ${pending.length} pendente(s)...`, true);

    let sentCount = 0;

    for (const item of pending) {
      if (item.attempts >= 3) continue;
      try {
        const resp = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });

        // Se o Apps Script responder com OK (200..299) consideramos enviado.
        if (resp && resp.ok) {
          await markAsSent(db, item.id);
          sentCount++;
        } else {
          // se não houver resp.ok, incrementar tentativas
          await incrementAttempts(db, item.id);
        }
      } catch (err) {
        // Falha de rede/CORS/etc
        await incrementAttempts(db, item.id);
        console.warn('Erro ao reenviar pendente', item.id, err);
      }
    }

    hideModal();
    if (sentCount > 0) {
      console.log(`✅ ${sentCount} pendente(s) sincronizado(s)`);
    }
  } catch (err) {
    console.error('Erro na sincronização automática:', err);
    hideModal();
  }
}

/* ================================
   FUNÇÃO PRINCIPAL DE ENVIO
   ================================ */

async function sendToGoogleSheets(formData) {
  showModal('Enviando...', 'Enviando seus dados, aguarde...', true);

  // preparar payload (normalizar os campos)
  const payload = {
    ...formData,
    quantidade: parseFloat(formData.quantidade) || 0,
    timestamp: new Date().toLocaleString('pt-BR'),
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || ''
  };

  console.log('📤 Enviando payload:', payload);

  try {
    // fetch NORMAL (sem no-cors)
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Alguns deployments do Apps Script respondem com conteúdo e CORS corretamente.
    // Se recebermos resp.ok consideramos sucesso.
    if (resp && resp.ok) {
      console.log('✅ Enviado (resp.ok)');
      hideModal();
      showSuccessOptions();
      return { success: true, online: true };
    }

    // Se não for ok, tentar ler texto para debug (algumas vezes GAS retorna 302/204)
    try {
      const text = await resp.text();
      console.warn('Resposta inesperada do servidor:', resp.status, text);
    } catch (e) {
      console.warn('Não foi possível ler body da resposta:', e);
    }

    // Se chegou aqui, salvamos offline como fallback
    hideModal();
    return await saveAndContinue(payload);

  } catch (err) {
    // Erro de rede / CORS / etc => salvar offline
    console.warn('Erro no fetch (salvando offline):', err);
    hideModal();
    return await saveAndContinue(payload);
  }
}

/* ================================
   SALVAR OFFLINE E REGISTRAR SYNC
   ================================ */

async function saveAndContinue(data) {
  try {
    const db = await openDatabase();
    const id = await saveToIndexedDB(db, data);
    console.log(`💾 Salvo offline (ID: ${id})`);

    // Tentar registrar sync para enviar quando voltar
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sync-offline-data'); // TAG CORRIGIDA
        console.log('🔔 SyncManager registrado: sync-offline-data');
      } catch (swErr) {
        console.warn('SyncManager não disponível ou falha ao registrar:', swErr);
      }
    }

    showOfflineSuccessOptions(id);
    return { success: false, savedOffline: true, offlineId: id };
  } catch (err) {
    console.error('Erro ao salvar offline:', err);
    showErrorOptions('Erro ao salvar os dados localmente.');
    return { success: false, error: err };
  }
}

/* ================================
   EVENTOS DE REDE
   ================================ */

window.addEventListener('online', () => {
  isOnline = true;
  console.log('🌐 Online - iniciando sincronização automática');
  // pequena espera para estabilizar a conexão
  setTimeout(() => syncPendingSubmissions(), 1500);
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('📴 Offline');
});

/* ================================
   INICIALIZAÇÃO (tenta sincronizar após carregar)
   ================================ */
if (navigator.onLine) {
  setTimeout(() => syncPendingSubmissions(), 4000);
}

/* ================================
   EXPORTS (para o código da UI)
   ================================ */
window.sendToGoogleSheets = sendToGoogleSheets;
window.syncPendingSubmissions = syncPendingSubmissions;
window.handleDialogButtonClick = handleDialogButtonClick;

console.log('📦 send.js (corrigido) carregado');
