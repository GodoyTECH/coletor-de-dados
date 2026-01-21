/**
 * send.js - Social Coletor (Com botões de ação pós-envio)
 * ===========================================================
 * 
 * Adiciona:
 * 1. Botão "Ver Planilha" após envio bem-sucedido
 * 2. Botão "Limpar e Voltar"
 * 3. Opção de "Novo Registro"
 */

/* ================================
   CONFIGURAÇÕES
   ================================ */

const CONFIG = {
  NETLIFY_FUNCTION_URL: "/.netlify/functions/sc-api",
  USE_NETLIFY_FUNCTION: true,

  SYSTEM_URL: "https://script.google.com/macros/s/AKfycby_X624TtHgbKzNf4Qf7mgdhX4Ibh1swPIDweteNRplJtWjQDsNmPJKaf8nn29YhIRI/exec",

  GOOGLE_SHEETS_URL: "https://docs.google.com/spreadsheets/d/1Shrv8LbY_UlXBGVjoYNl5zqmkfJbOrv7Z2dA0At8d_A/edit?gid=768807706#gid=768807706",
  PANEL_URL: "painel.html",

  DB_NAME: "SocialColetor_SendDB",
  STORE_NAME: "envios_pendentes",
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000,
  REQUEST_TIMEOUT: 25000,
};


let SC_MESSAGE_LOCK = false;

function shouldUseNetlifyFunction() {
  return Boolean(CONFIG.USE_NETLIFY_FUNCTION && CONFIG.NETLIFY_FUNCTION_URL);
}

function getSendEndpoint() {
  return shouldUseNetlifyFunction() ? CONFIG.NETLIFY_FUNCTION_URL : CONFIG.APPS_SCRIPT_URL;
}

async function parseJsonResponse_(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function safeStatusMessage(msg, type = "info") {
  if (SC_MESSAGE_LOCK) return;
  SC_MESSAGE_LOCK = true;

  if (window.showStatusMessage) {
    window.showStatusMessage(msg, type);
  }

  setTimeout(() => {
    SC_MESSAGE_LOCK = false;
  }, 1200);
}

/* ================================
   BOTÕES DE AÇÃO PÓS-ENVIO
   ================================ */

function showActionButtons(successData = null) {
  console.log('[ACTION] Mostrando botões de ação pós-envio');

  // Primeiro, esconder o modal existente
  if (window.hideModal) {
    window.hideModal();
  }

  // Criar overlay para os botões de ação
  const overlay = document.createElement('div');
  overlay.id = 'sc-action-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    animation: fadeIn 0.3s ease;
  `;

  // Conteúdo da caixa de ação
  const actionBox = document.createElement('div');
  actionBox.style.cssText = `
    background: white;
    padding: 25px;
    border-radius: 16px;
    width: 90%;
    max-width: 420px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    animation: slideUp 0.4s ease;
  `;

  // Título baseado no resultado
  const title = document.createElement('h3');
  title.textContent = successData ? '✅' : '📋 Dados Salvos Localmente';
  title.style.cssText = `
    margin: 0 0 15px 0;
    color: ${successData ? '#10b981' : '#3b82f6'};
    font-size: 20px;
    font-weight: 600;
  `;

  // Mensagem
  const message = document.createElement('p');
  if (successData) {
    message.innerHTML = `
      Registro enviado para a planilha!<br>
      <small style="color: #666; font-size: 13px;">
        Data: ${new Date().toLocaleDateString('pt-BR')}<br>
        Hora: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </small>
    `;
  } else {
    message.innerHTML = `
      Os dados foram salvos localmente.<br>
      Serão enviados automaticamente quando a conexão voltar.<br>
      <small style="color: #666; font-size: 13px;">
        Você pode continuar offline.
      </small>
    `;
  }
  message.style.cssText = `
    margin: 0 0 25px 0;
    color: #444;
    line-height: 1.5;
  `;

  // Container para botões
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;

  // Botão VER PLANILHA (apenas se enviou com sucesso)
  if (successData) {
    const dashboardBtn = document.createElement('button');
    dashboardBtn.innerHTML = `
      <svg style="width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;"
           fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 13h6v7H4v-7zm10-9h6v16h-6V4zM4 4h6v7H4V4z" />
      </svg>
      Dashboard
    `;
    dashboardBtn.style.cssText = `
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      padding: 14px 20px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    `;

    dashboardBtn.onmouseover = () => {
      dashboardBtn.style.transform = 'translateY(-2px)';
      dashboardBtn.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
    };

    dashboardBtn.onmouseout = () => {
      dashboardBtn.style.transform = 'translateY(0)';
      dashboardBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
    };

    dashboardBtn.onclick = () => {
      window.open(CONFIG.PANEL_URL, '_blank');
      setTimeout(() => {
        closeActionOverlay();
      }, 300);
    };

    buttonContainer.appendChild(dashboardBtn);

    const viewSheetBtn = document.createElement('button');
    viewSheetBtn.innerHTML = `
      <svg style="width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;" 
           fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Ver Planilha
    `;
    viewSheetBtn.style.cssText = `
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      padding: 14px 20px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    `;

    viewSheetBtn.onmouseover = () => {
      viewSheetBtn.style.transform = 'translateY(-2px)';
      viewSheetBtn.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
    };

    viewSheetBtn.onmouseout = () => {
      viewSheetBtn.style.transform = 'translateY(0)';
      viewSheetBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    };

    viewSheetBtn.onclick = () => {
      // Abrir SUA planilha específica em nova aba
      window.open(CONFIG.GOOGLE_SHEETS_URL, '_blank');

      // Opcional: fechar a caixa de ação após abrir a planilha
      setTimeout(() => {
        closeActionOverlay();
      }, 300);
    };

    buttonContainer.appendChild(viewSheetBtn);
  }

  // Botão LIMPAR E VOLTAR
  const clearBtn = document.createElement('button');
  clearBtn.innerHTML = `
    <svg style="width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;" 
         fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
    Limpar e Voltar
  `;
  clearBtn.style.cssText = `
    background: ${successData ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'};
    color: white;
    border: none;
    padding: 14px 20px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px ${successData ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)'};
  `;

  clearBtn.onmouseover = () => {
    clearBtn.style.transform = 'translateY(-2px)';
    clearBtn.style.boxShadow = `0 6px 16px ${successData ? 'rgba(59, 130, 246, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`;
  };

  clearBtn.onmouseout = () => {
    clearBtn.style.transform = 'translateY(0)';
    clearBtn.style.boxShadow = `0 4px 12px ${successData ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`;
  };

  clearBtn.onclick = () => {
    // Chamar função clearForm do JS principal se existir
    if (window.clearForm) {
      window.clearForm();
    } else {
      // Fallback: recarregar a página se a função não existir
      window.location.reload();
    }

    // Fechar a caixa de ação
    closeActionOverlay();
  };

  buttonContainer.appendChild(clearBtn);

  // Botão NOVO REGISTRO (opcional)
  const newRecordBtn = document.createElement('button');
  newRecordBtn.innerHTML = `
    <svg style="width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;" 
         fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
    Continuar Editando
  `;
  newRecordBtn.style.cssText = `
    background: transparent;
    color: #6b7280;
    border: 2px solid #e5e7eb;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    margin-top: 5px;
  `;

  newRecordBtn.onmouseover = () => {
    newRecordBtn.style.backgroundColor = '#f9fafb';
    newRecordBtn.style.borderColor = '#d1d5db';
  };

  newRecordBtn.onmouseout = () => {
    newRecordBtn.style.backgroundColor = 'transparent';
    newRecordBtn.style.borderColor = '#e5e7eb';
  };

  newRecordBtn.onclick = () => {
    // Fechar a caixa de ação
    closeActionOverlay();

    // Se houver função para focar no primeiro campo
    if (window.focusFirstField) {
      window.focusFirstField();
    }
  };

  buttonContainer.appendChild(newRecordBtn);

  // Adicionar CSS para animações
  if (!document.querySelector('#action-styles')) {
    const style = document.createElement('style');
    style.id = 'action-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      #sc-action-overlay button:hover {
        transform: translateY(-2px);
      }
    `;
    document.head.appendChild(style);
  }

  // Montar a estrutura
  actionBox.appendChild(title);
  actionBox.appendChild(message);
  actionBox.appendChild(buttonContainer);
  overlay.appendChild(actionBox);

  // Adicionar ao documento
  document.body.appendChild(overlay);

  // Fechar ao clicar fora (opcional)
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeActionOverlay();
    }
  };
}

function closeActionOverlay() {
  const overlay = document.getElementById('sc-action-overlay');
  if (overlay) {
    overlay.style.animation = 'fadeOut 0.3s ease';

    // Adicionar animação de fadeOut se não existir
    if (!document.querySelector('#fadeOut-style')) {
      const style = document.createElement('style');
      style.id = 'fadeOut-style';
      style.textContent = `
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);
  }
}

/* ================================
   FUNÇÃO PRINCIPAL DE ENVIO ATUALIZADA
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

      // Mostrar botões de ação para offline
      setTimeout(() => {
        if (window.hideModal) window.hideModal();
        showActionButtons(); // Sem successData = modo offline
      }, 500);

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
    const endpoint = getSendEndpoint();
    const useNetlify = shouldUseNetlifyFunction();
    console.log('[SEND] Enviando para:', endpoint);

    // Timeout configurável
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    const response = await fetch(endpoint, {
      method: 'POST',
      mode: useNetlify ? 'cors' : 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (useNetlify) {
      const result = await parseJsonResponse_(response);
      if (!response.ok || !result || !result.success) {
        throw new Error(result?.error || `Falha no servidor (${response.status})`);
      }

      const successData = {
        success: true,
        recordId: result.recordId || `SC${new Date().getTime().toString().slice(-8)}`,
        timestamp: result.timestamp || new Date().toLocaleTimeString('pt-BR'),
        online: true,
        message: result.message || 'Dados enviados para Google Sheets'
      };

      setTimeout(() => {
        if (window.hideModal) window.hideModal();
        showActionButtons(successData);
      }, 500);

      return successData;
    }

    console.log('[SEND] Resposta recebida, status:', response.type);

    // Em modo no-cors, assumimos sucesso se não houve erro de rede
    if (response.type === 'opaque') {
      console.log('[SEND] Envio bem-sucedido (modo no-cors)');

      // Dados para mostrar na tela de sucesso
      const successData = {
        success: true,
        recordId: `SC${new Date().getTime().toString().slice(-8)}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        online: true,
        message: 'Dados enviados para Google Sheets'
      };

      // Mostrar botões de ação com sucesso
      setTimeout(() => {
        if (window.hideModal) window.hideModal();
        showActionButtons(successData);
      }, 500);

      return successData;

    } else {
      throw new Error('Resposta não-opaque do servidor');
    }

  } catch (error) {
    if (shouldUseNetlifyFunction()) {
      console.warn('[SEND] Falha na Netlify Function, tentando Apps Script direto:', error);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        const fallbackResponse = await fetch(CONFIG.APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (fallbackResponse.type === 'opaque') {
          const successData = {
            success: true,
            recordId: `SC${new Date().getTime().toString().slice(-8)}`,
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            online: true,
            message: 'Dados enviados para Google Sheets'
          };

          if (window.hideModal) window.hideModal();
          showActionButtons(successData);
          return successData;
        }
      } catch (fallbackError) {
        console.error('[SEND] Falha no fallback Apps Script:', fallbackError);
      }
    }

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

        // Mostrar botões de ação para erro de rede
        setTimeout(() => {
          if (window.hideModal) window.hideModal();
          showActionButtons(); // Sem successData = modo erro
        }, 500);

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
   BANCO DE DADOS (mantido igual - NÃO REMOVER)
   ================================ */

class SendDatabase {
  constructor() {
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
          const store = db.createObjectStore(CONFIG.STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
          });

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
   FUNÇÕES RESTANTES (mantidas iguais)
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

        const endpoint = getSendEndpoint();
        const useNetlify = shouldUseNetlifyFunction();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        let response = await fetch(endpoint, {
          method: 'POST',
          mode: useNetlify ? 'cors' : 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record.data),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Se usa Netlify, valida JSON/sucesso; se falhar, tenta fallback Apps Script (mantém padrão do sendToGoogleSheets)
        if (useNetlify) {
          const result = await parseJsonResponse_(response);
          if (!response.ok || !result || !result.success) {
            throw new Error(result?.error || `Falha no servidor (${response.status})`);
          }
        } else {
          // no-cors: success se não deu erro de rede => response opaque
          if (response.type !== 'opaque') {
            throw new Error('Resposta não-opaque do servidor');
          }
        }

        // Marca como enviado
        await db.updateRecord(record.id, {
          status: 'sent',
          attempts: (record.attempts || 0) + 1,
          sentAt: new Date().toISOString(),
          lastError: '',
          updatedAt: new Date().toISOString()
        });

        successCount++;
        console.log(`[SYNC] ✅ Registro enviado: ${record.offlineId}`);

      } catch (error) {
        // Fallback: se falhou na Netlify Function, tenta Apps Script direto (igual ao sendToGoogleSheets)
        let fallbackOk = false;

        if (shouldUseNetlifyFunction()) {
          console.warn('[SYNC] Falha na Netlify Function, tentando Apps Script direto:', error);
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            const fallbackResponse = await fetch(CONFIG.APPS_SCRIPT_URL, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(record.data),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (fallbackResponse.type === 'opaque') {
              fallbackOk = true;

              await db.updateRecord(record.id, {
                status: 'sent',
                attempts: (record.attempts || 0) + 1,
                sentAt: new Date().toISOString(),
                lastError: '',
                updatedAt: new Date().toISOString()
              });

              successCount++;
              console.log(`[SYNC] ✅ Registro enviado via fallback: ${record.offlineId}`);
            }
          } catch (fallbackError) {
            console.error('[SYNC] Falha no fallback Apps Script:', fallbackError);
          }
        }

        if (!fallbackOk) {
          errorCount++;

          const nextAttempts = (record.attempts || 0) + 1;
          const willFail = nextAttempts >= CONFIG.MAX_RETRIES;

          await db.updateRecord(record.id, {
            attempts: nextAttempts,
            status: willFail ? 'failed' : 'pending',
            lastError: String(error?.message || error),
            updatedAt: new Date().toISOString()
          });

          console.warn(`[SYNC] ❌ Falha no registro ${record.offlineId}. Tentativas: ${nextAttempts}/${CONFIG.MAX_RETRIES}`, error);
        }
      }
    }

    console.log(`[SYNC] Concluído: ${successCount} sucesso, ${errorCount} falhas`);

    if (window.showStatusMessage && successCount > 0) {
      window.showStatusMessage(
        `✅ ${successCount} registro(s) sincronizado(s)`,
        'success'
      );
    } else if (window.showStatusMessage && errorCount > 0) {
      window.showStatusMessage(
        `⚠️ ${errorCount} registro(s) falharam ao sincronizar`,
        'warning'
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

function setupSendConnectionMonitor() {
  window.addEventListener('online', () => {
    console.log('[NETWORK] Conexão restabelecida');

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

async function initializeSendSystem() {
  console.log('[INIT] Inicializando sistema de envio');

  try {
    setupSendConnectionMonitor();

    const db = new SendDatabase();
    await db.open();

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
   EXPORTAÇÃO ATUALIZADA
   ================================ */

window.SocialColetorSend = {
  // Funções principais
  sendToGoogleSheets,
  syncOfflineData,
  initialize: initializeSendSystem,

  // Novas funções de interface
  showActionButtons,
  closeActionOverlay,

  // Utilitários
  getStats: getSendStats,

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

setTimeout(() => {
  initializeSendSystem().then(result => {
    if (result.success && result.stats && result.stats.pending > 0 && navigator.onLine) {
      setTimeout(syncOfflineData, 3000);
    }
  });
}, 1500);

console.log('[SEND] Sistema de envio com botões de ação carregado');
