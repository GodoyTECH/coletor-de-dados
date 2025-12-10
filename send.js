/**
 * SOCIAL COLETOR - FUNÇÕES DE ENVIO (corrigido)
 * Responsável pelo envio dos dados para o Google Sheets via Apps Script
 */

// ============================================
// CONFIGURAÇÃO DO APPS SCRIPT
// ============================================

// ATENÇÃO: substitua pela URL do seu Web App após publicá-lo
let APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_WEB_APP_URL/exec';

// ============================================
// FUNÇÃO PRINCIPAL DE ENVIO
// ============================================
async function sendToGoogleSheets(formData) {
    // usa showModal global do script.js
    showModal('Enviando...', 'Enviando dados para o Google Sheets...');

    try {
        const payload = {
            ...formData,
            quantidade: parseFloat(formData.quantidade) || 0,
            timestamp: new Date().toLocaleString('pt-BR')
        };

        console.log('📤 Payload (enviando):', payload);

        // ATENÇÃO: por enquanto mantemos no-cors se você ainda não habilitou CORS no Apps Script.
        // Isso fará com que a resposta seja opaca e não possamos ler o corpo. Em produção, prefira 'cors'.
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
        showModal('✅ Sucesso!', 'Dados enviados (simulação). Configure Apps Script para respostas reais.', false);

        // Em produção, faça showSuccess() real
        return { success: true };

    } catch (error) {
        console.error('❌ Erro ao enviar dados:', error);
        showModal('❌ Erro no Envio', 'Não foi possível enviar os dados: ' + (error.message || error), false);
        return { success: false, error: error.message || error };
    }
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

// Não exportamos module.exports (não é Node)
