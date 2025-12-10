/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL
 * Responsável pela captura de imagem, OCR e preenchimento do formulário
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
// REGEX PARA EXTRAÇÃO DE DADOS
// ============================================

const regexPatterns = {
    // CPF: 000.000.000-00 ou 00000000000
    cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,
    
    // Número do documento: 000000/0000
    numeroDocumento: /\b\d{6,7}\/\d{4}\b/,
    
    // Data: dd/mm/aaaa ou dd-mm-aaaa
    data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/,
    
    // Quantidade: números decimais ou inteiros
    quantidade: /\b\d+(?:[.,]\d+)?\b/,
    
    // Assinatura: detecta traços ou riscos
    assinatura: /([-_~]{3,}|[xX]{3,}|assinado|assinatura)/i
};

// ============================================
// INICIALIZAÇÃO
// ============================================

/**
 * Inicializa o aplicativo
 */
function initializeApp() {
    console.log('🚀 Inicializando Social Coletor...');
    
    // Verificar elementos críticos
    if (!elements.captureBtn || !elements.uploadBtn || !elements.fileInput) {
        console.error('❌ Elementos críticos não encontrados!');
        return;
    }
    
    // Configurar data atual
    if (formFields.data) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        formFields.data.value = `${year}-${month}-${day}`;
    }
    
    // Configurar event listeners
    setupEventListeners();
    
    console.log('✅ Aplicativo inicializado!');
}

/**
 * Configura todos os event listeners
 */
function setupEventListeners() {
    // Captura de imagem
    elements.captureBtn.addEventListener('click', function() {
        elements.fileInput.setAttribute('capture', 'environment');
        elements.fileInput.click();
    });
    
    elements.uploadBtn.addEventListener('click', function() {
        elements.fileInput.removeAttribute('capture');
        elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener('change', handleImageSelection);
    
    // Formulário
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', clearForm);
    }
    
    if (elements.dataForm) {
        elements.dataForm.addEventListener('submit', handleFormSubmit);
    }
    
    if (elements.modalCloseBtn) {
        elements.modalCloseBtn.addEventListener('click', hideModal);
    }
    
    // Validação do formulário
    Object.values(formFields).forEach(field => {
        if (field && field !== formFields.assinatura) {
            field.addEventListener('input', validateForm);
        }
    });
}

// ============================================
// MANIPULAÇÃO DE IMAGENS
// ============================================

/**
 * Processa a imagem selecionada
 */
function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Verificar se é imagem
    if (!file.type.match('image.*')) {
        showModal('Erro', 'Por favor, selecione um arquivo de imagem (JPEG ou PNG).');
        return;
    }
    
    showModal('Processando', 'Carregando imagem...');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const img = new Image();
        
        img.onload = function() {
            // Mostrar preview
            showImagePreview(e.target.result);
            
            // Processar OCR
            processImageWithOCR(this);
        };
        
        img.onerror = function() {
            showModal('Erro', 'Erro ao carregar a imagem.');
        };
        
        img.src = e.target.result;
    };
    
    reader.onerror = function() {
        showModal('Erro', 'Falha ao ler o arquivo.');
    };
    
    reader.readAsDataURL(file);
    elements.fileInput.value = '';
}

/**
 * Exibe preview da imagem
 */
function showImagePreview(dataURL) {
    if (elements.imagePlaceholder) {
        elements.imagePlaceholder.style.display = 'none';
    }
    
    if (elements.imagePreview) {
        elements.imagePreview.src = dataURL;
        elements.imagePreview.style.display = 'block';
    }
    
    currentImageData = dataURL;
}

// ============================================
// PROCESSAMENTO OCR
// ============================================

/**
 * Processa imagem com OCR
 */
async function processImageWithOCR(imageElement) {
    if (isProcessing) {
        console.log('⚠️ Já processando...');
        return;
    }
    
    isProcessing = true;
    showProgressBar();
    
    try {
        console.log('🔍 Iniciando OCR...');
        
        // Criar worker do Tesseract
        tesseractWorker = await Tesseract.createWorker({
            logger: updateProgress
        });
        
        // Carregar idioma português
        await tesseractWorker.loadLanguage('por');
        await tesseractWorker.initialize('por');
        
        // Configurar para documentos
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-/() ,:;',
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6'
        });
        
        // Processar OCR
        const { data: { text } } = await tesseractWorker.recognize(imageElement);
        
        console.log('📝 Texto extraído:', text);
        
        // Extrair dados
        extractAndFillData(text);
        
        hideModal();
        showModal('✅ Sucesso!', 'Dados extraídos automaticamente! Revise os campos.', false);
        
    } catch (error) {
        console.error('❌ Erro no OCR:', error);
        showModal('⚠️ Atenção', 
            'OCR encontrou dificuldades. Verifique:<br>' +
            '• Iluminação da imagem<br>' +
            '• Qualidade do texto<br>' +
            '• Ou preencha manualmente', 
            false
        );
    } finally {
        isProcessing = false;
        hideProgressBar();
        
        // Limpar worker
        if (tesseractWorker) {
            await tesseractWorker.terminate();
            tesseractWorker = null;
        }
    }
}

/**
 * Atualiza barra de progresso
 */
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

/**
 * Extrai dados do texto OCR
 */
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
    
    // Buscar CPF
    const cpfMatch = text.match(regexPatterns.cpf);
    if (cpfMatch) {
        extractedData.cpf = formatCPF(cpfMatch[0]);
        console.log('✅ CPF:', extractedData.cpf);
    }
    
    // Buscar número do documento
    const docMatch = text.match(regexPatterns.numeroDocumento);
    if (docMatch) {
        extractedData.numeroDocumento = docMatch[0];
        console.log('✅ Nº Documento:', extractedData.numeroDocumento);
    }
    
    // Buscar data
    const dateMatch = text.match(regexPatterns.data);
    if (dateMatch) {
        extractedData.data = formatDate(dateMatch[0]);
        console.log('✅ Data:', extractedData.data);
    }
    
    // Buscar quantidade
    const qtdMatch = text.match(/\d+(?:[.,]\d+)?(?=\s*(?:un|kg|g|ml|l|m|cm|mm))/i);
    if (qtdMatch) {
        extractedData.quantidade = qtdMatch[0].replace(',', '.');
        console.log('✅ Quantidade:', extractedData.quantidade);
    }
    
    // Buscar assinatura
    if (regexPatterns.assinatura.test(text)) {
        extractedData.assinatura = 'OK';
        console.log('✅ Assinatura detectada');
    }
    
    // Buscar outros campos por análise de texto
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        const nextLine = lines[i + 1] || '';
        
        // Beneficiário
        if (line.includes('beneficiário') || line.includes('beneficiario') || line.includes('nome:')) {
            if (line.includes(':')) {
                extractedData.beneficiario = line.split(':')[1].trim();
            } else if (nextLine.trim()) {
                extractedData.beneficiario = nextLine.trim();
            }
        }
        
        // Atendente
        if (line.includes('atendente') || line.includes('responsável') || line.includes('funcionário')) {
            if (line.includes(':')) {
                extractedData.atendente = line.split(':')[1].trim();
            } else if (nextLine.trim()) {
                extractedData.atendente = nextLine.trim();
            }
        }
        
        // Produto
        if (line.includes('produto') || line.includes('item') || line.includes('descrição')) {
            if (line.includes(':')) {
                extractedData.produto = line.split(':')[1].trim();
            } else if (nextLine.trim()) {
                extractedData.produto = nextLine.trim();
            }
        }
        
        // Endereço
        if (isAddressLine(line)) {
            let address = line.trim();
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                if (lines[j].trim() && !lines[j].toLowerCase().includes('data')) {
                    address += ', ' + lines[j].trim();
                }
            }
            extractedData.endereco = address;
        }
    }
    
    // Preencher formulário
    fillFormWithData(extractedData);
}

/**
 * Verifica se linha é endereço
 */
function isAddressLine(line) {
    const indicators = ['rua', 'av.', 'avenida', 'travessa', 'alameda', 'número', 'nº', 'bairro', 'cep', 'endereço'];
    const lowerLine = line.toLowerCase();
    return indicators.some(indicator => lowerLine.includes(indicator));
}

/**
 * Preenche formulário com dados
 */
function fillFormWithData(data) {
    Object.keys(data).forEach(key => {
        if (data[key] && formFields[key]) {
            formFields[key].value = data[key];
            
            // Destacar campo preenchido
            setTimeout(() => {
                formFields[key].style.borderColor = '#4caf50';
                formFields[key].style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.2)';
            }, 100);
        }
    });
    
    validateForm();
}

/**
 * Formata CPF
 */
function formatCPF(cpf) {
    const numbers = cpf.replace(/\D/g, '');
    if (numbers.length !== 11) return cpf;
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata data
 */
function formatDate(dateString) {
    const separator = dateString.includes('/') ? '/' : '-';
    const parts = dateString.split(separator);
    if (parts.length !== 3) return '';
    
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    
    return `${year}-${month}-${day}`;
}

// ============================================
// VALIDAÇÃO
// ============================================

/**
 * Valida formulário
 */
function validateForm() {
    if (!elements.submitBtn) return false;
    
    let isValid = true;
    
    Object.entries(formFields).forEach(([key, field]) => {
        if (!field) return;
        
        if (key === 'assinatura') return;
        
        if (!field.value.trim()) {
            isValid = false;
            field.style.borderColor = '#f44336';
            return;
        }
        
        // Validações específicas
        if (key === 'cpf') {
            const cpfValid = validateCPF(field.value);
            field.style.borderColor = cpfValid ? '#4caf50' : '#f44336';
            if (!cpfValid) isValid = false;
        }
        
        if (key === 'quantidade') {
            const qtd = parseFloat(field.value.replace(',', '.'));
            const qtdValid = !isNaN(qtd) && qtd > 0;
            field.style.borderColor = qtdValid ? '#4caf50' : '#f44336';
            if (!qtdValid) isValid = false;
        }
        
        if (key === 'data') {
            const dateValid = field.value.length === 10;
            field.style.borderColor = dateValid ? '#4caf50' : '#f44336';
            if (!dateValid) isValid = false;
        }
    });
    
    elements.submitBtn.disabled = !isValid;
    return isValid;
}

/**
 * Valida CPF
 */
function validateCPF(cpf) {
    const numbers = cpf.replace(/\D/g, '');
    if (numbers.length !== 11) return false;
    if (/^(\d)\1+$/.test(numbers)) return false;
    
    // Para testes, aceita qualquer CPF com 11 dígitos
    return numbers.length === 11;
}

/**
 * Limpa formulário
 */
function clearForm() {
    if (!confirm('Limpar todos os campos?')) return;
    
    Object.values(formFields).forEach(field => {
        if (field) {
            field.value = '';
            field.style.borderColor = '';
            field.style.boxShadow = '';
        }
    });
    
    // Resetar data
    if (formFields.data) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        formFields.data.value = `${year}-${month}-${day}`;
    }
    
    // Resetar imagem
    if (elements.imagePlaceholder) {
        elements.imagePlaceholder.style.display = 'flex';
    }
    
    if (elements.imagePreview) {
        elements.imagePreview.style.display = 'none';
        elements.imagePreview.src = '';
    }
    
    currentImageData = null;
    
    if (elements.submitBtn) {
        elements.submitBtn.disabled = true;
    }
}

/**
 * Manipula envio do formulário
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        showModal('Erro', 'Preencha todos os campos corretamente.', false);
        return;
    }
    
    showModal('Enviando...', 'Preparando dados para envio...');
    
    // Coletar dados
    const formData = {
        beneficiario: formFields.beneficiario.value.trim(),
        cpf: formFields.cpf.value.trim(),
        atendente: formFields.atendente.value.trim(),
        produto: formFields.produto.value.trim(),
        quantidade: parseFloat(formFields.quantidade.value.replace(',', '.')),
        endereco: formFields.endereco.value.trim(),
        data: formFields.data.value,
        assinatura: formFields.assinatura.value.trim() || 'N/A',
        numeroDocumento: formFields.numeroDocumento.value.trim(),
        imagemBase64: currentImageData || '',
        timestamp: new Date().toISOString()
    };
    
    console.log('📤 Dados preparados:', formData);
    
    // Simular envio (substituir por Apps Script depois)
    setTimeout(() => {
        showModal('✅ Pronto!', 
            'Dados processados com sucesso!<br><br>' +
            '<strong>Para envio real:</strong><br>' +
            '1. Configure Google Apps Script<br>' +
            '2. Atualize a URL em send.js', 
            false
        );
    }, 2000);
}

// ============================================
// UI HELPERS
// ============================================

/**
 * Mostra barra de progresso
 */
function showProgressBar() {
    if (elements.progressContainer) {
        elements.progressContainer.hidden = false;
    }
}

/**
 * Esconde barra de progresso
 */
function hideProgressBar() {
    if (elements.progressContainer) {
        elements.progressContainer.hidden = true;
    }
}

/**
 * Mostra modal
 */
function showModal(title, message, showSpinner = true) {
    if (elements.modalTitle) elements.modalTitle.textContent = title;
    if (elements.modalMessage) elements.modalMessage.innerHTML = message;
    if (elements.modalSpinner) elements.modalSpinner.style.display = showSpinner ? 'block' : 'none';
    if (elements.modalCloseBtn) elements.modalCloseBtn.style.display = showSpinner ? 'none' : 'block';
    if (elements.modal) elements.modal.style.display = 'flex';
}

/**
 * Esconde modal
 */
function hideModal() {
    if (elements.modal) {
        elements.modal.style.display = 'none';
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Inicializar quando DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar Tesseract carregar
    if (typeof Tesseract === 'undefined') {
        console.error('❌ Tesseract não carregado!');
        showModal('Erro', 'Biblioteca OCR não carregada. Recarregue a página.', false);
        return;
    }
    
    console.log('🌐 Tesseract.js carregado!');
    initializeApp();
});

// Limpar recursos
window.addEventListener('beforeunload', async function() {
    if (tesseractWorker) {
        await tesseractWorker.terminate();
    }
});

// Exportar para debug
if (typeof window !== 'undefined') {
    window.SocialColetor = {
        extractAndFillData,
        processImageWithOCR,
        validateForm,
        clearForm
    };
}

console.log('📦 Script Social Coletor carregado!');
