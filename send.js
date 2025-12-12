/**
 * SOCIAL COLETOR - FUNÇÕES DE ENVIO (com suporte offline)
 * Responsável pelo envio dos dados para o Google Sheets via Apps Script
 */

// ============================================
// CONFIGURAÇÃO DO APPS SCRIPT
// ============================================

// SUA URL DO GOOGLE APPS SCRIPT
let APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXmz9h5L6Ki5VWm3lC-HWJ_pNHpZMfSOjVcsvObF6yMVjmGAev48VwOC4pe71vmdyh3w/exec';

// ============================================
// VARIÁVEIS GLOBAIS PARA SUPORTE OFFLINE
// ============================================
let isOnline = navigator.onLine;
let pendingSubmissions = [];
const DB_NAME = 'SocialColetorDB';

// ============================================
// MONITORAMENTO DE CONEXÃO
// ============================================
window.addEventListener('online', () => {
  isOnline = true;
  console.log('🌐 Conectado - Tentando enviar pendentes...');
  syncPendingSubmissions();
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('📴 Offline - Modo offline ativado');
});

// ============================================
// FUNÇÃO PRINCIPAL DE ENVIO
// ============================================
async function sendToGoogleSheets(formData) {
    // usa showModal global do script.js
    showModal('Verificando conexão...', 'Conectando com o servidor...', true);
    
    // Se offline, salvar localmente
    if (!isOnline) {
        hideModal();
        return handleOfflineSubmission(formData);
    }
    
    // Se online, tentar enviar
    try {
        const payload = {
            ...formData,
            quantidade: parseFloat(formData.quantidade) || 0,
            timestamp: new Date().toLocaleString('pt-BR'),
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };

        console.log('📤 Payload (enviando):', payload);

        // ATENÇÃO: por enquanto mantemos no-cors se você ainda não habilitou CORS no Apps Script.
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log('✅ Requisição enviada (no-cors). Sucesso presumido.');
        
        // Usamos showModal da aplicação principal
        showModal('✅ Sucesso!', 'Dados enviados para a planilha!', false);

        return { 
            success: true, 
            online: true,
            timestamp: new Date().toLocaleString('pt-BR')
        };

    } catch (error) {
        console.error('❌ Erro ao enviar dados:', error);
        
        // Se falhar, tentar salvar offline
        hideModal();
        return handleOfflineSubmission(formData);
    }
}

// ============================================
// FUNÇÕES PARA MANIPULAÇÃO OFFLINE
// ============================================

// Nova função para lidar com envio offline
async function handleOfflineSubmission(formData) {
  const userChoice = await showOfflineDialog();
  
  if (userChoice === 'save') {
    const result = await saveOfflineData(formData);
    
    if (result.savedOffline) {
      showModal('📴 Modo Offline', 
        'Dados salvos localmente!<br><br>' +
        '✅ Serão enviados automaticamente quando a conexão voltar.<br>' +
        '📝 ID Offline: ' + result.offlineId,
        false
      );
    }
    
    return result;
    
  } else if (userChoice === 'view') {
    // Abrir planilha
    window.open('https://docs.google.com/spreadsheets/', '_blank');
    return { action: 'view_spreadsheet' };
    
  } else {
    // Usuário cancelou
    return { cancelled: true };
  }
}

// Função para salvar dados offline
async function saveOfflineData(formData) {
  try {
    const db = await openDatabase();
    const id = await saveToIndexedDB(db, formData);
    
    // Registrar sync para quando voltar online
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-pending-data');
    }
    
    return {
      success: false,
      savedOffline: true,
      offlineId: id,
      message: '📴 Dados salvos offline. Serão enviados automaticamente quando a conexão voltar.'
    };
  } catch (error) {
    console.error('❌ Erro ao salvar offline:', error);
    return {
      success: false,
      savedOffline: false,
      error: 'Falha ao salvar dados offline'
    };
  }
}

// Dialog para escolha offline
function showOfflineDialog() {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;
    
    dialog.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 10px;
        max-width: 400px;
        text-align: center;
      ">
        <h2 style="color: #0a0e29;">📴 Sem Conexão</h2>
        <p>Você está offline. O que deseja fazer?</p>
        
        <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: center;">
          <button id="saveOfflineBtn" style="
            background: #0a0e29;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
          ">
            💾 Salvar Localmente
          </button>
          
          <button id="viewSheetBtn" style="
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
          ">
            📊 Ver Planilha
          </button>
          
          <button id="cancelBtn" style="
            background: #f44336;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
          ">
            ↩️ Voltar
          </button>
        </div>
        
        <p style="font-size: 12px; color: #666; margin-top: 20px;">
          <strong>Salvar Localmente:</strong> Os dados serão enviados automaticamente quando a conexão voltar.<br>
          <strong>Ver Planilha:</strong> Abrirá a planilha para conferência (se já tiver dados salvos).<br>
          <strong>Voltar:</strong> Retorna para continuar coletando dados.
        </p>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('#saveOfflineBtn').onclick = () => {
      document.body.removeChild(dialog);
      resolve('save');
    };
    
    dialog.querySelector('#viewSheetBtn').onclick = () => {
      document.body.removeChild(dialog);
      resolve('view');
    };
    
    dialog.querySelector('#cancelBtn').onclick = () => {
      document.body.removeChild(dialog);
      resolve('cancel');
    };
  });
}

// ============================================
// FUNÇÕES INDEXEDDB
// ============================================

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('submissions')) {
        const store = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('status', 'status');
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

function saveToIndexedDB(db, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['submissions'], 'readwrite');
    const store = transaction.objectStore('submissions');
    const request = store.add({
      data: data,
      timestamp: new Date().toISOString(),
      status: 'pending',
      attempts: 0
    });
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ============================================
// SINCRONIZAÇÃO DE DADOS PENDENTES
// ============================================

// Sincronizar pendentes quando voltar online
async function syncPendingSubmissions() {
  try {
    const db = await openDatabase();
    const pending = await getPendingSubmissions(db);
    
    if (pending.length === 0) return;
    
    showModal('Sincronizando...', `Enviando ${pending.length} registro(s) pendente(s)...`, true);
    
    for (const item of pending) {
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });
        
        await markAsSent(db, item.id);
        console.log(`✅ Enviado pendente ${item.id}`);
        
      } catch (error) {
        await incrementAttempts(db, item.id);
        console.error(`❌ Falha no pendente ${item.id}:`, error);
      }
    }
    
    hideModal();
    
    if (pending.some(p => p.attempts < 3)) {
      showModal('📊 Sincronização', 
        `${pending.length} registro(s) processado(s).<br>
         Alguns podem precisar de nova tentativa.`,
        false
      );
    } else {
      showModal('✅ Sincronizado!', 
        'Todos os dados pendentes foram enviados!',
        false
      );
    }
    
  } catch (error) {
    console.error('Erro na sincronização:', error);
    hideModal();
  }
}

// Funções auxiliares IndexedDB
function getPendingSubmissions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['submissions'], 'readonly');
    const store = transaction.objectStore('submissions');
    const index = store.index('status');
    const request = index.getAll('pending');
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function markAsSent(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['submissions'], 'readwrite');
    const store = transaction.objectStore('submissions');
    const request = store.get(id);
    
    request.onsuccess = function() {
      const data = request.result;
      data.status = 'sent';
      data.sentAt = new Date().toISOString();
      store.put(data);
      resolve();
    };
    
    request.onerror = (e) => reject(e.target.error);
  });
}

function incrementAttempts(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['submissions'], 'readwrite');
    const store = transaction.objectStore('submissions');
    const request = store.get(id);
    
    request.onsuccess = function() {
      const data = request.result;
      data.attempts = (data.attempts || 0) + 1;
      if (data.attempts >= 3) {
        data.status = 'failed';
        data.lastAttempt = new Date().toISOString();
      }
      store.put(data);
      resolve();
    };
    
    request.onerror = (e) => reject(e.target.error);
  });
}

// ============================================
// UTILITÁRIOS PARA CONFIG
// ============================================
function setAppsScriptUrl(url) {
    APPS_SCRIPT_URL = url;
    console.log('🔧 URL do Apps Script atualizada:', url);
}

function getAppsScriptUrl() {
    return APPS_SCRIPT_URL;
}

// Exportar funções para uso global (se necessário)
window.saveToGoogleSheets = sendToGoogleSheets;
window.syncPendingSubmissions = syncPendingSubmissions;

// Verificar se há dados pendentes ao carregar
if (isOnline) {
    setTimeout(() => {
        syncPendingSubmissions();
    }, 3000);
}

console.log('📦 send.js carregado com suporte offline');
