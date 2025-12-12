/**
 * SOCIAL COLETOR - FUNÇÕES DE ENVIO SIMPLIFICADO
 * Modo automático: salva offline sem perguntar, sincroniza automaticamente
 */

// ============================================
// CONFIGURAÇÃO DO APPS SCRIPT
// ============================================

let APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBrQZFDBTqNfz4PdsaIwG3i7VdR9tgMKap_U-_a9OQ-4MVluDchrSed1rgtql1SdQozQ/exec';

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let isOnline = navigator.onLine;
const DB_NAME = 'SocialColetorDB';

// Monitorar conexão
window.addEventListener('online', () => {
  isOnline = true;
  console.log('🌐 Conectado - Sincronizando...');
  syncPendingSubmissions();
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('📴 Offline - Modo automático ativado');
});

// ============================================
// FUNÇÃO PRINCIPAL DE ENVIO (SIMPLIFICADA)
// ============================================
async function sendToGoogleSheets(formData) {
    showModal('Enviando...', 'Processando seus dados...', true);
    
    try {
        // Preparar payload
        const payload = {
            ...formData,
            quantidade: parseFloat(formData.quantidade) || 0,
            timestamp: new Date().toLocaleString('pt-BR'),
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };

        console.log('📤 Tentando enviar:', payload);

        // Tentar enviar (online)
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('✅ Enviado com sucesso!');
        
        // Mostrar opções: Ver Planilha ou Voltar
        hideModal();
        showSuccessOptions();
        
        return { 
            success: true, 
            online: true 
        };

    } catch (error) {
        console.error('❌ Falha no envio:', error);
        
        // Se falhou (offline ou erro), salvar automaticamente
        return await saveAndContinue(formData);
    }
}

// ============================================
// SALVAR AUTOMATICAMENTE (SEM PERGUNTAR)
// ============================================
async function saveAndContinue(formData) {
    try {
        // Salvar no IndexedDB automaticamente
        const db = await openDatabase();
        const id = await saveToIndexedDB(db, formData);
        
        console.log(`💾 Salvo automaticamente (ID: ${id}) - Offline detectado`);
        
        // Registrar sync para quando voltar online
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('sync-pending-data');
            } catch (swError) {
                console.log('⚠️ SyncManager não disponível, mas dados salvos');
            }
        }
        
        // Mostrar mensagem e opções
        hideModal();
        showOfflineSuccessOptions(id);
        
        return {
            success: false,
            savedOffline: true,
            offlineId: id,
            message: 'Salvo automaticamente para envio posterior'
        };
        
    } catch (error) {
        console.error('❌ Erro ao salvar offline:', error);
        hideModal();
        showErrorOptions();
        return { 
            success: false, 
            error: 'Falha ao processar' 
        };
    }
}

// ============================================
// OPÇÕES DE UI (SIMPLES)
// ============================================

// Opções após sucesso ONLINE
function showSuccessOptions() {
    const dialog = createSimpleDialog(
        '✅ Dados Enviados!',
        'Seus dados foram enviados com sucesso para a planilha.',
        [
            { text: '📊 Ver Planilha', action: 'view', color: '#4CAF50' },
            { text: '↩️ Voltar', action: 'back', color: '#666' }
        ]
    );
    
    document.body.appendChild(dialog);
}

// Opções após sucesso OFFLINE (salvamento automático)
function showOfflineSuccessOptions(savedId) {
    const dialog = createSimpleDialog(
        '💾 Dados Salvos',
        `Você está offline. Os dados foram salvos automaticamente (ID: ${savedId}) e serão enviados quando a conexão voltar.`,
        [
            { text: '📊 Ver Planilha', action: 'view', color: '#4CAF50' },
            { text: '↩️ Continuar Coletando', action: 'back', color: '#666' }
        ]
    );
    
    document.body.appendChild(dialog);
}

// Opções em caso de erro
function showErrorOptions() {
    const dialog = createSimpleDialog(
        '⚠️ Atenção',
        'Não foi possível processar os dados. Tente novamente.',
        [
            { text: '↩️ Voltar', action: 'back', color: '#666' }
        ]
    );
    
    document.body.appendChild(dialog);
}

// Criar diálogo simples
function createSimpleDialog(title, message, buttons) {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeIn 0.3s;
    `;
    
    // Criar estilos para animação
    if (!document.querySelector('#dialog-styles')) {
        const style = document.createElement('style');
        style.id = 'dialog-styles';
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
    }
    
    dialog.innerHTML = `
        <div style="
            background: white;
            padding: 30px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            animation: slideUp 0.3s;
        ">
            <h2 style="color: #0a0e29; margin-bottom: 15px;">${title}</h2>
            <p style="color: #666; margin-bottom: 25px; line-height: 1.5;">${message}</p>
            
            <div style="display: flex; gap: 10px; justify-content: center;">
                ${buttons.map(btn => `
                    <button 
                        onclick="this.closest('div[style*=\"position: fixed\"]').remove(); handleDialogAction('${btn.action}')"
                        style="
                            background: ${btn.color};
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: bold;
                            font-size: 14px;
                            transition: opacity 0.2s;
                            min-width: 140px;
                        "
                        onmouseover="this.style.opacity='0.9'"
                        onmouseout="this.style.opacity='1'"
                    >
                        ${btn.text}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    
    return dialog;
}

// Manipular ações do diálogo
window.handleDialogAction = function(action) {
    switch(action) {
        case 'view':
            // Abrir planilha do Google Sheets
            window.open('https://docs.google.com/spreadsheets/', '_blank');
            break;
        case 'back':
            // Voltar para o formulário (o formulário já está limpo pelo script.js)
            console.log('Voltando ao formulário...');
            break;
    }
};

// ============================================
// INDEXEDDB (MESMO CÓDIGO)
// ============================================

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('submissions')) {
                const store = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp');
                store.createIndex('status', 'status');
            }
        };
        request.onsuccess = e => resolve(e.target.result);
        request.onerror = e => reject(e.target.error);
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
        request.onerror = e => reject(e.target.error);
    });
}

// ============================================
// SINCRONIZAÇÃO AUTOMÁTICA
// ============================================

async function syncPendingSubmissions() {
    if (!isOnline) return;
    
    try {
        const db = await openDatabase();
        const pending = await getPendingSubmissions(db);
        
        if (pending.length === 0) return;
        
        console.log(`🔄 Sincronizando ${pending.length} pendente(s)...`);
        
        // Mostrar notificação discreta se houver muitos pendentes
        if (pending.length > 3) {
            showModal('Sincronizando...', `${pending.length} dados pendentes sendo enviados...`, true);
        }
        
        for (const item of pending) {
            if (item.attempts >= 3) continue; // Pular falhas repetidas
            
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
                console.log(`⚠️ Falha no pendente ${item.id}, tentativa ${item.attempts + 1}`);
            }
        }
        
        hideModal();
        
        // Notificar se muitos foram enviados
        const sentCount = pending.filter(p => p.attempts < 3).length;
        if (sentCount > 0) {
            console.log(`✅ ${sentCount} dado(s) sincronizado(s) automaticamente`);
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
        request.onerror = e => reject(e.target.error);
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
        request.onerror = e => reject(e.target.error);
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
            if (data.attempts >= 3) data.status = 'failed';
            store.put(data);
            resolve();
        };
        request.onerror = e => reject(e.target.error);
    });
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Sincronizar automaticamente ao carregar se estiver online
if (isOnline) {
    setTimeout(() => {
        syncPendingSubmissions();
    }, 5000); // Esperar 5 segundos para não sobrecarregar
}

// Exportar funções principais
window.sendToGoogleSheets = sendToGoogleSheets;
window.syncPendingSubmissions = syncPendingSubmissions;

console.log('📦 send.js carregado - Modo automático');
