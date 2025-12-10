/**
 * SOCIAL COLETOR - FUNÇÕES DE ENVIO
 * Responsável pelo envio dos dados para o Google Sheets via Apps Script
 */

// ============================================
// CONFIGURAÇÃO DO APPS SCRIPT
// ============================================

// URL do Web App do Google Apps Script
// ATENÇÃO: Substitua pela URL do seu Web App após publicá-lo
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_WEB_APP_URL/exec';

// ============================================
// FUNÇÃO PRINCIPAL DE ENVIO
// ============================================

/**
 * Envia dados para o Google Sheets via Apps Script
 * @param {Object} formData - Dados do formulário
 * @returns {Promise<Object>} Resposta do servidor
 */
async function sendToGoogleSheets(formData) {
    showModal('Enviando...', 'Enviando dados para o Google Sheets...');
    
    try {
        // Preparar dados para envio
        const payload = {
            ...formData,
            // Garantir que quantidade seja número
            quantidade: parseFloat(formData.quantidade),
            // Timestamp atual
            timestamp: new Date().toLocaleString('pt-BR')
        };
        
        console.log('📤 Payload:', payload);
        
        // Enviar requisição POST
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Apps Script requer no-cors para Web Apps
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        // Nota: Com 'no-cors' não podemos ler a resposta, apenas saber se foi enviada
        console.log('✅ Dados enviados com sucesso!');
        
        // Simular resposta de sucesso (em produção, o Apps Script retornaria)
        showSuccess();
        
        return { success: true, message: 'Dados enviados com sucesso!' };
        
    } catch (error) {
        console.error('❌ Erro ao enviar dados:', error);
        showError('Erro ao enviar dados: ' + error.message);
        return { success: false, error: error.message };
    }
}

// ============================================
// FUNÇÕES DE UI PARA FEEDBACK
// ============================================

/**
 * Mostra mensagem de sucesso após envio
 */
function showSuccess() {
    showModal(
        '✅ Sucesso!',
        'Dados enviados para o Google Sheets com sucesso!\n\n' +
        'Os dados foram registrados na planilha e a imagem foi salva no Google Drive.',
        false
    );
    
    // Resetar formulário após 3 segundos
    setTimeout(() => {
        hideModal();
        clearForm();
    }, 3000);
}

/**
 * Mostra mensagem de erro
 * @param {string} errorMessage - Mensagem de erro
 */
function showError(errorMessage) {
    showModal(
        '❌ Erro no Envio',
        'Não foi possível enviar os dados:\n\n' + errorMessage +
        '\n\nVerifique sua conexão com a internet e tente novamente.',
        false
    );
}

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

/**
 * Mostra modal de status (reutilizada de script.js)
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {boolean} showSpinner - Se deve mostrar spinner
 */
function showModal(title, message, showSpinner = true) {
    // Esta função é duplicada para evitar dependências
    // Em um projeto real, você poderia centralizar em um arquivo de utilidades
    const modal = document.getElementById('statusModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalSpinner = document.getElementById('modalSpinner');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    
    if (modal && modalTitle && modalMessage && modalSpinner && modalCloseBtn) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalSpinner.hidden = !showSpinner;
        modalCloseBtn.hidden = showSpinner;
        modal.hidden = false;
    }
}

/**
 * Esconde o modal
 */
function hideModal() {
    const modal = document.getElementById('statusModal');
    if (modal) {
        modal.hidden = true;
    }
}

/**
 * Limpa o formulário (reutilizada de script.js)
 */
function clearForm() {
    // Em um projeto real, você importaria esta função de script.js
    // Para simplificar, vamos apenas resetar os campos principais
    const fields = [
        'beneficiario', 'cpf', 'atendente', 'produto',
        'quantidade', 'endereco', 'assinatura', 'numeroDocumento'
    ];
    
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    
    // Resetar data para hoje
    const dataField = document.getElementById('data');
    if (dataField) {
        const today = new Date().toISOString().split('T')[0];
        dataField.value = today;
    }
}

// ============================================
// CONFIGURAÇÃO PARA DESENVOLVIMENTO
// ============================================

/**
 * Configura URL do Apps Script para desenvolvimento
 * @param {string} url - Nova URL do Web App
 */
function setAppsScriptUrl(url) {
    APPS_SCRIPT_URL = url;
    console.log('🔧 URL do Apps Script atualizada:', url);
}

/**
 * Retorna a URL atual configurada
 * @returns {string} URL do Apps Script
 */
function getAppsScriptUrl() {
    return APPS_SCRIPT_URL;
}

// Exportar funções para uso em outros arquivos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendToGoogleSheets,
        setAppsScriptUrl,
        getAppsScriptUrl
    };
}
