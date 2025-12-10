/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL CORRIGIDO
 */

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================

// Elementos DOM
const elements = {
    captureBtn: document.getElementById('captureBtn'),
    uploadBtn: document.getElementById('uploadBtn'),
    fileInput: document.getElementById('fileInput'),
    imagePlaceholder: document.getElementById('imagePlaceholder'),
    imagePreview: document.getElementById('imagePreview'),
    progressContainer: document.getElementById('progressContainer'),
    progressLabel: document.getElementById('progressLabel'),
    progressFill: document.getElementById('progressFill'),
    dataForm: document.getElementById('dataForm'),
    clearBtn: document.getElementById('clearBtn'),
    submitBtn: document.getElementById('submitBtn'),
    modal: document.getElementById('statusModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalSpinner: document.getElementById('modalSpinner'),
    modalCloseBtn: document.getElementById('modalCloseBtn')
};

// Campos do formulário
const formFields = {
    beneficiario: document.getElementById('beneficiario'),
    cpf: document.getElementById('cpf'),
    atendente: document.getElementById('atendente'),
    produto: document.getElementById('produto'),
    quantidade: document.getElementById('quantidade'),
    endereco: document.getElementById('endereco'),
    data: document.getElementById('data'),
    assinatura: document.getElementById('assinatura'),
    numeroDocumento: document.getElementById('numeroDocumento')
};

// Estado
let currentImageData = null;
let tesseractWorker = null;
let isProcessing = false;

// ============================================
// REGEX PARA EXTRAÇÃO
// ============================================

const regexPatterns = {
    cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,
    numeroDocumento: /\b\d{6,7}\/\d{4}\b/,
    data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/,
    quantidade: /\b\d+(?:[.,]\d+)?\b/,
    assinatura: /([-_~]{3,}|[xX]{3,}|assinado|assinatura)/i
};

// ============================================
// INICIALIZAÇÃO
// ============================================

function initializeApp() {
    console.log('🚀 Inicializando Social Coletor...');
    
    // Verificar se elementos existem
    if (!elements.captureBtn || !elements.uploadBtn) {
        console.error('❌ Elementos não encontrados!');
        setTimeout(initializeApp, 100);
        return;
    }
    
    // Event Listeners
    elements.captureBtn.addEventListener('click', () => {
        elements.fileInput.setAttribute('capture', 'environment');
        elements.fileInput.click();
    });
    
    elements.uploadBtn.addEventListener('click', () => {
        elements.fileInput.removeAttribute('capture');
        elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener('change', handleImageSelection);
    elements.clearBtn.addEventListener('click', clearForm);
    elements.dataForm.addEventListener('submit', handleFormSubmit);
    elements.modalCloseBtn.addEventListener('click', hideModal);
    
    // Data atual
    const today = new Date().toISOString().split('T')[0];
    if (formFields.data) formFields.data.value = today;
    
    // Validar formulário
    Object.values(formFields).forEach(field => {
        if (field && field !== formFields.assinatura) {
            field.addEventListener('input', validateForm);
        }
    });
    
    console.log('✅ Aplicativo inicializado!');
}

// ============================================
// MANIPULAÇÃO DE IMAGENS
// ============================================

function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image.*')) {
        showModal('Erro', 'Selecione uma imagem válida (JPEG, PNG)');
        return;
    }
    
    showModal('Processando', 'Carregando imagem...');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const img = new Image();
        
        img.onload = function() {
            showImagePreview(e.target.result);
            processImageWithOCR(img);
        };
        
        img.src = e.target.result;
    };
    
    reader.onerror = function() {
        showModal('Erro', 'Falha ao ler a imagem');
    };
    
    reader.readAsDataURL(file);
    elements.fileInput.value = '';
}

function showImagePreview(dataURL) {
    if (elements.imagePlaceholder) elements.imagePlaceholder.hidden = true;
    if (elements.imagePreview) {
        elements.imagePreview.src = dataURL;
        elements.imagePreview.hidden = false;
    }
    currentImageData = dataURL;
}

// ============================================
// OCR PROCESSAMENTO
// ============================================

async function processImageWithOCR(image) {
    if (isProcessing) return;
    
    isProcessing = true;
    showProgressBar();
    showModal('Processando OCR', 'Extraindo texto da imagem...');
    
    try {
        console.log('🔍 Iniciando OCR...');
        
        // Criar worker do Tesseract
        tesseractWorker = await Tesseract.createWorker({
            logger: (m) => {
                console.log('Tesseract:', m);
                updateProgress(m);
            }
        });
        
        await tesseractWorker.loadLanguage('por');
        await tesseractWorker.initialize('por');
        
        // Configurar parâmetros para melhor reconhecimento
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/:() ',
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6' // Assume um único bloco de texto uniforme
        });
        
        // Processar imagem
        const { data: { text } } = await tesseractWorker.recognize(image);
        
        console.log('📝 Texto extraído:', text);
        
        // Extrair e preencher dados
        extractAndFillData(text);
        
        hideModal();
        showModal('Sucesso!', 'Dados extraídos! Revise e edite se necessário.', false);
        
    } catch (error) {
        console.error('❌ Erro no OCR:', error);
        showModal('Erro no OCR', 
            'Não foi possível extrair texto. Tente:<br>' +
            '1. Imagem com melhor iluminação<br>' +
            '2. Texto mais legível<br>' +
            '3. Ou insira os dados manualmente', 
            false
        );
    } finally {
        isProcessing = false;
        hideProgressBar();
        if (tesseractWorker) {
            await tesseractWorker.terminate();
            tesseractWorker = null;
        }
    }
}

function updateProgress(message) {
    if (!elements.progressLabel || !elements.progressFill) return;
    
    if (message.status === 'recognizing text') {
        const progress = Math.round(message.progress * 100);
        elements.progressLabel.textContent = `Processando OCR: ${progress}%`;
        elements.progressFill.style.width = `${progress}%`;
    }
}

// ============================================
// EXTRAÇÃO DE DADOS
// ============================================

function extractAndFillData(text) {
    console.log('🔍 Extraindo dados...');
    
    const extractedData = {
        beneficiario: '',
        cpf: '',
        atendente: '',
        produto: '',
        quantidade: '',
        endereco: '',
        data: '',
        assinatura: '',
        numeroDocumento: ''
    };
    
    // CPF
    const cpfMatch = text.match(regexPatterns.cpf);
    if (cpfMatch) {
        extractedData.cpf = formatCPF(cpfMatch[0]);
        console.log('✅ CPF encontrado:', extractedData.cpf);
    }
    
    // Número do documento
    const docMatch = text.match(regexPatterns.numeroDocumento);
    if (docMatch) {
        extractedData.numeroDocumento = docMatch[0];
        console.log('✅ Nº Doc encontrado:', extractedData.numeroDocumento);
    }
    
    // Data
    const dateMatch = text.match(regexPatterns.data);
    if (dateMatch) {
        extractedData.data = formatDate(dateMatch[0]);
        console.log('✅ Data encontrada:', extractedData.data);
    }
    
    // Quantidade
    const qtdMatch = text.match(/\d+(?:[.,]\d+)?(?=\s*(?:un|kg|g|ml|l|m|cm|mm))/i);
    if (qtdMatch) {
        extractedData.quantidade = qtdMatch[0].replace(',', '.');
        console.log('✅ Quantidade encontrada:', extractedData.quantidade);
    }
    
    // Assinatura
    if (regexPatterns.assinatura.test(text)) {
        extractedData.assinatura = 'OK';
        console.log('✅ Assinatura detectada');
    }
    
    // Buscar por padrões comuns em recibos
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        const nextLine = lines[i + 1] || '';
        
        // Beneficiário
        if (line.includes('beneficiário') || line.includes('beneficiario') || line.includes('nome:')) {
            if (nextLine.trim()) {
                extractedData.beneficiario = nextLine.trim();
                console.log('✅ Beneficiário encontrado:', extractedData.beneficiario);
            }
        }
        
        // Atendente
        if (line.includes('atendente') || line.includes('responsável') || line.includes('funcionário')) {
            if (nextLine.trim()) {
                extractedData.atendente = nextLine.trim();
                console.log('✅ Atendente encontrado:', extractedData.atendente);
            }
        }
        
        // Produto
        if (line.includes('produto') || line.includes('item') || line.includes('descrição')) {
            if (nextLine.trim()) {
                extractedData.produto = nextLine.trim();
                console.log('✅ Produto encontrado:', extractedData.produto);
            }
        }
        
        // Endereço (multi-linha)
        if (isAddressLine(line)) {
            let address = line;
            // Pegar próximas linhas que parecem ser endereço
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                if (isAddressLine(lines[j])) {
                    address += ', ' + lines[j];
                }
            }
            extractedData.endereco = address;
            console.log('✅ Endereço encontrado:', extractedData.endereco);
        }
    }
    
    // Preencher formulário
    fillFormWithData(extractedData);
}

function isAddressLine(line) {
    const addressIndicators = ['rua', 'av.', 'avenida', 'travessa', 'alameda', 'número', 'nº', 'bairro', 'cep'];
    const lowerLine = line.toLowerCase();
    return addressIndicators.some(indicator => lowerLine.includes(indicator));
}

function fillFormWithData(data) {
    Object.keys(data).forEach(key => {
        if (data[key] && formFields[key]) {
            formFields[key].value = data[key];
        }
    });
    validateForm();
}

function formatCPF(cpf) {
    const numbers = cpf.replace(/\D/g, '');
    if (numbers.length !== 11) return cpf;
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDate(dateString) {
    const separator = dateString.includes('/') ? '/' : '-';
    const parts = dateString.split(separator);
    if (parts.length !== 3) return '';
    
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    
    // Se ano tem 2 dígitos, assumir século 20
    if (year.length === 2) {
        return `20${year}-${month}-${day}`;
    }
    
    return `${year}-${month}-${day}`;
}

// ============================================
// VALIDAÇÃO
// ============================================

function validateForm() {
    if (!elements.submitBtn) return false;
    
    let isValid = true;
    
    Object.entries(formFields).forEach(([key, field]) => {
        if (!field) return;
        
        if (key === 'assinatura') return;
        
        if (!field.value.trim()) {
            isValid = false;
        }
        
        // Validações específicas
        if (key === 'cpf' && field.value.trim()) {
            if (!validateCPF(field.value)) {
                field.style.borderColor = '#f44336';
                isValid = false;
            } else {
                field.style.borderColor = '#4caf50';
            }
        }
        
        if (key === 'quantidade' && field.value.trim()) {
            const qtd = parseFloat(field.value);
            if (isNaN(qtd) || qtd <= 0) {
                field.style.borderColor = '#f44336';
                isValid = false;
            } else {
                field.style.borderColor = '#4caf50';
            }
        }
    });
    
    elements.submitBtn.disabled = !isValid;
    return isValid;
}

function validateCPF(cpf) {
    const numbers = cpf.replace(/\D/g, '');
    if (numbers.length !== 11) return false;
    if (/^(\d)\1+$/.test(numbers)) return false;
    
    // Validação simples para teste
    // Em produção, implemente o algoritmo completo
    return numbers.length === 11;
}

// ============================================
// UI HELPERS
// ============================================

function showProgressBar() {
    if (elements.progressContainer) {
        elements.progressContainer.hidden = false;
    }
}

function hideProgressBar() {
    if (elements.progressContainer) {
        elements.progressContainer.hidden = true;
    }
}

function showModal(title, message, showSpinner = true) {
    if (elements.modalTitle) elements.modalTitle.textContent = title;
    if (elements.modalMessage) elements.modalMessage.innerHTML = message;
    if (elements.modalSpinner) elements.modalSpinner.hidden = !showSpinner;
    if (elements.modalCloseBtn) elements.modalCloseBtn.hidden = showSpinner;
    if (elements.modal) elements.modal.hidden = false;
}

function hideModal() {
    if (elements.modal) elements.modal.hidden = true;
}

function clearForm() {
    if (!confirm('Limpar todos os campos?')) return;
    
    Object.values(formFields).forEach(field => {
        if (field) field.value = '';
    });
    
    // Resetar data
    if (formFields.data) {
        const today = new Date().toISOString().split('T')[0];
        formFields.data.value = today;
    }
    
    // Resetar imagem
    if (elements.imagePlaceholder) elements.imagePlaceholder.hidden = false;
    if (elements.imagePreview) {
        elements.imagePreview.hidden = true;
        elements.imagePreview.src = '';
    }
    
    currentImageData = null;
    if (elements.submitBtn) elements.submitBtn.disabled = true;
}

async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        showModal('Erro', 'Preencha todos os campos obrigatórios', false);
        return;
    }
    
    showModal('Enviando...', 'Preparando dados para envio...');
    
    // Coletar dados
    const formData = {
        beneficiario: formFields.beneficiario.value.trim(),
        cpf: formFields.cpf.value.trim(),
        atendente: formFields.atendente.value.trim(),
        produto: formFields.produto.value.trim(),
        quantidade: parseFloat(formFields.quantidade.value),
        endereco: formFields.endereco.value.trim(),
        data: formFields.data.value,
        assinatura: formFields.assinatura.value.trim() || 'N/A',
        numeroDocumento: formFields.numeroDocumento.value.trim(),
        imagemBase64: currentImageData || '',
        timestamp: new Date().toISOString()
    };
    
    console.log('📤 Dados para envio:', formData);
    
    // Simular envio (substituir por chamada real ao Apps Script)
    setTimeout(() => {
        showModal('✅ Sucesso!', 
            'Dados preparados para envio!<br><br>' +
            'Configure o Google Apps Script para envio real.', 
            false
        );
    }, 1500);
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Aguardar DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeApp, 100);
});

// Limpar worker na saída
window.addEventListener('beforeunload', () => {
    if (tesseractWorker) {
        tesseractWorker.terminate();
    }
});
