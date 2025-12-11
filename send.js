/**
 * SOCIAL COLETOR - FUNÇÕES DE ENVIO (VERSÃO MELHORADA)
 * Responsável pelo envio dos dados para o Google Sheets via Apps Script
 * Com validação, retentativas, timeout e fallback
 */

// ============================================
// CONFIGURAÇÃO DO APPS SCRIPT
// ============================================

// ATENÇÃO: substitua pela URL do seu Web App após publicá-lo
let APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzJbyvcjd4VUmCdyzf3o-xcMK9kqJDRGPAQsp4EcKZxKnaQ_Ecn6h4BbPfKC2elMIer3w/exec';

// ============================================
// CONSTANTES E CONFIGURAÇÕES
// ============================================
const CONFIG = {
    MAX_RETRIES: 3,
    REQUEST_TIMEOUT: 15000, // 15 segundos
    RETRY_DELAY_BASE: 1000, // 1 segundo base para backoff exponencial
    LOCAL_STORAGE_KEY: 'pending_submissions'
};

// ============================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================

/**
 * Valida os dados do formulário
 * @param {Object} formData - Dados do formulário
 * @throws {Error} Se validação falhar
 */
function validateFormData(formData) {
    console.log('🔍 Validando dados...');
    
    // Campos obrigatórios
    const requiredFields = ['nome', 'telefone', 'bairro'];
    const missing = requiredFields.filter(field => !formData[field]?.trim());
    
    if (missing.length > 0) {
        throw new Error(`Campos obrigatórios faltando: ${missing.join(', ')}`);
    }
    
    // Validação de quantidade
    if (formData.quantidade !== undefined && formData.quantidade !== null) {
        const qtd = parseFloat(formData.quantidade);
        if (isNaN(qtd)) {
            throw new Error('Quantidade deve ser um número válido');
        }
        if (qtd < 0) {
            throw new Error('Quantidade não pode ser negativa');
        }
    }
    
    // Validação de telefone (básica)
    const phone = formData.telefone?.replace(/\D/g, '');
    if (phone && phone.length < 10) {
        throw new Error('Telefone inválido. Deve conter pelo menos 10 dígitos');
    }
    
    console.log('✅ Validação concluída com sucesso');
    return true;
}

// ============================================
// FUNÇÕES DE UTILIDADE
// ============================================

/**
 * Realiza fetch com timeout e retentativas
 * @param {string} url - URL para requisição
 * @param {Object} options - Opções do fetch
 * @param {number} maxRetries - Número máximo de tentativas
 * @returns {Promise<Response>} Resposta da requisição
 */
async function fetchWithRetry(url, options, maxRetries = CONFIG.MAX_RETRIES) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        
        try {
            console.log(`🔄 Tentativa ${attempt + 1} de ${maxRetries}...`);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                console.log(`✅ Requisição bem-sucedida na tentativa ${attempt + 1}`);
                return response;
            }
            
            // Se não for sucesso, mas não for erro de rede, tentamos novamente
            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            
        } catch (error) {
            clearTimeout(timeoutId);
            lastError = error;
            
            // Se for abort por timeout, mensagem específica
            if (error.name === 'AbortError') {
                lastError = new Error('Tempo limite excedido. Verifique sua conexão.');
            }
        }
        
        // Se não for a última tentativa, aguarda antes de tentar novamente
        if (attempt < maxRetries - 1) {
            const delay = CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt); // Backoff exponencial
            console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

/**
 * Salva dados pendentes no localStorage como fallback
 * @param {Object} formData - Dados do formulário
 */
function saveToLocalStorage(formData) {
    try {
        const pendingSubmissions = JSON.parse(localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY) || '[]');
        
        const submission = {
            ...formData,
            quantidade: parseFloat(formData.quantidade) || 0,
            timestamp: new Date().toISOString(),
            retryCount: 0
        };
        
        pendingSubmissions.push(submission);
        localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(pendingSubmissions));
        
        console.log('💾 Dados salvos localmente para envio posterior');
        console.log(`📊 Total de envios pendentes: ${pendingSubmissions.length}`);
        
        return pendingSubmissions.length;
    } catch (error) {
        console.error('❌ Erro ao salvar no localStorage:', error);
        return 0;
    }
}

/**
 * Tenta reenviar envios pendentes do localStorage
 * @returns {Promise<number>} Número de envios bem-sucedidos
 */
async function retryPendingSubmissions() {
    try {
        const pendingSubmissions = JSON.parse(localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY) || '[]');
        
        if (pendingSubmissions.length === 0) {
            return 0;
        }
        
        console.log(`🔄 Tentando reenviar ${pendingSubmissions.length} envio(s) pendente(s)...`);
        
        const successful = [];
        const failed = [];
        
        for (const [index, submission] of pendingSubmissions.entries()) {
            try {
                // Remove dados que não devem ser reenviados
                const { retryCount, ...dataToSend } = submission;
                
                const response = await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors', // Mantido para compatibilidade
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(dataToSend)
                });
                
                // Com 'no-cors' não podemos verificar response.ok
                // Assumimos sucesso se não houve erro de rede
                successful.push(submission);
                console.log(`✅ Envio pendente ${index + 1} bem-sucedido`);
                
            } catch (error) {
                // Incrementa contador de tentativas
                submission.retryCount = (submission.retryCount || 0) + 1;
                
                // Remove se tiver muitas tentativas falhas
                if (submission.retryCount >= 5) {
                    console.log(`🗑️ Removendo envio ${index + 1} após 5 tentativas falhas`);
                } else {
                    failed.push(submission);
                }
            }
        }
        
        // Atualiza localStorage com os que ainda falharam
        localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(failed));
        
        console.log(`📊 Resultado: ${successful.length} bem-sucedidos, ${failed.length} ainda pendentes`);
        return successful.length;
        
    } catch (error) {
        console.error('❌ Erro ao processar envios pendentes:', error);
        return 0;
    }
}

// ============================================
// FUNÇÃO PRINCIPAL DE ENVIO
// ============================================

/**
 * Envia dados para o Google Sheets
 * @param {Object} formData - Dados do formulário
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendToGoogleSheets(formData) {
    // Usa showModal global do script.js
    if (typeof showModal === 'function') {
        showModal('Processando...', 'Validando dados...');
    }
    
    try {
        // 1. Validação
        validateFormData(formData);
        
        // 2. Preparação dos dados
        const payload = {
            ...formData,
            quantidade: parseFloat(formData.quantidade) || 0,
            timestamp: new Date().toLocaleString('pt-BR'),
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };
        
        console.log('📤 Payload preparado:', payload);
        
        if (typeof showModal === 'function') {
            showModal('Enviando...', 'Conectando com o servidor...');
        }
        
        // 3. Tentativa de envio
        let response;
        try {
            response = await fetchWithRetry(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors', // Mantido como no original
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            console.log('✅ Requisição enviada com sucesso');
            
        } catch (fetchError) {
            console.warn('⚠️ Falha no envio online. Salvando localmente...');
            
            // Salva localmente como fallback
            const pendingCount = saveToLocalStorage(payload);
            
            // Mostra mensagem apropriada
            if (typeof showModal === 'function') {
                const message = fetchError.message.includes('Tempo limite') 
                    ? 'Tempo limite excedido. Dados salvos para envio posterior.'
                    : `Falha na conexão. Dados salvos localmente (${pendingCount} pendentes).`;
                
                showModal('⚠️ Envio Pendente', message, false);
            }
            
            return {
                success: false,
                savedLocally: true,
                pendingCount: pendingCount,
                error: fetchError.message
            };
        }
        
        // 4. Sucesso
        if (typeof showModal === 'function') {
            showModal('✅ Sucesso!', 'Dados enviados com sucesso!', false);
        }
        
        // 5. Tenta enviar pendentes após sucesso
        setTimeout(retryPendingSubmissions, 2000);
        
        return {
            success: true,
            savedLocally: false,
            timestamp: payload.timestamp
        };
        
    } catch (validationError) {
        // Erro de validação
        console.error('❌ Erro de validação:', validationError);
        
        if (typeof showModal === 'function') {
            showModal('❌ Erro de Validação', validationError.message, false);
        }
        
        return {
            success: false,
            savedLocally: false,
            error: validationError.message,
            isValidationError: true
        };
        
    } catch (error) {
        // Erro genérico
        console.error('❌ Erro inesperado:', error);
        
        if (typeof showModal === 'function') {
            showModal('❌ Erro no Envio', 'Ocorreu um erro inesperado: ' + (error.message || error), false);
        }
        
        return {
            success: false,
            savedLocally: false,
            error: error.message || 'Erro desconhecido'
        };
    }
}

// ============================================
// FUNÇÕES DE CONFIGURAÇÃO E STATUS
// ============================================

/**
 * Define a URL do Apps Script
 * @param {string} url - Nova URL
 */
function setAppsScriptUrl(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('URL inválida');
    }
    
    APPS_SCRIPT_URL = url;
    console.log('🔧 URL do Apps Script atualizada:', url);
    
    // Tenta enviar pendentes quando a URL é atualizada
    if (typeof localStorage !== 'undefined') {
        const pending = JSON.parse(localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY) || '[]');
        if (pending.length > 0) {
            console.log(`🔄 Nova URL definida. Tentando ${pending.length} envio(s) pendente(s)...`);
            setTimeout(retryPendingSubmissions, 1000);
        }
    }
}

/**
 * Obtém a URL atual do Apps Script
 * @returns {string} URL atual
 */
function getAppsScriptUrl() {
    return APPS_SCRIPT_URL;
}

/**
 * Obtém status dos envios pendentes
 * @returns {Object} Status dos envios
 */
function getSubmissionStatus() {
    try {
        const pendingSubmissions = JSON.parse(localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY) || '[]');
        
        return {
            pendingCount: pendingSubmissions.length,
            lastAttempt: pendingSubmissions.length > 0 
                ? new Date(pendingSubmissions[0].timestamp).toLocaleString('pt-BR')
                : null,
            oldestPending: pendingSubmissions.length > 0
                ? pendingSubmissions[pendingSubmissions.length - 1]
                : null
        };
    } catch (error) {
        return {
            pendingCount: 0,
            lastAttempt: null,
            error: error.message
        };
    }
}

/**
 * Limpa todos os envios pendentes
 * @returns {number} Número de envios removidos
 */
function clearPendingSubmissions() {
    try {
        const pendingSubmissions = JSON.parse(localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY) || '[]');
        localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        
        console.log(`🗑️ ${pendingSubmissions.length} envio(s) pendente(s) removido(s)`);
        return pendingSubmissions.length;
    } catch (error) {
        console.error('❌ Erro ao limpar envios pendentes:', error);
        return 0;
    }
}

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================

// Tenta enviar pendentes quando a página carrega
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Pequeno delay para não interferir no carregamento
        setTimeout(() => {
            const status = getSubmissionStatus();
            if (status.pendingCount > 0) {
                console.log(`📋 ${status.pendingCount} envio(s) pendente(s) encontrado(s) ao iniciar`);
                
                // Tenta reenviar em background
                retryPendingSubmissions().then(successCount => {
                    if (successCount > 0) {
                        console.log(`✅ ${successCount} envio(s) pendente(s) processado(s) em background`);
                    }
                });
            }
        }, 3000);
    });
}

// Nota: Não exportamos module.exports (não é Node)
// As funções estarão disponíveis globalmente se incluídas via <script>
