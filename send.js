/*
 * send.js - Social Coletor (Versão Profissional)
 * ==============================================
 * 
 * FUNCIONALIDADES:
 * 1. Envio para Google Sheets com Apps Script
 * 2. Gerenciamento offline robusto com IndexedDB
 * 3. Sync automático quando online
 * 4. Retry automático com backoff exponencial
 * 5. Feedback visual completo
 * 6. Logs detalhados para debugging
 * 
 * COMPATÍVEL COM APPS SCRIPT CRIADO ANTERIORMENTE
 */

/* ================================
   CONFIGURAÇÕES GLOBAIS
   ================================ */

const CONFIG = {
  // URL do seu Apps Script (altere esta linha com sua URL)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxDVVzZheEEEfwzjJGaBfZjUxoZzXrstoFOHu6wi8qt697bbElCdzUQrvVNTJVAd99D3Q/exec",
  
  // Nome do banco de dados IndexedDB
  DB_NAME: "SocialColetorDB_v2",
  
  // Versão do banco de dados
  DB_VERSION: 2,
  
  // Nome da object store
  STORE_NAME: "registros_pendentes",
  
  // Configurações de retry
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 segundos
  BACKOFF_MULTIPLIER: 2,
  
  // Timeout da requisição (milissegundos)
  REQUEST_TIMEOUT: 30000,
  
  // Tamanho máximo da imagem a ser enviada (bytes)
  MAX_IMAGE_SIZE: 500000, // 500KB
};

/* ================================
   GERENCIAMENTO DE ESTADO
   ================================ */

let isProcessing = false;
let currentDb = null;

/* ================================
   SISTEMA DE NOTIFICAÇÕES
   ================================ */

class NotificationSystem {
  static show(message, type = 'info', duration = 5000) {
    // Remove notificações existentes
    this.hideAll();
    
    const notification = document.createElement('div');
    notification.className = `sc-notification sc-notification-${type}`;
    notification.innerHTML = `
      <div class="sc-notification-content">
        <span class="sc-notification-icon">${this.getIcon(type)}</span>
        <span class="sc-notification-text">${message}</span>
        <button class="sc-notification-close" onclick="this.parentNode.parentNode.remove()">×</button>
      </div>
    `;
    
    // Estilos inline para garantir funcionamento
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      border-radius: 10px;
      background: ${this.getBackgroundColor(type)};
      color: white;
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
      z-index: 10000;
      max-width: 400px;
      animation: scNotificationSlideIn 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes scNotificationSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes scNotificationSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      .sc-notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        margin-left: 15px;
        padding: 0;
        line-height: 1;
        opacity: 0.8;
      }
      .sc-notification-close:hover {
        opacity: 1;
      }
      .sc-notification-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sc-notification-icon {
        margin-right: 12px;
        font-size: 18px;
      }
      .sc-notification-text {
        flex: 1;
        font-size: 14px;
        line-height: 1.4;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    // Auto-remover após duração
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'scNotificationSlideOut 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, duration);
    
    return notification;
  }
  
  static hideAll() {
    const notifications = document.querySelectorAll('.sc-notification');
    notifications.forEach(notification => {
      notification.style.animation = 'scNotificationSlideOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    });
  }
  
  static getIcon(type) {
    switch(type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '💡';
    }
  }
  
  static getBackgroundColor(type) {
    switch(type) {
      case 'success': return '#10b981'; // verde
      case 'error': return '#ef4444';   // vermelho
      case 'warning': return '#f59e0b'; // laranja
      case 'info': return '#3b82f6';    // azul
      default: return '#6b7280';        // cinza
    }
  }
}

/* ================================
   INDEXEDDB - VERSÃO ROBUSTA
   ================================ */

class DatabaseManager {
  static async open() {
    return new Promise((resolve, reject) => {
      if (currentDb) {
        resolve(currentDb);
        return;
      }
      
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Criar object store se não existir
        if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
          const store = db.createObjectStore(CONFIG.STORE_NAME, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // Criar índices para buscas eficientes
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('attempts', 'attempts', { unique: false });
          store.createIndex('offlineId', 'offlineId', { unique: true });
          
          console.log('📦 Object store criada com índices');
        }
      };
      
      request.onsuccess = (event) => {
        currentDb = event.target.result;
        console.log('✅ Banco de dados aberto com sucesso');
        resolve(currentDb);
      };
      
      request.onerror = (event) => {
        console.error('❌ Erro ao abrir banco de dados:', event.target.error);
        reject(event.target.error);
      };
      
      // Timeout para evitar bloqueio infinito
      setTimeout(() => {
        if (request.readyState === 'pending') {
          request.onerror(new Error('Timeout ao abrir banco de dados'));
        }
      }, 5000);
    });
  }
  
  static async close() {
    if (currentDb) {
      currentDb.close();
      currentDb = null;
      console.log('🔒 Banco de dados fechado');
    }
  }
  
  static async saveOffline(data) {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      
      const offlineId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const record = {
        ...data,
        offlineId,
        status: 'pending',
        attempts: 0,
        timestamp: new Date().toISOString(),
        lastAttempt: null,
        nextRetry: null
      };
      
      const request = store.add(record);
      
      request.onsuccess = () => {
        console.log('💾 Dados salvos offline:', offlineId);
        resolve({
          success: true,
          offlineId,
          id: request.result,
          timestamp: record.timestamp
        });
      };
      
      request.onerror = (event) => {
        console.error('❌ Erro ao salvar offline:', event.target.error);
        reject(event.target.error);
      };
      
      // Garantir que a transação seja concluída
      transaction.oncomplete = () => {
        console.log('💾 Transação de salvamento concluída');
      };
    });
  }
  
  static async getPendingRecords(limit = 50) {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readonly');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      const statusIndex = store.index('status');
      
      const request = statusIndex.getAll('pending');
      
      request.onsuccess = () => {
        // Filtrar por tentativas e ordenar por timestamp
        const records = request.result
          .filter(record => record.attempts < CONFIG.MAX_RETRIES)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .slice(0, limit);
        
        console.log(`📋 ${records.length} registros pendentes encontrados`);
        resolve(records);
      };
      
      request.onerror = (event) => {
        console.error('❌ Erro ao obter registros pendentes:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  static async updateRecordStatus(id, status, attempts = null) {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (!record) {
          reject(new Error('Registro não encontrado'));
          return;
        }
        
        record.status = status;
        record.lastAttempt = new Date().toISOString();
        
        if (attempts !== null) {
          record.attempts = attempts;
        }
        
        if (status === 'failed' && record.attempts >= CONFIG.MAX_RETRIES) {
          record.nextRetry = null;
        } else if (status === 'pending') {
          // Calcular próximo retry com backoff exponencial
          const delay = CONFIG.RETRY_DELAY * Math.pow(CONFIG.BACKOFF_MULTIPLIER, record.attempts);
          const nextRetry = new Date(Date.now() + delay);
          record.nextRetry = nextRetry.toISOString();
        }
        
        const updateRequest = store.put(record);
        
        updateRequest.onsuccess = () => {
          console.log(`🔄 Status atualizado: ${id} -> ${status} (tentativa ${record.attempts})`);
          resolve(true);
        };
        
        updateRequest.onerror = (event) => {
          console.error('❌ Erro ao atualizar registro:', event.target.error);
          reject(event.target.error);
        };
      };
      
      getRequest.onerror = (event) => {
        console.error('❌ Erro ao obter registro:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  static async deleteRecord(id) {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      
      const request = store.delete(id);
      
      request.onsuccess = () => {
        console.log(`🗑️ Registro ${id} removido`);
        resolve(true);
      };
      
      request.onerror = (event) => {
        console.error('❌ Erro ao remover registro:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  static async getStats() {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readonly');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const records = request.result;
        const stats = {
          total: records.length,
          pending: records.filter(r => r.status === 'pending').length,
          sent: records.filter(r => r.status === 'sent').length,
          failed: records.filter(r => r.status === 'failed').length,
          maxAttempts: Math.max(...records.map(r => r.attempts), 0)
        };
        
        resolve(stats);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

/* ================================
   ENVIO PARA GOOGLE SHEETS - COMPATÍVEL COM APPS SCRIPT
   ================================ */

async function sendToGoogleSheets(formData) {
  console.log('🚀 Iniciando envio para Google Sheets...', formData);
  
  // Validar dados obrigatórios
  const requiredFields = ['beneficiario', 'cpf', 'atendente', 'produto', 'quantidade', 'endereco', 'data'];
  const missingFields = requiredFields.filter(field => !formData[field]);
  
  if (missingFields.length > 0) {
    const errorMsg = `Campos obrigatórios faltando: ${missingFields.join(', ')}`;
    console.error('❌ Validação falhou:', errorMsg);
    NotificationSystem.show(`Erro: ${errorMsg}`, 'error', 6000);
    return {
      success: false,
      error: errorMsg,
      savedLocally: false
    };
  }
  
  // Preparar payload no formato esperado pelo Apps Script
  const payload = {
    action: 'submit',
    data: {
      beneficiario: String(formData.beneficiario || '').trim(),
      cpf: String(formData.cpf || '').trim(),
      atendente: String(formData.atendente || '').trim(),
      produto: String(formData.produto || '').trim(),
      quantidade: parseFloat(formData.quantidade) || 0,
      endereco: String(formData.endereco || '').trim(),
      data: String(formData.data || '').trim(),
      assinatura: String(formData.assinatura || 'N/A').trim(),
      numeroDocumento: String(formData.numeroDocumento || '').trim(),
      observacoes: String(formData.observacoes || '').trim(),
      imagemBase64: formData.imagemBase64 || '',
      timestamp: new Date().toISOString()
    }
  };
  
  console.log('📤 Payload preparado:', payload);
  
  // Mostrar notificação de processamento
  NotificationSystem.show('Enviando dados para Google Sheets...', 'info');
  
  // Verificar conexão
  if (!navigator.onLine) {
    console.log('🌐 Sem conexão - Salvando offline');
    NotificationSystem.show('Sem conexão. Salvando localmente...', 'warning');
    
    try {
      const saveResult = await DatabaseManager.saveOffline(payload);
      NotificationSystem.show('✅ Dados salvos localmente. Serão enviados quando a conexão voltar.', 'success');
      
      // Registrar sync com Service Worker se disponível
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.sync.register('sync-offline-data');
          console.log('🔄 Sync registrado no Service Worker');
        } catch (swError) {
          console.log('⚠️ Sync não registrado, mas dados salvos:', swError);
        }
      }
      
      return {
        success: false,
        error: 'Sem conexão com a internet',
        savedLocally: true,
        offlineId: saveResult.offlineId,
        timestamp: saveResult.timestamp
      };
    } catch (saveError) {
      console.error('❌ Erro ao salvar offline:', saveError);
      NotificationSystem.show('❌ Erro ao salvar localmente. Tente novamente.', 'error');
      
      return {
        success: false,
        error: 'Falha ao salvar localmente: ' + saveError.message,
        savedLocally: false
      };
    }
  }
  
  // Tentar envio online
  try {
    console.log('📡 Enviando para:', CONFIG.APPS_SCRIPT_URL);
    
    // Configurar timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Importante para Apps Script
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('📨 Resposta recebida, status:', response.status);
    
    // Em modo no-cors, não podemos ler a resposta, mas assumimos sucesso se não houver erro de rede
    if (response.type === 'opaque' || response.ok) {
      console.log('✅ Envio presumido bem-sucedido (no-cors mode)');
      NotificationSystem.show('✅ Dados enviados com sucesso!', 'success');
      
      return {
        success: true,
        online: true,
        message: 'Dados enviados para Google Sheets',
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Erro no envio online:', error);
    
    // Se for timeout ou erro de rede, salvar offline
    if (error.name === 'AbortError' || error.message.includes('Failed to fetch') || error.message.includes('Network')) {
      console.log('🌐 Erro de rede - Salvando offline');
      NotificationSystem.show('Erro de conexão. Salvando localmente...', 'warning');
      
      try {
        const saveResult = await DatabaseManager.saveOffline(payload);
        NotificationSystem.show('✅ Dados salvos localmente. Serão enviados automaticamente.', 'success');
        
        return {
          success: false,
          error: 'Erro de rede: ' + error.message,
          savedLocally: true,
          offlineId: saveResult.offlineId
        };
      } catch (saveError) {
        console.error('❌ Erro ao salvar offline após falha:', saveError);
        NotificationSystem.show('❌ Erro ao salvar localmente.', 'error');
        
        return {
          success: false,
          error: 'Falha completa: ' + error.message + ' | ' + saveError.message,
          savedLocally: false
        };
      }
    } else {
      // Outro tipo de erro
      NotificationSystem.show(`❌ Erro: ${error.message}`, 'error', 6000);
      
      return {
        success: false,
        error: error.message,
        savedLocally: false
      };
    }
  }
}

/* ================================
   SINCRONIZAÇÃO AUTOMÁTICA
   ================================ */

async function syncPendingRecords() {
  if (isProcessing) {
    console.log('⏸️ Sincronização já em andamento');
    return;
  }
  
  if (!navigator.onLine) {
    console.log('🌐 Sem conexão - Sincronização adiada');
    return;
  }
  
  isProcessing = true;
  
  try {
    console.log('🔄 Iniciando sincronização de registros pendentes...');
    
    const pendingRecords = await DatabaseManager.getPendingRecords();
    
    if (pendingRecords.length === 0) {
      console.log('✅ Nenhum registro pendente para sincronizar');
      isProcessing = false;
      return;
    }
    
    // Mostrar notificação de progresso
    NotificationSystem.show(`Sincronizando ${pendingRecords.length} registro(s)...`, 'info');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const record of pendingRecords) {
      try {
        console.log(`📤 Enviando registro ${record.offlineId}...`);
        
        // Configurar timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record.data),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Atualizar tentativa
        await DatabaseManager.updateRecordStatus(
          record.id, 
          'pending', 
          record.attempts + 1
        );
        
        // Em modo no-cors, assumimos sucesso se não houver erro de rede
        if (response.type === 'opaque' || response.ok) {
          // Marcar como enviado
          await DatabaseManager.updateRecordStatus(record.id, 'sent');
          successCount++;
          console.log(`✅ Registro ${record.offlineId} sincronizado`);
        } else {
          errorCount++;
          console.log(`❌ Falha no registro ${record.offlineId}`);
        }
        
      } catch (error) {
        console.error(`❌ Erro ao sincronizar registro ${record.offlineId}:`, error);
        errorCount++;
        
        // Atualizar contador de tentativas
        await DatabaseManager.updateRecordStatus(
          record.id, 
          'pending', 
          record.attempts + 1
        );
      }
    }
    
    // Mostrar resultado
    if (successCount > 0) {
      NotificationSystem.show(
        `✅ ${successCount} registro(s) sincronizado(s)${errorCount > 0 ? `, ${errorCount} falha(s)` : ''}`,
        successCount === pendingRecords.length ? 'success' : 'warning'
      );
    }
    
    console.log(`📊 Sincronização concluída: ${successCount} sucesso, ${errorCount} falhas`);
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    NotificationSystem.show('❌ Erro na sincronização: ' + error.message, 'error');
  } finally {
    isProcessing = false;
  }
}

/* ================================
   SERVICE WORKER SYNC
   ================================ */

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('👷 Service Worker registrado:', registration.scope);
      
      // Registrar sync event
      if ('SyncManager' in window) {
        registration.sync.register('sync-offline-data');
        console.log('🔄 SyncManager registrado');
      }
      
      return registration;
    } catch (error) {
      console.log('⚠️ Service Worker não registrado:', error);
      return null;
    }
  }
  return null;
}

/* ================================
   MONITORAMENTO DE CONEXÃO
   ================================ */

function setupConnectionMonitoring() {
  // Monitorar eventos de online/offline
  window.addEventListener('online', () => {
    console.log('🌐 Conexão restabelecida');
    NotificationSystem.show('✅ Conexão restabelecida. Sincronizando...', 'success', 3000);
    
    // Esperar um pouco antes de sincronizar
    setTimeout(() => {
      syncPendingRecords();
    }, 2000);
  });
  
  window.addEventListener('offline', () => {
    console.log('🌐 Sem conexão');
    NotificationSystem.show('⚠️ Você está offline. Dados serão salvos localmente.', 'warning', 4000);
  });
  
  // Verificar status inicial
  if (!navigator.onLine) {
    NotificationSystem.show('⚠️ Você está offline. Dados serão salvos localmente.', 'warning', 4000);
  }
}

/* ================================
   INICIALIZAÇÃO
   ================================ */

async function initializeSendSystem() {
  console.log('🚀 Inicializando sistema de envio...');
  
  try {
    // Configurar monitoramento de conexão
    setupConnectionMonitoring();
    
    // Registrar Service Worker
    await registerServiceWorker();
    
    // Abrir banco de dados
    await DatabaseManager.open();
    
    // Verificar registros pendentes
    const stats = await DatabaseManager.getStats();
    console.log('📊 Estatísticas do banco:', stats);
    
    if (stats.pending > 0 && navigator.onLine) {
      // Sincronizar automaticamente se houver registros pendentes
      setTimeout(() => {
        syncPendingRecords();
      }, 3000);
    }
    
    console.log('✅ Sistema de envio inicializado com sucesso');
    
    return {
      success: true,
      stats,
      isOnline: navigator.onLine
    };
    
  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/* ================================
   FUNÇÕES DE DEBUG E CONTROLE
   ================================ */

async function debugDatabase() {
  try {
    const stats = await DatabaseManager.getStats();
    const pending = await DatabaseManager.getPendingRecords(100);
    
    console.group('🔍 DEBUG DATABASE');
    console.log('📊 Estatísticas:', stats);
    console.log('📋 Registros pendentes:', pending);
    console.groupEnd();
    
    NotificationSystem.show(`📊 DB: ${stats.total} total, ${stats.pending} pendentes`, 'info');
    
    return { stats, pending };
  } catch (error) {
    console.error('❌ Erro no debug:', error);
    return { error: error.message };
  }
}

async function clearAllOfflineData() {
  if (!confirm('⚠️ Tem certeza que deseja APAGAR TODOS os dados salvos localmente?')) {
    return { cancelled: true };
  }
  
  try {
    const request = indexedDB.deleteDatabase(CONFIG.DB_NAME);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        currentDb = null;
        console.log('🗑️ Banco de dados apagado com sucesso');
        NotificationSystem.show('✅ Todos os dados locais foram apagados', 'success');
        resolve({ success: true });
      };
      
      request.onerror = (event) => {
        console.error('❌ Erro ao apagar banco:', event.target.error);
        NotificationSystem.show('❌ Erro ao apagar dados', 'error');
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('❌ Erro:', error);
    return { success: false, error: error.message };
  }
}

/* ================================
   EXPORTAÇÃO PARA USO GLOBAL
   ================================ */

window.SocialColetorSend = {
  // Funções principais
  sendToGoogleSheets,
  syncPendingRecords,
  initialize: initializeSendSystem,
  
  // Gerenciamento de banco
  debugDatabase,
  clearAllOfflineData,
  getDatabaseStats: DatabaseManager.getStats,
  
  // Utilitários
  showNotification: NotificationSystem.show,
  hideNotifications: NotificationSystem.hideAll,
  
  // Configuração
  updateConfig: (newConfig) => {
    Object.assign(CONFIG, newConfig);
    console.log('⚙️ Configuração atualizada:', CONFIG);
  },
  
  // Status
  getStatus: () => ({
    isOnline: navigator.onLine,
    isProcessing,
    config: CONFIG
  })
};

/* ================================
   INICIALIZAÇÃO AUTOMÁTICA
   ================================ */

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeSendSystem, 1000);
  });
} else {
  setTimeout(initializeSendSystem, 1000);
}

console.log('📤 send.js profissional carregado!');
