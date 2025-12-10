
/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL
 * Responsável pela captura de imagem, OCR e preenchimento do formulário
 */

// ============================================
// VARIÁVEIS GLOBAIS E CONSTANTES
// ============================================

// Elementos DOM
const elements = {
    captureBtn: document.getElementById('captureBtn'),
    uploadBtn: document.getElementById('uploadBtn'),
    fileInput: document.getElementById('fileInput'),
    imagePlaceholder: document.getElementById('imagePlaceholder'),
    imageCanvas: document.getElementById('imageCanvas'),
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

// Referências aos campos do formulário
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

// Variáveis de estado
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
// INICIALIZAÇÃO DO APLICATIVO
// ============================================

/**
 * Inicializa todos os event listeners e configurações
 */
function initializeApp() {
    console.log('🚀 Inicializando Social Coletor...');
    
    // Event Listeners para captura de imagem
    elements.captureBtn.addEventListener('click', () => {
        elements.fileInput.setAttribute('capture', 'environment');
        elements.fileInput.click();
    });
    
    elements.uploadBtn.addEventListener('click', () => {
        elements.fileInput.removeAttribute('capture');
        elements.fileInput.click();
    });
    
    elements.fileInput.addEventListener('change', handleImageSelection);
    
    // Event Listeners para o formulário
    elements.clearBtn.addEventListener('click', clearForm);
    elements.dataForm.addEventListener('submit', handleFormSubmit);
    
    // Event Listener para o modal
    elements.modalCloseBtn.addEventListener('click', () => {
        hideModal();
    });
    
    // Atualizar data atual
    const today = new Date().toISOString().split('T')[0];
    formFields.data.value = today;
    
    // Habilitar/desabilitar botão de envio baseado na validação do formulário
    Object.values(formFields).forEach(field => {
        if (field !== formFields.assinatura) { // Assinatura não é obrigatória
            field.addEventListener('input', validateForm);
        }
    });
    
    console.log('✅ Aplicativo inicializado com sucesso!');
}

// ============================================
// MANIPULAÇÃO DE IMAGENS
// ============================================

/**
 * Processa a imagem selecionada pelo usuário
 * @param {Event} event - Evento de change do input file
 */
function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image.*')) {
        showModal('Erro', 'Por favor, selecione um arquivo de imagem válido.');
        return;
    }
    
    showModal('Processando', 'Carregando imagem...');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const img = new Image();
        
        img.onload = function() {
            // Configurar canvas com as dimensões da imagem
            const ctx = elements.imageCanvas.getContext('2d');
            elements.imageCanvas.width = img.width;
            elements.imageCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // Mostrar preview
            showImagePreview(e.target.result);
            
            // Processar OCR
            processImageWithOCR(img);
        };
        
        img.src = e.target.result;
    };
    
    reader.onerror = function() {
        showModal('Erro', 'Falha ao ler o arquivo de imagem.');
    };
    
    reader.readAsDataURL(file);
    elements.fileInput.value = ''; // Resetar input
}

/**
 * Exibe a imagem no preview
 * @param {string} dataURL - Imagem em base64
 */
function showImagePreview(dataURL) {
    elements.imagePlaceholder.hidden = true;
    elements.imagePreview.src = dataURL;
    elements.imagePreview.hidden = false;
    currentImageData = dataURL;
}

/**
 * Processa a imagem usando Tesseract.js OCR
 * @param {HTMLImageElement} image - Elemento de imagem
 */
async function processImageWithOCR(image) {
    if (isProcessing) {
        console.log('⚠️ OCR já está em processamento');
        return;
    }
    
    isProcessing = true;
    showProgressBar();
    
    try {
        showModal('Processando OCR', 'Extraindo texto da imagem...');
        
        // Inicializar worker do Tesseract
        if (!tesseractWorker) {
            tesseractWorker = await Tesseract.createWorker('por', 1, {
                logger: (m) => updateProgress(m)
            });
        } else {
            await tesseractWorker.reinitialize('por');
        }
        
        // Processar imagem
        const { data: { text } } = await tesseractWorker.recognize(image);
        
        console.log('📝 Texto extraído:', text);
        
        // Extrair e preencher dados automaticamente
        extractAndFillData(text);
        
        hideModal();
        showModal('Sucesso!', 'Dados extraídos automaticamente! Revise e edite se necessário.', false);
        
    } catch (error) {
        console.error('❌ Erro no OCR:', error);
        showModal('Erro no OCR', 'Não foi possível extrair texto da imagem. Por favor, insira os dados manualmente.', false);
    } finally {
        isProcessing = false;
        hideProgressBar();
    }
}

/**
 * Atualiza a barra de progresso do OCR
 * @param {Object} message - Mensagem de progresso do Tesseract
 */
function updateProgress(message) {
    if (message.status === 'recognizing text') {
        const progress = Math.round(message.progress * 100);
        elements.progressLabel.textContent = `Processando OCR: ${progress}%`;
        elements.progressFill.style.width = `${progress}%`;
    }
}

// ============================================
// EXTRAÇÃO E PREENCHIMENTO DE DADOS
// ============================================

/**
 * Extrai dados do texto usando regex e preenche o formulário
 * @param {string} text - Texto extraído pelo OCR
 */
function extractAndFillData(text) {
    console.log('🔍 Extraindo dados do texto...');
    
    // Normalizar texto: remover quebras de linha múltiplas
    const normalizedText = text.replace(/\n+/g, '\n').trim();
    const lines = normalizedText.split('\n');
    
    // Dados extraídos
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
    
    // Buscar CPF usando regex
    const cpfMatch = text.match(regexPatterns.cpf);
    if (cpfMatch) {
        extractedData.cpf = formatCPF(cpfMatch[0]);
    }
    
    // Buscar número do documento usando regex
    const docMatch = text.match(regexPatterns.numeroDocumento);
    if (docMatch) {
        extractedData.numeroDocumento = docMatch[0];
    }
    
    // Buscar data usando regex e converter para formato YYYY-MM-DD
    const dateMatch = text.match(regexPatterns.data);
    if (dateMatch) {
        extractedData.data = formatDate(dateMatch[0]);
    }
    
    // Buscar quantidade usando regex
    const qtdMatch = text.match(regexPatterns.quantidade);
    if (qtdMatch) {
        extractedData.quantidade = qtdMatch[0].replace(',', '.');
    }
    
    // Buscar assinatura
    if (regexPatterns.assinatura.test(text)) {
        extractedData.assinatura = 'OK';
    }
    
    // Análise por linha para encontrar outros campos
    let beneficiaryFound = false;
    let attendantFound = false;
    let productFound = false;
    let addressLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        
        // Beneficiário
        if (!beneficiaryFound && (line.includes('beneficiário') || line.includes('beneficiario'))) {
            if (i + 1 < lines.length) {
                extractedData.beneficiario = lines[i + 1].trim();
                beneficiaryFound = true;
            }
        }
        
        // Atendente
        if (!attendantFound && (line.includes('atendente') || line.includes('responsável'))) {
            if (i + 1 < lines.length) {
                extractedData.atendente = lines[i + 1].trim();
                attendantFound = true;
            }
        }
        
        // Produto
        if (!productFound && line.includes('produto')) {
            if (i + 1 < lines.length) {
                extractedData.produto = lines[i + 1].trim();
                productFound = true;
            }
        }
        
        // Endereço (coletar múltiplas linhas que parecem ser endereço)
        if (isAddressLine(line)) {
            addressLines.push(lines[i].trim());
        }
    }
    
    // Combinar linhas de endereço
    if (addressLines.length > 0) {
        extractedData.endereco = addressLines.join(', ');
    }
    
    // Preencher formulário com dados extraídos
    fillFormWithData(extractedData);
    
    console.log('✅ Dados extraídos:', extractedData);
}

/**
 * Verifica se uma linha parece ser parte de um endereço
 * @param {string} line - Linha de texto
 * @returns {boolean}
 */
function isAddressLine(line) {
    const addressIndicators = [
        'rua', 'av', 'avenida', 'travessa', 'alameda',
        'número', 'nº', 'n°', 'bairro', 'cep',
        'cidade', 'estado', 'compl', 'complemento'
    ];
    
    const lowerLine = line.toLowerCase();
    return addressIndicators.some(indicator => lowerLine.includes(indicator));
}

/**
 * Preenche o formulário com os dados extraídos
 * @param {Object} data - Dados extraídos
 */
function fillFormWithData(data) {
    Object.keys(data).forEach(key => {
        if (data[key] && formFields[key]) {
            formFields[key].value = data[key];
        }
    });
    
    // Validar formulário após preenchimento
    validateForm();
}

/**
 * Formata CPF para o padrão 000.000.000-00
 * @param {string} cpf - CPF sem formatação ou formatado
 * @returns {string} CPF formatado
 */
function formatCPF(cpf) {
    // Remover caracteres não numéricos
    const numbers = cpf.replace(/\D/g, '');
    
    if (numbers.length !== 11) return cpf;
    
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata data para YYYY-MM-DD
 * @param {string} dateString - Data em formato variado
 * @returns {string} Data formatada
 */
function formatDate(dateString) {
    // Separador pode ser / ou -
    const separator = dateString.includes('/') ? '/' : '-';
    const parts = dateString.split(separator);
    
    if (parts.length !== 3) return '';
    
    // Formato dd/mm/aaaa ou dd-mm-aaaa
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    
    return `${year}-${month}-${day}`;
}

// ============================================
// VALIDAÇÃO E ENVIO DO FORMULÁRIO
// ============================================

/**
 * Valida o formulário e habilita/desabilita o botão de envio
 */
function validateForm() {
    const isValid = Object.entries(formFields).every(([key, field]) => {
        // Assinatura não é obrigatória
        if (key === 'assinatura') return true;
        
        // Verificar se o campo está preenchido
        if (!field.value.trim()) return false;
        
        // Validações específicas por campo
        switch (key) {
            case 'cpf':
                return validateCPF(field.value);
            case 'data':
                return field.value.length === 10;
            case 'quantidade':
                return !isNaN(parseFloat(field.value)) && parseFloat(field.value) > 0;
            default:
                return true;
        }
    });
    
    elements.submitBtn.disabled = !isValid;
    return isValid;
}

/**
 * Valida CPF (formato e dígitos verificadores)
 * @param {string} cpf - CPF a ser validado
 * @returns {boolean}
 */
function validateCPF(cpf) {
    // Remover caracteres não numéricos
    const numbers = cpf.replace(/\D/g, '');
    
    // Verificar se tem 11 dígitos
    if (numbers.length !== 11) return false;
    
    // Verificar se não é uma sequência repetida
    if (/^(\d)\1+$/.test(numbers)) return false;
    
    // Algoritmo de validação de CPF
    let sum = 0;
    let remainder;
    
    for (let i = 1; i <= 9; i++) {
        sum += parseInt(numbers.substring(i - 1, i)) * (11 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(numbers.substring(9, 10))) return false;
    
    sum = 0;
    for (let i = 1; i <= 10; i++) {
        sum += parseInt(numbers.substring(i - 1, i)) * (12 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    return remainder === parseInt(numbers.substring(10, 11));
}

/**
 * Limpa todos os campos do formulário
 */
function clearForm() {
    if (!confirm('Tem certeza que deseja limpar todos os campos?')) return;
    
    Object.values(formFields).forEach(field => {
        field.value = '';
    });
    
    // Resetar data para hoje
    const today = new Date().toISOString().split('T')[0];
    formFields.data.value = today;
    
    // Resetar imagem
    elements.imagePlaceholder.hidden = false;
    elements.imagePreview.hidden = true;
    elements.imagePreview.src = '';
    currentImageData = null;
    
    // Desabilitar botão de envio
    elements.submitBtn.disabled = true;
    
    console.log('🧹 Formulário limpo');
}

/**
 * Manipula o envio do formulário
 * @param {Event} event - Evento de submit
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        showModal('Erro de Validação', 'Por favor, preencha todos os campos obrigatórios corretamente.', false);
        return;
    }
    
    if (!currentImageData) {
        showModal('Aviso', 'Nenhuma imagem foi carregada. Deseja continuar sem imagem?', false);
        const proceed = confirm('Continuar sem imagem?');
        if (!proceed) return;
    }
    
    // Coletar dados do formulário
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
    
    console.log('📤 Enviando dados:', formData);
    
    // Enviar para Google Sheets
    await sendToGoogleSheets(formData);
}

// ============================================
// UI HELPERS
// ============================================

/**
 * Mostra a barra de progresso
 */
function showProgressBar() {
    elements.progressContainer.hidden = false;
    elements.progressLabel.textContent = 'Processando OCR: 0%';
    elements.progressFill.style.width = '0%';
}

/**
 * Esconde a barra de progresso
 */
function hideProgressBar() {
    elements.progressContainer.hidden = true;
}

/**
 * Mostra modal de status
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {boolean} showSpinner - Se deve mostrar spinner
 */
function showModal(title, message, showSpinner = true) {
    elements.modalTitle.textContent = title;
    elements.modalMessage.textContent = message;
    elements.modalSpinner.hidden = !showSpinner;
    elements.modalCloseBtn.hidden = showSpinner;
    elements.modal.hidden = false;
}

/**
 * Esconde o modal
 */
function hideModal() {
    elements.modal.hidden = true;
}

// ============================================
// LIMPEZA E DESTRUIÇÃO
// ============================================

/**
 * Limpa recursos do OCR quando a página é fechada
 */
function cleanup() {
    if (tesseractWorker) {
        tesseractWorker.terminate();
        tesseractWorker = null;
    }
    console.log('🧹 Recursos limpos');
}

// ============================================
// INICIALIZAÇÃO E EVENTOS
// ============================================

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializeApp);

// Limpar recursos quando a página for fechada
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

// Suporte a PWA: prevenir recarregamento em navegadores móveis
window.addEventListener('load', () => {
    if ('standalone' in navigator && navigator.standalone) {
        // iOS PWA
        console.log('📱 Executando como PWA no iOS');
    } else if (window.matchMedia('(display-mode: standalone)').matches) {
        // Android/Outros PWAs
        console.log('📱 Executando como PWA');
    }
});
