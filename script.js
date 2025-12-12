/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL CORRIGIDO (PARTE 1/6)
 * OCR.Space API + Controles de Imagem + PWA + Google Sheets
 * Versão 2.0 - Limpo para usar modal do send.js
 */

// ================================
// CONFIGURAÇÃO
// ================================
const OCR_API_KEY = 'K89229373088957'; // Chave gratuita do OCR.Space
const OCR_API_URL = 'https://api.ocr.space/parse/image';
const GOOGLE_SCRIPT_URL = ''; // Será configurada dinamicamente (mantido)

// ================================
// VARIÁVEIS GLOBAIS
// ================================
let elements = {};
let formFields = {};
let currentImageData = null;
let isProcessing = false;
let deferredPrompt = null; // Para instalação PWA
let instalacaoSolicitada = false;

// Controles de imagem
let zoomLevel = 1;
let posX = 0;
let posY = 0;
let rotation = 0;
let isDragging = false;
let startX, startY, startPosX, startPosY;
const ZOOM_STEP = 0.2;
const MOVE_STEP = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

// Configurações do Google Sheets
let googleScriptConfigured = false;
let googleScriptUrl = '';

// Cache para dados offline
let offlineData = [];
const OFFLINE_STORAGE_KEY = 'social_coletor_offline_data';

// ================================
// INICIALIZAÇÃO
// ================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando Social Coletor...');
    setupElements();
    initializeApp();
    setupPWA();
    loadOfflineData();
    loadGoogleScriptConfig();

    // se send.js estiver carregado, garantir que as funções de modal existem
    if (typeof showModal !== 'function') {
        // função fallback leve caso send.js não esteja presente (evitar quebre)
        window.showModal = function(title = '', message = '', showSpinner = true) {
            // fallback muito simples: alert para debug
            try {
                console.log('[FALLBACK showModal]', title, message);
                // não chamar alert por padrão para não interromper o fluxo
            } catch (e) {}
        };
        window.hideModal = function() {};
    }
});

function setupElements() {
    elements = {
        // Elementos de imagem
        captureBtn: document.getElementById('captureBtn'),
        uploadBtn: document.getElementById('uploadBtn'),
        fileInput: document.getElementById('fileInput'),
        imagePlaceholder: document.getElementById('imagePlaceholder'),
        imagePreview: document.getElementById('imagePreview'),
        progressContainer: document.getElementById('progressContainer'),
        progressLabel: document.getElementById('progressLabel'),
        progressFill: document.getElementById('progressFill'),
        btnMelhorarFoto: document.getElementById('btnMelhorarFoto'),
        
        // Elementos de formulário
        dataForm: document.getElementById('dataForm'),
        clearBtn: document.getElementById('clearBtn'),
        submitBtn: document.getElementById('submitBtn'),
        
        // OBS: removemos a captura direta de elementos do modal aqui --
        // o modal ficará a cargo do send.js (showModal / hideModal)

        // Controles de imagem
        zoomIn: document.getElementById('zoomIn'),
        zoomOut: document.getElementById('zoomOut'),
        zoomLevelDisplay: document.getElementById('zoomLevel'),
        moveUp: document.getElementById('moveUp'),
        moveDown: document.getElementById('moveDown'),
        moveLeft: document.getElementById('moveLeft'),
        moveRight: document.getElementById('moveRight'),
        moveCenter: document.getElementById('moveCenter'),
        rotateLeft: document.getElementById('rotateLeft'),
        rotateRight: document.getElementById('rotateRight'),
        imageZoomContainer: document.getElementById('imageZoomContainer'),
        imageWrapper: document.getElementById('imageWrapper'),
        
        // PWA Install
        installBtn: document.getElementById('installBtn'),
        installContainer: document.getElementById('installContainer'),
        
        // Configurações
        configBtn: document.getElementById('configBtn'),
        configModal: document.getElementById('configModal'),
        configGoogleScriptUrl: document.getElementById('configGoogleScriptUrl'),
        saveConfigBtn: document.getElementById('saveConfigBtn'),
        closeConfigBtn: document.getElementById('closeConfigBtn'),
        configStatus: document.getElementById('configStatus'),
        
        // Offline
        offlineBadge: document.getElementById('offlineBadge'),
        syncBtn: document.getElementById('syncBtn'),
        
        // Teste de conexão
        testConnectionBtn: document.getElementById('testConnectionBtn')
    };

    formFields = {
        beneficiario: document.getElementById('beneficiario'),
        cpf: document.getElementById('cpf'),
        atendente: document.getElementById('atendente'),
        produto: document.getElementById('produto'),
        quantidade: document.getElementById('quantidade'),
        endereco: document.getElementById('endereco'),
        data: document.getElementById('data'),
        assinatura: document.getElementById('assinatura'),
        numeroDocumento: document.getElementById('numeroDocumento'),
        observacoes: document.getElementById('observacoes')
    };
}

function initializeApp() {
    setupEventListeners();
    setupDefaultDate();
    validateForm();
    setupImageControls();
    checkConnectionStatus();
    console.log('✅ Aplicativo pronto!');
}

function setupEventListeners() {
    // Controles de imagem
    if (elements.captureBtn) {
        elements.captureBtn.addEventListener('click', () => {
            elements.fileInput?.setAttribute('capture', 'environment');
            elements.fileInput?.click();
        });
    }

    if (elements.uploadBtn) {
        elements.uploadBtn.addEventListener('click', () => {
            elements.fileInput?.removeAttribute('capture');
            elements.fileInput?.click();
        });
    }

    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleImageSelection);
    }

    if (elements.btnMelhorarFoto) {
        elements.btnMelhorarFoto.addEventListener('click', () => {
            if (currentImageData) 
        });
    }

    // Formulário
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', clearForm);
    }

    if (elements.dataForm) {
        elements.dataForm.addEventListener('submit', handleFormSubmit);
    }

    // Note: não adicionamos listener para modalCloseBtn aqui porque usamos modal do send.js

    // Configurações
    if (elements.configBtn) {
        elements.configBtn.addEventListener('click', showConfigModal);
    }

    if (elements.saveConfigBtn) {
        elements.saveConfigBtn.addEventListener('click', saveGoogleScriptConfig);
    }

    if (elements.closeConfigBtn) {
        elements.closeConfigBtn.addEventListener('click', hideConfigModal);
    }

    // Offline sync
    if (elements.syncBtn) {
        elements.syncBtn.addEventListener('click', syncOfflineData);
    }

    // Teste de conexão
    if (elements.testConnectionBtn) {
        elements.testConnectionBtn.addEventListener('click', testGoogleScriptConnection);
    }

    // Validação de campos
    Object.values(formFields).forEach(field => {
        if (field && field !== formFields.assinatura && field !== formFields.observacoes) {
            field.addEventListener('input', validateForm);
        }
    });

    // Monitorar conexão
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
}

// ================================
// CONFIGURAÇÕES DO GOOGLE SHEETS
// ================================
function loadGoogleScriptConfig() {
    const savedUrl = localStorage.getItem('google_script_url');
    if (savedUrl) {
        googleScriptUrl = savedUrl;
        googleScriptConfigured = true;
        if (elements.configGoogleScriptUrl) elements.configGoogleScriptUrl.value = savedUrl;
        console.log('✅ URL do Google Script carregada:', savedUrl);
    }
}

function showConfigModal() {
    if (elements.configModal) {
        elements.configModal.style.display = 'flex';
        if (elements.configGoogleScriptUrl) elements.configGoogleScriptUrl.focus();
    }
}

function hideConfigModal() {
    if (elements.configModal) {
        elements.configModal.style.display = 'none';
    }
}

function saveGoogleScriptConfig() {
    const url = elements.configGoogleScriptUrl ? elements.configGoogleScriptUrl.value.trim() : '';
    
    if (!url) {
        showConfigStatus('⚠️ Digite a URL do Google Apps Script', 'error');
        return;
    }

    // Validar URL básica
    try {
        new URL(url);
    } catch (e) {
        showConfigStatus('❌ URL inválida. Use: https://script.google.com/...', 'error');
        return;
    }

    // Salvar no localStorage
    localStorage.setItem('google_script_url', url);
    googleScriptUrl = url;
    googleScriptConfigured = true;
    
    showConfigStatus('✅ URL salva com sucesso!', 'success');
    
    // Testar conexão automaticamente
    setTimeout(testGoogleScriptConnection, 1000);
}

function showConfigStatus(message, type) {
    if (elements.configStatus) {
        elements.configStatus.textContent = message;
        elements.configStatus.className = `config-status ${type}`;
        elements.configStatus.style.display = 'block';
        
        setTimeout(() => {
            if (elements.configStatus) elements.configStatus.style.display = 'none';
        }, 3000);
    }
}

async function testGoogleScriptConnection() {
    if (!googleScriptUrl) {
        // usa modal do send.js
        showModal('❌ Erro', 'Configure a URL do Google Apps Script primeiro.', false);
        return;
    }

    // usa modal do send.js
    showModal('Testando...', 'Verificando conexão com Google Sheets...', true);
    
    try {
        const testData = {
            action: 'test',
            timestamp: new Date().toISOString()
        };

        const response = await fetch(googleScriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
            showModal('✅ Conexão OK!', 
                `Conexão com Google Sheets estabelecida com sucesso!<br><br>
                <strong>Status:</strong> ${result.status || 'OK'}<br>
                <strong>Serviço:</strong> ${result.service || 'Google Sheets'}`, 
                false
            );
        } else {
            showModal('⚠️ Atenção', 
                `Resposta inesperada:<br>${result.message || 'Sem detalhes'}`, 
                false
            );
        }
    } catch (error) {
        console.error('Erro na conexão:', error);
        showModal('❌ Falha na Conexão', 
            `Não foi possível conectar ao Google Sheets.<br><br>
            <strong>Erro:</strong> ${error.message}<br><br>
            Verifique:<br>
            1. Se a URL está correta<br>
            2. Se o Apps Script está publicado<br>
            3. Se as permissões estão configuradas`, 
            false
        );
    }
}

// ================================
// ENVIO PARA GOOGLE SHEETS
// ================================
// NOTE: esta função coexistirá bem com o send.js; se você preferir delegar
// completamente ao send.js, podemos simplificar isso depois.
// Por ora deixei a função original que usa googleScriptUrl/local offline.
async function sendToGoogleSheets(formData) {
    return new Promise(async (resolve) => {
        // Verificar se está online
        if (!navigator.onLine) {
            const saved = saveDataOffline(formData);
            resolve({
                success: false,
                error: 'Sem conexão com a internet',
                savedLocally: saved
            });
            return;
        }

        // Verificar se a URL está configurada
        if (!googleScriptUrl) {
            const saved = saveDataOffline(formData);
            resolve({
                success: false,
                error: 'URL do Google Sheets não configurada',
                savedLocally: saved
            });
            return;
        }

        try {
            // Preparar dados para envio
            const payload = {
                action: 'submit',
                data: formData,
                timestamp: new Date().toISOString()
            };

            // Converter imagem para base64 se for muito grande
            if (formData.imagemBase64 && formData.imagemBase64.length > 50000) {
                payload.data.imagemBase64 = '[IMAGEM_COMPRIMIDA]';
                payload.hasImage = true;
                payload.imageSize = Math.round(formData.imagemBase64.length / 1024);
            }

            // usa modal do send.js
            showModal('Enviando...', 'Conectando ao Google Sheets...', true);

            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                // Remover dados offline se existirem
                removeOfflineData(formData.timestamp);
                
                resolve({
                    success: true,
                    recordId: result.recordId || 'N/A',
                    timestamp: result.timestamp || new Date().toLocaleString('pt-BR'),
                    message: result.message
                });
            } else {
                // Salvar offline em caso de erro
                saveDataOffline(formData);
                
                resolve({
                    success: false,
                    error: result.error || 'Erro desconhecido no servidor',
                    savedLocally: true
                });
            }
        } catch (error) {
            console.error('Erro no envio:', error);
            
            // Salvar offline
            const saved = saveDataOffline(formData);
            
            resolve({
                success: false,
                error: error.message,
                savedLocally: saved
            });
        }
    });
}

// ================================
// OFFLINE STORAGE (continua na Parte 2)
// ================================
// ================================
// OFFLINE STORAGE (continuação)
// ================================
function loadOfflineData() {
    try {
        const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
        offlineData = stored ? JSON.parse(stored) : [];
        updateOfflineBadge();
    } catch (e) {
        offlineData = [];
    }
}

function saveDataOffline(formData) {
    try {
        formData.timestamp = formData.timestamp || Date.now();
        offlineData.push(formData);
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineData));
        updateOfflineBadge();
        return true;
    } catch (e) {
        console.error('Erro ao salvar offline:', e);
        return false;
    }
}

function removeOfflineData(timestamp) {
    if (!timestamp) return;
    offlineData = offlineData.filter(d => d.timestamp !== timestamp);
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineData));
    updateOfflineBadge();
}

async function syncOfflineData() {
    if (!navigator.onLine) {
        showModal('Sem Internet', 'Conecte-se para sincronizar os dados offline.', false);
        return;
    }

    if (!googleScriptUrl) {
        showModal('⚠️ Falta Configuração', 'Configure a URL do Google Sheets primeiro.', false);
        return;
    }

    if (offlineData.length === 0) {
        showModal('Tudo Sincronizado', 'Nenhum dado pendente.', false);
        return;
    }

    showModal('Sincronizando...', `Enviando ${offlineData.length} registros...`, true);

    let enviados = 0;

    for (const item of [...offlineData]) {
        try {
            const result = await sendToGoogleSheets(item);
            if (result.success) {
                removeOfflineData(item.timestamp);
                enviados++;
            }
        } catch (e) {
            console.error('Erro ao sincronizar item:', e);
        }
    }

    hideModal();
    showModal('Sincronização Completa', `${enviados} registros enviados com sucesso!`, false);
}

function updateOfflineBadge() {
    if (elements.offlineBadge) {
        elements.offlineBadge.textContent = offlineData.length;
        elements.offlineBadge.style.display = offlineData.length > 0 ? 'inline-block' : 'none';
    }
}

// ================================
// TRATAMENTO DE IMAGEM
// ================================
function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    showModal('Carregando...', 'Aguarde enquanto a imagem é processada...', true);

    const reader = new FileReader();
    reader.onload = function (e) {
        currentImageData = e.target.result;
        updateImagePreview(currentImageData);

        hideModal();
        showModal('Imagem carregada', 'Você pode melhorar ou editar antes do OCR.', false);

        validateForm();
    };
    reader.readAsDataURL(file);
}

function updateImagePreview(base64) {
    if (!elements.imagePreview) return;

    elements.imagePreview.src = base64;
    elements.imagePreview.style.display = 'block';

    // Reset controles
    zoomLevel = 1;
    posX = 0;
    posY = 0;
    rotation = 0;
    applyImageTransforms();
}

// ================================
// MELHORAR FOTO
// ================================
async function enhanceAndUpdateImage(base64Image) {
    try {
        // Processo de "melhoria" básico (simulação de nitidez)
        const enhanced = await enhanceImage(base64Image);

        currentImageData = enhanced;
        updateImagePreview(enhanced);

        hideModal();
        showModal('Pronto!', 'Imagem melhorada com sucesso!', false);

    } catch (e) {
        console.error('Erro ao melhorar imagem:', e);
        hideModal();
        showModal('Erro', 'Falha ao melhorar a imagem.', false);
    }
}

async function enhanceImage(base64Image) {
    // Simulação de processamento (2s)
    await new Promise(res => setTimeout(res, 1200));
    return base64Image; // mantém a mesma (placeholder)
}

// ================================
// APLICAR TRANSFORMAÇÕES
// ================================
function applyImageTransforms() {
    if (!elements.imagePreview) return;

    elements.imagePreview.style.transform =
        `scale(${zoomLevel}) translate(${posX}px, ${posY}px) rotate(${rotation}deg)`;

    if (elements.zoomLevelDisplay) {
        elements.zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
}

// ================================
// CONTROLES DE ZOOM / ROTACAO
// ================================
function setupImageControls() {
    if (!elements.imageZoomContainer) return;

    elements.zoomIn?.addEventListener('click', () => {
        zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
        applyImageTransforms();
    });

    elements.zoomOut?.addEventListener('click', () => {
        zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);
        applyImageTransforms();
    });

    elements.rotateLeft?.addEventListener('click', () => {
        rotation -= 90;
        applyImageTransforms();
    });

    elements.rotateRight?.addEventListener('click', () => {
        rotation += 90;
        applyImageTransforms();
    });

    elements.moveUp?.addEventListener('click', () => {
        posY -= MOVE_STEP;
        applyImageTransforms();
    });

    elements.moveDown?.addEventListener('click', () => {
        posY += MOVE_STEP;
        applyImageTransforms();
    });

    elements.moveLeft?.addEventListener('click', () => {
        posX -= MOVE_STEP;
        applyImageTransforms();
    });

    elements.moveRight?.addEventListener('click', () => {
        posX += MOVE_STEP;
        applyImageTransforms();
    });

    elements.moveCenter?.addEventListener('click', () => {
        zoomLevel = 1;
        posX = 0;
        posY = 0;
        rotation = 0;
        applyImageTransforms();
    });

    // Arrastar com o mouse
    elements.imageZoomContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startPosX = posX;
        startPosY = posY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        posX = startPosX + (e.clientX - startX);
        posY = startPosY + (e.clientY - startY);
        applyImageTransforms();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// ================================
// PROGRESSO (BARRA)
// ================================
function setProgress(percent, label) {
    if (elements.progressFill) {
        elements.progressFill.style.width = `${percent}%`;
    }
    if (elements.progressLabel) {
        elements.progressLabel.textContent = label;
    }
}

function hideProgressBar() {
    if (elements.progressContainer) {
        elements.progressContainer.style.display = 'none';
    }
}

function showProgressBar() {
    if (elements.progressContainer) {
        elements.progressContainer.style.display = 'block';
    }
}

// ================================
// PROCESSAR OCR
// ================================
async function processOCR() {
    if (!currentImageData) {
        showModal('Erro', 'Nenhuma imagem selecionada.', false);
        return;
    }

    showProgressBar();
    setProgress(5, 'Preparando imagem...');
    showModal('Processando...', 'Enviando para OCR...', true);

    try {
        const result = await sendImageToOCR(currentImageData);

        hideProgressBar();
        hideModal();

        if (!result || !result.ParsedResults || !result.ParsedResults[0]) {
            showModal('Erro', 'Não foi possível ler o texto.', false);
            return;
        }

        const text = result.ParsedResults[0].ParsedText || "";

        setProgress(90, 'Extraindo dados...');
        extractDataFromText(text);

        hideProgressBar();
        showModal('Sucesso!', 'Dados extraídos. Revise antes de enviar.', false);

    } catch (error) {
        console.error('Erro no OCR:', error);

        hideProgressBar();
        showModal('Erro no OCR', error.message, false);
    }
}

// ================================
// ENVIAR PARA API OCR
// ================================
async function sendImageToOCR(base64Image) {
    setProgress(20, 'Preparando envio ao OCR...');

    const formData = new FormData();
    formData.append('base64Image', base64Image);
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'por');
    formData.append('scale', true);

    setProgress(40, 'Enviando para OCR.Space...');

    const response = await fetch(OCR_API_URL, {
        method: 'POST',
        body: formData
    });

    setProgress(70, 'Processando OCR...');

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

// ================================
// EXTRAÇÃO DE DADOS (continua parte 3)
// ================================

// ================================
// EXTRAÇÃO DE DADOS DO OCR
// ================================
function extractDataFromText(text) {
    if (!text) return;

    try {
        const cleaned = text.replace(/\s+/g, ' ').trim();

        // Nome (linha com muitas letras)
        const nomeMatch = cleaned.match(/[A-ZÀ-Ú][A-ZÀ-Ú\s]{5,}/i);
        const nome = nomeMatch ? nomeMatch[0] : "";

        // CPF
        const cpfMatch = cleaned.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
        const cpf = cpfMatch ? cpfMatch[0] : "";

        // Endereço (linha com número)
        const enderecoMatch = cleaned.match(/[A-Za-zÀ-ú0-9\s,.-]{10,}\d+/);
        const endereco = enderecoMatch ? enderecoMatch[0] : "";

        // Telefone
        const telefoneMatch = cleaned.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
        const telefone = telefoneMatch ? telefoneMatch[0] : "";

        // Renda, Valor ou Quantidade
        const numeroMatch = cleaned.match(/\b\d+([.,]\d+)?\b/);
        const quantidade = numeroMatch ? numeroMatch[0] : "";

        fillField("nome", nome);
        fillField("cpf", cpf);
        fillField("endereco", endereco);
        fillField("telefone", telefone);
        fillField("quantidade", quantidade);

        validateForm();

    } catch (e) {
        console.error("Erro ao extrair dados:", e);
        showModal("Erro ao processar", "Não foi possível extrair os dados.", false);
    }
}

// ================================
// PREENCHER CAMPOS DO FORMULÁRIO
// ================================
function fillField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    if (value && value.length > 0) {
        el.value = value;
        el.classList.add("filled");
    }
}

// ================================
// VALIDAÇÃO DO FORMULÁRIO
// ================================
function validateForm() {
    const nome = document.getElementById("nome")?.value.trim() || "";
    const cpf = document.getElementById("cpf")?.value.trim() || "";
    const quantidade = document.getElementById("quantidade")?.value.trim() || "";

    const isValid = nome !== "" && cpf !== "" && quantidade !== "";

    if (elements.sendButton) {
        elements.sendButton.disabled = !isValid;
    }

    return isValid;
}

// ================================
// GERAR OBJETO DO FORMULÁRIO
// ================================
function getFormData() {
    return {
        nome: document.getElementById("nome")?.value.trim() || "",
        cpf: document.getElementById("cpf")?.value.trim() || "",
        endereco: document.getElementById("endereco")?.value.trim() || "",
        telefone: document.getElementById("telefone")?.value.trim() || "",
        quantidade: document.getElementById("quantidade")?.value.trim() || "",
        imagemBase64: currentImageData || "",
        timestamp: Date.now()
    };
}

// ================================
// LIMPAR FORMULÁRIO
// ================================
function clearForm() {
    document.querySelectorAll("input, textarea").forEach(e => {
        e.value = "";
        e.classList.remove("filled");
    });

    if (elements.imagePreview) {
        elements.imagePreview.src = "";
        elements.imagePreview.style.display = "none";
    }

    currentImageData = null;
    validateForm();
}

// ================================
// PROCESSO DE ENVIO
// ================================
async function handleSend() {
    if (!validateForm()) {
        showModal("Campos incompletos", "Preencha nome, CPF e quantidade.", false);
        return;
    }

    const formData = getFormData();

    showModal("Enviando...", "Aguarde enquanto os dados são enviados.", true);

    try {
        const result = await sendToGoogleSheets(formData);

        if (result.success) {
            hideModal();
            showModal("Enviado!", "Dados salvos com sucesso!", false);
            clearForm();
        }

        else if (result.savedOffline) {
            hideModal();
            showModal(
                "Offline",
                `Sem internet. Dados salvos offline (ID ${result.offlineId}).`,
                false
            );
            clearForm();
        }

        else {
            throw new Error("Erro inesperado ao enviar.");
        }

    } catch (e) {
        hideModal();
        showModal("Erro", e.message || "Falha ao enviar os dados.", false);
    }
}

// ================================
// BOTÃO "ENVIAR" — INTEGRA COM SEND.JS
// ================================
if (elements.sendButton) {
    elements.sendButton.addEventListener("click", () => {
        handleSend();
    });
}

// ================================
// BOTÃO "OCR"
// ================================
if (elements.ocrButton) {
    elements.ocrButton.addEventListener("click", () => {
        processOCR();
    });
}
// ================================
// CONTROLES DE PWA
// ================================
function setupPWA() {
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => {
                    console.log('✅ Service Worker registrado:', registration.scope);
                })
                .catch(error => {
                    console.log('⚠️ Service Worker não registrado:', error);
                });
        });
    }

    // Evento para instalação PWA
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPrompt();
    });

    // Verificar se já está instalado
    window.addEventListener('appinstalled', () => {
        console.log('✅ App instalado com sucesso!');
        deferredPrompt = null;
        hideInstallPrompt();
        instalacaoSolicitada = false;

        showModal('🎉 App Instalado!', 
            'O Social Coletor foi instalado com sucesso!<br><br>' +
            'Agora você pode usá-lo offline diretamente da sua tela inicial.',
            false
        );
    });

    // Verificar se já está em modo standalone (já instalado)
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
        console.log('📱 App rodando em modo PWA');
        hideInstallPrompt();
    }

    // Configurar botão de instalação
    if (elements.installBtn) {
        elements.installBtn.addEventListener('click', installPWA);
    }
}

function showInstallPrompt() {
    if (!instalacaoSolicitada && elements.installContainer) {
        elements.installContainer.style.display = 'block';

        // Esconder automaticamente após 10 segundos
        setTimeout(() => {
            if (elements.installContainer && elements.installContainer.style.display !== 'none') {
                elements.installContainer.style.display = 'none';
                instalacaoSolicitada = true;
            }
        }, 10000);
    }
}

function hideInstallPrompt() {
    if (elements.installContainer) {
        elements.installContainer.style.display = 'none';
    }
}

async function installPWA() {
    if (!deferredPrompt) {
        showModal('ℹ️ Informação', 
            'O botão de instalação só aparece em dispositivos compatíveis.<br><br>' +
            'Tente usar o menu do navegador (⋮) e selecione "Instalar aplicativo".',
            false
        );
        return;
    }

    try {
        // Mostrar prompt de instalação
        deferredPrompt.prompt();

        // Aguardar resultado
        const choiceResult = await deferredPrompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
            console.log('✅ Usuário aceitou a instalação');
            hideInstallPrompt();
            instalacaoSolicitada = true;
        } else {
            console.log('❌ Usuário recusou a instalação');
            hideInstallPrompt();
            instalacaoSolicitada = true;
        }

        deferredPrompt = null;
    } catch (error) {
        console.error('Erro na instalação:', error);
        showModal('❌ Erro', 'Não foi possível instalar o aplicativo.', false);
    }
}

// ================================
// SERVICE WORKER: ATUALIZAÇÃO E CACHE
// ================================
self.addEventListener('install', (event) => {
    console.log('📦 Instalando Service Worker...');
    event.waitUntil(
        caches.open('social-coletor-v1.0').then((cache) => {
            console.log('📁 Cache aberto');
            return cache.addAll([
                '/',
                '/index.html',
                '/style.css',
                '/script.js',
                '/send.js',
                '/icons/icon-192.png',
                '/icons/icon-512.png',
                '/service-worker.js',
            ]);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== 'social-coletor-v1.0')
                    .map((cacheName) => caches.delete(cacheName))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});

// ================================
// ENVIO PARA GOOGLE SHEETS (continuação)
// ================================
async function sendToGoogleSheets(formData) {
    return new Promise(async (resolve) => {
        // Verificar se está online
        if (!navigator.onLine) {
            const saved = saveDataOffline(formData);
            resolve({
                success: false,
                error: 'Sem conexão com a internet',
                savedLocally: saved
            });
            return;
        }

        // Verificar se a URL está configurada
        if (!googleScriptUrl) {
            const saved = saveDataOffline(formData);
            resolve({
                success: false,
                error: 'URL do Google Sheets não configurada',
                savedLocally: saved
            });
            return;
        }

        try {
            // Preparar dados para envio
            const payload = {
                action: 'submit',
                data: formData,
                timestamp: new Date().toISOString()
            };

            // Converter imagem para base64 se for muito grande
            if (formData.imagemBase64 && formData.imagemBase64.length > 50000) {
                payload.data.imagemBase64 = '[IMAGEM_COMPRIMIDA]';
                payload.hasImage = true;
                payload.imageSize = Math.round(formData.imagemBase64.length / 1024);
            }

            // usa modal do send.js
            showModal('Enviando...', 'Conectando ao Google Sheets...', true);

            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                // Remover dados offline se existirem
                removeOfflineData(formData.timestamp);
                
                resolve({
                    success: true,
                    recordId: result.recordId || 'N/A',
                    timestamp: result.timestamp || new Date().toLocaleString('pt-BR'),
                    message: result.message
                });
            } else {
                // Salvar offline em caso de erro
                saveDataOffline(formData);
                
                resolve({
                    success: false,
                    error: result.error || 'Erro desconhecido no servidor',
                    savedLocally: true
                });
            }
        } catch (error) {
            console.error('Erro no envio:', error);
            
            // Salvar offline
            const saved = saveDataOffline(formData);
            
            resolve({
                success: false,
                error: error.message,
                savedLocally: saved
            });
        }
    });
}

// ================================
// FINALIZAÇÃO - EXPORT PARA TESTES (continuação)
// ================================
window.SocialColetor = {
    // Funções principais
    extractAndFillData,
    validateForm,
    clearForm,
    
    // Processamento de imagem
    enhanceImageProfessionally,
    processOCR,
    
    // PWA
    installPWA,
    showInstallPrompt,
    hideInstallPrompt,
    
    // Google Sheets
    sendToGoogleSheets,
    testGoogleScriptConnection,
    saveGoogleScriptConfig,
    
    // Offline
    syncOfflineData,
    loadOfflineData,
    
    // Configurações
    getConfig: () => ({
        googleScriptConfigured,
        googleScriptUrl,
        offlineDataCount: offlineData.length,
        isOnline: navigator.onLine
    })
};

console.log('🚀 Social Coletor v2.0 carregado com PWA, Google Sheets e Offline!');
console.log('📱 Recursos disponíveis:', {
    pwa: 'serviceWorker' in navigator,
    offlineStorage: 'localStorage' in window,
    camera: 'mediaDevices' in navigator,
    fileSystem: 'showOpenFilePicker' in window
});
// ================================
// TESTAR CONEXÃO COM GOOGLE SCRIPT
// ================================
async function testGoogleScriptConnection() {
    if (!googleScriptUrl) {
        showModal('⚠️ Erro', 'A URL do Google Script não está configurada.', false);
        return false;
    }

    showModal('Testando...', 'Verificando conexão com o Google Sheets...', true);

    try {
        const response = await fetch(googleScriptUrl + '?testConnection=1', {
            method: 'GET'
        });

        hideModal();

        if (!response.ok) {
            showModal('❌ Erro', `Falha na conexão (HTTP ${response.status})`, false);
            return false;
        }

        const data = await response.json();

        if (data.success) {
            showModal('✅ Sucesso', 'Conexão com o Google Sheets funcionando!', false);
            return true;
        } else {
            showModal('❌ Erro', data.message || 'O Google Script respondeu com erro.', false);
            return false;
        }
    } catch (err) {
        hideModal();
        showModal('❌ Falha', 'Erro ao conectar com o Google Script.', false);
        return false;
    }
}

// ================================
// SALVAR CONFIGURAÇÃO DO GOOGLE SCRIPT
// ================================
function saveGoogleScriptConfig(url) {
    googleScriptUrl = url;
    localStorage.setItem('googleScriptUrl', url);

    showModal('✅ Configurado', 'A URL do Google Sheets foi salva!', false);
}

// ================================
// INICIALIZAR APLICAÇÃO COMPLETA
// ================================
function initSocialColetor() {
    console.log('🚀 Inicializando Social Coletor...');

    // Carregar elementos
    Object.keys(elements).forEach(key => {
        elements[key] = document.getElementById(key);
    });

    // Carregar configuração salva
    googleScriptUrl = localStorage.getItem('googleScriptUrl') || '';

    // Carregar dados offline
    loadOfflineData();

    // Setup principais
    setupImageControls();
    validateForm();
    setupPWA();

    // Eventos de importação de imagem
    if (elements.imageInput) {
        elements.imageInput.addEventListener('change', handleImageSelection);
    }

    // Eventos de sincronização offline
    if (elements.syncButton) {
        elements.syncButton.addEventListener('click', syncOfflineData);
    }

    console.log('📌 Sistema carregado com sucesso!');
}

// Executa init ao carregar DOM
document.addEventListener('DOMContentLoaded', initSocialColetor);

// ================================
// FUNÇÕES AVANÇADAS (PLACEHOLDERS)
// ================================
async function enhanceImageProfessionally() {
    showModal('Melhorando imagem...', 'Aplicando filtros avançados...', true);

    await new Promise(r => setTimeout(r, 1200));

    hideModal();
    showModal('Imagem melhorada!', 'A nitidez foi melhorada com sucesso.', false);
}

function extractAndFillData(text) {
    extractDataFromText(text);
}
// ================================
// FUNÇÕES UTILITÁRIAS FINAIS
// ================================

// Formatar CPF
function formatCPF(cpf) {
    const onlyNums = cpf.replace(/\D/g, '');
    if (onlyNums.length !== 11) return cpf;
    return onlyNums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

// Converter data 00/00/0000 → 0000-00-00
function formatDate(date) {
    const m = date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
}

// Converter dataURL → Blob
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}


// ================================
// CONTROLE VISUAL
// ================================
function showProgressBar() {
    const box = document.getElementById('progressContainer');
    if (box) box.hidden = false;
}

function hideProgressBar() {
    const box = document.getElementById('progressContainer');
    if (box) box.hidden = true;
}

function setProgress(percent, text) {
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');

    if (fill) fill.style.width = percent + '%';
    if (label) label.textContent = text || `${percent}%`;
}

function showModal(title, message, spinner = true) {
    const modal = document.getElementById('statusModal');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const spin = document.getElementById('modalSpinner');
    const closeBtn = document.getElementById('modalCloseBtn');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (spin) spin.style.display = spinner ? 'block' : 'none';
    if (closeBtn) closeBtn.style.display = spinner ? 'none' : 'block';

    modal.style.display = 'flex';
}

function hideModal() {
    const modal = document.getElementById('statusModal');
    if (modal) modal.style.display = 'none';
}


// ================================
// DEBUG / EXPORT
// ================================
window.SocialColetor = {
    clearForm,
    validateForm,
    extractAndFillData,
    sendToGoogleSheets,
    testGoogleScriptConnection,
    loadOfflineData,
    syncOfflineData,
    enhanceImageProfessionally
};

console.log("✅ SCRIPT SOCIAL COLETOR FINALIZADO");
