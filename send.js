/**
 * send.js - Social Coletor (Versão Corrigida e Simplificada)
 * ===========================================================
 * 
 * Versão que:
 * 1. NÃO tem modal/notificação própria (usa as do JS principal)
 * 2. NÃO tem Service Worker (o JS principal já tem)
 * 3. É 100% compatível com Apps Script
 * 4. Focado apenas no envio e gerenciamento offline
 */

/* ================================
   CONFIGURAÇÕES
   ================================ */

const CONFIG = {
  // URL do seu Apps Script (ALTERE AQUI!)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxDVVzZheEEEfwzjJGaBfZjUxoZzXrstoFOHu6wi8qt697bbElCdzUQrvVNTJVAd99D3Q/exec",
  
  // Nome do banco de dados IndexedDB (DIFERENTE do JS principal)
  DB_NAME: "SocialColetor_SendDB",
  
  // Nome da object store
  STORE_NAME: "envios_pendentes",
  
  // Configurações de retry
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000,
  
  // Timeout da requisição
  REQUEST_TIMEOUT: 25000,
};

/* ================================
   ÍNDICES PARA O BANCO DE DADOS
   ================================ */

const DB_SCHEMA = {
  name: CONFIG.DB_NAME,
  version: 1,
  stores: {
    envios_pendentes: {
      keyPath: 'id',
      autoIncrement: true,
      indexes: [
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'timestamp', keyPath: 'timestamp', unique: false },
        { name: 'offlineId', keyPath: 'offlineId', unique: true }
      ]
    }
  }
};

/* ================================
   BANCO DE DADOS SIMPLIFICADO
   ================================ */

class SendDatabase {
  constructor() {
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_SCHEMA.name, DB_SCHEMA.version);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Criar object store se não existir
        if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
          const store = db.createObjectStore(CONFIG.STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
          });
          
          // Criar índices
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('offlineId', 'offlineId', { unique: true });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async saveOffline(payload) {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      
      const offlineId = `off_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const record = {
        data: payload,
        offlineId,
        status: 'pending',
        attempts: 0,
        timestamp: new Date().toISOString(),
        created: new Date().toISOString()
      };
      
      const request = store.add(record);
      
      request.onsuccess = () => {
        resolve({
          success: true,
          offlineId,
          dbId: request.result,
          timestamp: record.timestamp
        });
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async getPendingRecords() {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readonly');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      const statusIndex = store.index('status');
      
      const request = statusIndex.getAll('pending');
      
      request.onsuccess = () => {
        const records = request.result
          .filter(record => record.attempts < CONFIG.MAX_RETRIES)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        resolve(records);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async updateRecord(id, updates) {
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
        
        // Atualizar registro
        Object.assign(record, updates);
        
        const updateRequest = store.put(record);
        
        updateRequest.onsuccess = () => {
          resolve(true);
        };
        
        updateRequest.onerror = (event) => {
          reject(event.target.error);
        };
      };
      
      getRequest.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async deleteRecord(id) {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      
      const request = store.delete(id);
      
      request.onsuccess = () => {
        resolve(true);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async getStats() {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG.STORE_NAME, 'readonly');
      const store = transaction.objectStore(CONFIG.STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const records = request.result;
        resolve({
          total: records.length,
          pending: records.filter(r => r.status === 'pending').length,
          sent: records.filter(r => r.status === 'sent').length,
          failed: records.filter(r => r.status === 'failed').length
        });
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

/* ================================
   FUNÇÃO PRINCIPAL DE ENVIO
   ================================ */

async function sendToGoogleSheets(formData) {
  console.log('[SEND] Iniciando envio para Google Sheets');
  
  // Usar a função showModal do JS principal se existir
  if (window.showModal) {
    window.showModal('Enviando...', 'Processando dados...', true);
  }
  
  // Validar campos obrigatórios
  const requiredFields = ['beneficiario', 'cpf', 'atendente', 'produto', 'quantidade', 'endereco', 'data'];
  const missingFields = requiredFields.filter(field => !formData[field] || formData[field].toString().trim() === '');
  
  if (missingFields.length > 0) {
    const errorMsg = `Campos obrigatórios: ${missingFields.join(', ')}`;
    console.error('[SEND] Validação falhou:', errorMsg);
    
    // Usar showStatusMessage do JS principal se existir
    if (window.showStatusMessage) {
      window.showStatusMessage(`Erro: ${errorMsg}`, 'error');
    }
    
    if (window.hideModal) window.hideModal();
    
    return {
      success: false,
      error: errorMsg,
      savedLocally: false
    };
  }
  
  // Preparar payload para Apps Script
  const payload = {
    action: 'submit',
    data: {
      beneficiario: String(formData.beneficiario || '').trim(),
      cpf: String(formData.cpf || '').replace(/\D/g, ''),
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
  
  console.log('[SEND] Payload preparado:', {
    beneficiario: payload.data.beneficiario,
    cpf: payload.data.cpf,
    atendente: payload.data.atendente,
    produto: payload.data.produto
  });
  
  // Verificar conexão
  if (!navigator.onLine) {
    console.log('[SEND] Sem conexão - Salvando offline');
    
    if (window.showStatusMessage) {
      window.showStatusMessage('Sem conexão. Salvando localmente...', 'warning');
    }
    
    try {
      const db = new SendDatabase();
      const saveResult = await db.saveOffline(payload);
      
      console.log('[SEND] Dados salvos offline:', saveResult.offlineId);
      
      if (window.showStatusMessage) {
        window.showStatusMessage('✅ Dados salvos localmente!', 'success');
      }
      
      if (window.hideModal) window.hideModal();
      
      return {
        success: false,
        error: 'Sem conexão com a internet',
        savedLocally: true,
        offlineId: saveResult.offlineId,
        dbId: saveResult.dbId,
        timestamp: saveResult.timestamp
      };
      
    } catch (saveError) {
      console.error('[SEND] Erro ao salvar offline:', saveError);
      
      if (window.showStatusMessage) {
        window.showStatusMessage('❌ Erro ao salvar localmente', 'error');
      }
      
      if (window.hideModal) window.hideModal();
      
      return {
        success: false,
        error: 'Falha ao salvar localmente',
        savedLocally: false
      };
    }
  }
  
  // Tentar envio online
  try {
    console.log('[SEND] Enviando para:', CONFIG.APPS_SCRIPT_URL);
    
    // Timeout configurável
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // IMPORTANTE para Apps Script
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('[SEND] Resposta recebida, status:', response.type);
    
    // Em modo no-cors, assumimos sucesso se não houve erro de rede
    if (response.type === 'opaque') {
      console.log('[SEND] Envio bem-sucedido (modo no-cors)');
      
      if (window.showStatusMessage) {
        window.showStatusMessage('✅ Dados enviados com sucesso!', 'success');
      }
      
      if (window.hideModal) window.hideModal();
      
      return {
        success: true,
        online: true,
        message: 'Dados enviados para Google Sheets',
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error('Resposta não-opaque do servidor');
    }
    
  } catch (error) {
    console.error('[SEND] Erro no envio online:', error);
    
    // Se for erro de rede, salvar offline
    if (error.name === 'AbortError' || error.message.includes('Failed to fetch') || error.message.includes('Network')) {
      console.log('[SEND] Erro de rede - Salvando offline');
      
      if (window.showStatusMessage) {
        window.showStatusMessage('Erro de rede. Salvando localmente...', 'warning');
      }
      
      try {
        const db = new SendDatabase();
        const saveResult = await db.saveOffline(payload);
        
        console.log('[SEND] Dados salvos offline após erro:', saveResult.offlineId);
        
        if (window.showStatusMessage) {
          window.showStatusMessage('✅ Dados salvos localmente!', 'success');
        }
        
        if (window.hideModal) window.hideModal();
        
        return {
          success: false,
          error: 'Erro de rede: ' + error.message,
          savedLocally: true,
          offlineId: saveResult.offlineId
        };
        
      } catch (saveError) {
        console.error('[SEND] Erro ao salvar offline após falha:', saveError);
        
        if (window.showStatusMessage) {
          window.showStatusMessage('❌ Erro ao salvar localmente', 'error');
        }
        
        if (window.hideModal) window.hideModal();
        
        return {
          success: false,
          error: 'Falha completa no envio',
          savedLocally: false
        };
      }
    } else {
      // Outro tipo de erro
      console.error('[SEND] Erro não relacionado a rede:', error);
      
      if (window.showStatusMessage) {
        window.showStatusMessage('❌ Erro no envio: ' + error.message, 'error');
      }
      
      if (window.hideModal) window.hideModal();
      
      return {
        success: false,
        error: error.message,
        savedLocally: false
      };
    }
  }
}

/* ================================
   SINCRONIZAÇÃO DE DADOS OFFLINE
   ================================ */

async function syncOfflineData() {
  console.log('[SYNC] Iniciando sincronização offline');
  
  if (!navigator.onLine) {
    console.log('[SYNC] Sem conexão - Sincronização adiada');
    return { success: false, reason: 'offline' };
  }
  
  try {
    const db = new SendDatabase();
    const pendingRecords = await db.getPendingRecords();
    
    if (pendingRecords.length === 0) {
      console.log('[SYNC] Nenhum registro pendente');
      return { success: true, synced: 0, total: 0 };
    }
    
    console.log(`[SYNC] ${pendingRecords.length} registros pendentes`);
    
    if (window.showStatusMessage) {
      window.showStatusMessage(`Sincronizando ${pendingRecords.length} registro(s)...`, 'info');
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const record of pendingRecords) {
      try {
        console.log(`[SYNC] Processando registro ${record.offlineId}`);
        
        // Tentar enviar
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record.data),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Atualizar contador de tentativas
        await db.updateRecord(record.id, {
          attempts: record.attempts + 1,
          lastAttempt: new Date().toISOString()
        });
        
        // Verificar se foi bem-sucedido (modo no-cors)
        if (response.type === 'opaque') {
          // Marcar como enviado
          await db.updateRecord(record.id, {
            status: 'sent',
            sentAt: new Date().toISOString()
          });
          
          successCount++;
          console.log(`[SYNC] ✅ Registro ${record.offlineId} sincronizado`);
        } else {
          errorCount++;
          console.log(`[SYNC] ❌ Falha no registro ${record.offlineId}`);
        }
        
      } catch (error) {
        console.error(`[SYNC] Erro no registro ${record.offlineId}:`, error);
        errorCount++;
        
        // Atualizar tentativa
        await db.updateRecord(record.id, {
          attempts: record.attempts + 1,
          lastAttempt: new Date().toISOString()
        });
      }
    }
    
    console.log(`[SYNC] Concluído: ${successCount} sucesso, ${errorCount} falhas`);
    
    if (window.showStatusMessage && successCount > 0) {
      window.showStatusMessage(
        `✅ ${successCount} registro(s) sincronizado(s)`,
        'success'
      );
    }
    
    return {
      success: successCount > 0,
      synced: successCount,
      failed: errorCount,
      total: pendingRecords.length
    };
    
  } catch (error) {
    console.error('[SYNC] Erro na sincronização:', error);
    
    if (window.showStatusMessage) {
      window.showStatusMessage('❌ Erro na sincronização', 'error');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/* ================================
   FUNÇÕES UTILITÁRIAS
   ================================ */

async function getSendStats() {
  try {
    const db = new SendDatabase();
    const stats = await db.getStats();
    return { success: true, stats };
  } catch (error) {
    console.error('[STATS] Erro:', error);
    return { success: false, error: error.message };
  }
}

async function clearSendDatabase() {
  if (!confirm('Tem certeza que deseja apagar TODOS os dados de envio salvos localmente?')) {
    return { cancelled: true };
  }
  
  try {
    const request = indexedDB.deleteDatabase(CONFIG.DB_NAME);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('[CLEAR] Banco de dados apagado');
        
        if (window.showStatusMessage) {
          window.showStatusMessage('✅ Dados de envio apagados', 'success');
        }
        
        resolve({ success: true });
      };
      
      request.onerror = (event) => {
        console.error('[CLEAR] Erro:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[CLEAR] Erro:', error);
    return { success: false, error: error.message };
  }
}

/* ================================
   MONITORAMENTO DE CONEXÃO SIMPLES
   ================================ */

function setupSendConnectionMonitor() {
  window.addEventListener('online', () => {
    console.log('[NETWORK] Conexão restabelecida');
    
    // Aguardar 2 segundos e sincronizar
    setTimeout(async () => {
      const stats = await getSendStats();
      if (stats.success && stats.stats.pending > 0) {
        console.log(`[NETWORK] ${stats.stats.pending} registros para sincronizar`);
        syncOfflineData();
      }
    }, 2000);
  });
  
  window.addEventListener('offline', () => {
    console.log('[NETWORK] Sem conexão');
  });
}

/* ================================
   INICIALIZAÇÃO
   ================================ */

async function initializeSendSystem() {
  console.log('[INIT] Inicializando sistema de envio');
  
  try {
    // Configurar monitor de conexão
    setupSendConnectionMonitor();
    
    // Abrir banco de dados
    const db = new SendDatabase();
    await db.open();
    
    // Verificar se há registros pendentes
    const stats = await getSendStats();
    
    console.log('[INIT] Sistema de envio pronto', stats);
    
    return {
      success: true,
      stats: stats.success ? stats.stats : null,
      isOnline: navigator.onLine
    };
    
  } catch (error) {
    console.error('[INIT] Erro na inicialização:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/* ================================
   EXPORTAÇÃO
   ================================ */

window.SocialColetorSend = {
  // Funções principais
  sendToGoogleSheets,
  syncOfflineData,
  initialize: initializeSendSystem,
  
  // Utilitários
  getStats: getSendStats,
  clearDatabase: clearSendDatabase,
  
  // Configuração
  setConfig: (newConfig) => {
    Object.assign(CONFIG, newConfig);
    console.log('[CONFIG] Atualizado:', CONFIG);
  },
  
  // Status
  getStatus: () => ({
    config: CONFIG,
    isOnline: navigator.onLine,
    dbName: CONFIG.DB_NAME
  })
};

/* ================================
   INICIALIZAÇÃO AUTOMÁTICA
   ================================ */

// Aguardar um pouco após o carregamento
setTimeout(() => {
  initializeSendSystem().then(result => {
    if (result.success && result.stats && result.stats.pending > 0 && navigator.onLine) {
      // Sincronizar automaticamente se houver dados pendentes
      setTimeout(syncOfflineData, 3000);
    }
  });
}, 1500);

console.log('[SEND] Sistema de envio carregado');
