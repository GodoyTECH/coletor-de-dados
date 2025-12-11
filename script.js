/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL SIMPLIFICADO
 * Usando OCR.Space API (gratuita) + Melhoria de imagem profissional
 */

// ================================
// CONFIGURAÇÃO OCR.SPACE
// ================================
const OCR_API_KEY = 'K89229373088957'; // Chave gratuita do OCR.Space
const OCR_API_URL = 'https://api.ocr.space/parse/image';

// ================================
// VARIÁVEIS GLOBAIS
// ================================
let elements = {};
let formFields = {};
let currentImageData = null;
let isProcessing = false;

// ================================
// INICIALIZAÇÃO
// ================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando Social Coletor...');
    setupElements();
    initializeApp();
});

function setupElements() {
    elements = {
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

    formFields = {
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
}

function initializeApp() {
    setupEventListeners();
    setupDefaultDate();
    validateForm();
    console.log('✅ Aplicativo pronto!');
}

function setupEventListeners() {
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

    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', clearForm);
    }

    if (elements.dataForm) {
        elements.dataForm.addEventListener('submit', handleFormSubmit);
    }

    if (elements.modalCloseBtn) {
        elements.modalCloseBtn.addEventListener('click', hideModal);
    }

    Object.values(formFields).forEach(field => {
        if (field && field !== formFields.assinatura) {
            field.addEventListener('input', validateForm);
        }
    });
}

// ================================
// MANUSEIO DE IMAGEM
// ================================
async function handleImageSelection(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image')) {
        showModal('Erro', 'Selecione apenas imagens (JPG/PNG).', false);
        return;
    }

    showModal('Processando', 'Carregando e melhorando imagem...', true);
    showProgressBar();
    setProgress(10, 'Carregando...');

    try {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            const originalDataURL = e.target.result;
            
            // 1. Mostrar preview da imagem ORIGINAL
            showImagePreview(originalDataURL);
            
            // 2. Aplicar melhoria PROFISSIONAL
            setProgress(30, 'Otimizando imagem...');
            const enhancedImage = await enhanceImageProfessionally(originalDataURL);
            
            // 3. Mostrar imagem melhorada
            showImagePreview(enhancedImage);
            
            // 4. Processar OCR na imagem melhorada
            setProgress(60, 'Analisando texto...');
            await processOCR(enhancedImage);
            
            setProgress(100, 'Concluído!');
            setTimeout(() => {
                hideProgressBar();
                hideModal();
                showModal('✅ Sucesso!', 'Dados extraídos com sucesso! Revise os campos.', false);
            }, 500);
        };
        
        reader.onerror = () => {
            showModal('Erro', 'Falha ao ler a imagem.', false);
            hideProgressBar();
        };
        
        reader.readAsDataURL(file);
        elements.fileInput.value = '';
        
    } catch (error) {
        console.error('Erro:', error);
        hideProgressBar();
        showModal('Erro', 'Falha no processamento.', false);
    }
}

// ================================
// MELHORIA DE IMAGEM PROFISSIONAL
// ================================
async function enhanceImageProfessionally(dataURL) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                // Definir tamanho mantendo proporção
                const maxWidth = 1200;
                const maxHeight = 1600;
                let width = img.width;
                let height = img.height;
                
                // Redimensionar se necessário
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Passo 1: Desenhar imagem com suavização
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // Passo 2: Aplicar correções profissionais
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                
                // Análise de histograma para ajuste automático
                let rMin = 255, rMax = 0;
                let gMin = 255, gMax = 0;
                let bMin = 255, bMax = 0;
                
                for (let i = 0; i < data.length; i += 4) {
                    rMin = Math.min(rMin, data[i]);
                    rMax = Math.max(rMax, data[i]);
                    gMin = Math.min(gMin, data[i + 1]);
                    gMax = Math.max(gMax, data[i + 1]);
                    bMin = Math.min(bMin, data[i + 2]);
                    bMax = Math.max(bMax, data[i + 2]);
                }
                
                // Equalização de histograma para melhor contraste
                const rRange = rMax - rMin || 1;
                const gRange = gMax - gMin || 1;
                const bRange = bMax - bMin || 1;
                
                for (let i = 0; i < data.length; i += 4) {
                    // Ajuste de contraste
                    data[i] = ((data[i] - rMin) * 255) / rRange;
                    data[i + 1] = ((data[i + 1] - gMin) * 255) / gRange;
                    data[i + 2] = ((data[i + 2] - bMin) * 255) / bRange;
                    
                    // Ajuste de brilho (ligeiro aumento)
                    data[i] = Math.min(255, data[i] * 1.1);
                    data[i + 1] = Math.min(255, data[i + 1] * 1.1);
                    data[i + 2] = Math.min(255, data[i + 2] * 1.1);
                    
                    // Aumento leve de saturação
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i] = avg + (data[i] - avg) * 1.15;
                    data[i + 1] = avg + (data[i + 1] - avg) * 1.15;
                    data[i + 2] = avg + (data[i + 2] - avg) * 1.15;
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                // Passo 3: Aplicar nitidez leve
                ctx.filter = 'contrast(1.1) saturate(1.05)';
                ctx.drawImage(canvas, 0, 0);
                
                // Passo 4: Converter para JPEG de alta qualidade
                const enhancedDataURL = canvas.toDataURL('image/jpeg', 0.95);
                resolve(enhancedDataURL);
                
            } catch (error) {
                reject(error);
            }
        };
        
        img.onerror = reject;
        img.src = dataURL;
    });
}

// ================================
// OCR COM OCR.SPACE
// ================================
async function processOCR(imageDataURL) {
    try {
        // Converter dataURL para blob
        const blob = await dataURLtoBlob(imageDataURL);
        const formData = new FormData();
        formData.append('file', blob, 'document.jpg');
        formData.append('apikey', OCR_API_KEY);
        formData.append('language', 'por');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2'); // Engine 2 é mais precisa

        setProgress(70, 'Enviando para OCR...');
        
        const response = await fetch(OCR_API_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Erro OCR: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.IsErroredOnProcessing) {
            throw new Error(result.ErrorMessage || 'Erro no OCR');
        }

        // Extrair texto
        let extractedText = '';
        if (result.ParsedResults && result.ParsedResults.length > 0) {
            extractedText = result.ParsedResults[0].ParsedText;
        }

        console.log('📝 Texto extraído:', extractedText);
        
        // Processar e preencher dados
        extractAndFillData(extractedText);
        
    } catch (error) {
        console.error('❌ Erro OCR:', error);
        throw error;
    }
}

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
// EXTRAÇÃO DE DADOS
// ================================
function extractAndFillData(text) {
    const data = {
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

    // Regex melhorados
    const patterns = {
        cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,
        numeroDocumento: /\b\d{6,7}\/\d{4}\b/,
        data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/,
        quantidade: /\b(\d+(?:[.,]\d+)?)(?=\s*(?:un|kg|g|ml|l|cx|unidades?))/i,
        assinatura: /(assinado|assinatura|_+|\sX\s)/i
    };

    // Extrair CPF
    const cpfMatch = text.match(patterns.cpf);
    if (cpfMatch) data.cpf = formatCPF(cpfMatch[0]);

    // Extrair número do documento
    const docMatch = text.match(patterns.numeroDocumento);
    if (docMatch) data.numeroDocumento = docMatch[0];

    // Extrair data
    const dateMatch = text.match(patterns.data);
    if (dateMatch) data.data = formatDate(dateMatch[0]);

    // Extrair quantidade
    const qtdMatch = text.match(patterns.quantidade);
    if (qtdMatch) data.quantidade = qtdMatch[1].replace(',', '.');

    // Verificar assinatura
    if (patterns.assinatura.test(text)) data.assinatura = 'OK';

    // Análise inteligente por linhas
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    
    lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        
        // Beneficiário
        if (!data.beneficiario && /beneficiário|beneficiario|nome\s*:/.test(lowerLine)) {
            const nextLine = lines[index + 1];
            if (nextLine && nextLine.length > 3) {
                data.beneficiario = nextLine;
            } else {
                const match = line.match(/benefici[áa]rio\s*:\s*(.+)/i);
                if (match) data.beneficiario = match[1];
            }
        }
        
        // Atendente
        if (!data.atendente && /atendente|responsável|funcionário/.test(lowerLine)) {
            const nextLine = lines[index + 1];
            if (nextLine && nextLine.length > 3) {
                data.atendente = nextLine;
            }
        }
        
        // Produto
        if (!data.produto && /produto|item|descrição/.test(lowerLine)) {
            const nextLine = lines[index + 1];
            if (nextLine && nextLine.length > 2) {
                data.produto = nextLine;
            }
        }
        
        // Endereço
        if (!data.endereco && /rua|av\.|avenida|travessa|alameda|endereço/.test(lowerLine)) {
            let address = line;
            // Pegar até 3 linhas seguintes que parecem ser endereço
            for (let i = 1; i <= 3; i++) {
                const nextLine = lines[index + i];
                if (nextLine && /[\d,\-]/.test(nextLine)) {
                    address += ', ' + nextLine;
                }
            }
            data.endereco = address;
        }
    });

    // Preencher formulário
    fillFormWithData(data);
}

function fillFormWithData(data) {
    Object.entries(data).forEach(([key, value]) => {
        if (value && formFields[key]) {
            formFields[key].value = value;
            formFields[key].style.borderColor = '#4caf50';
            formFields[key].style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.2)';
        }
    });
    validateForm();
}

// ================================
// UTILITÁRIOS
// ================================
function formatCPF(cpf) {
    const numbers = cpf.replace(/\D/g, '');
    if (numbers.length !== 11) return cpf;
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDate(dateStr) {
    const match = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (!match) return '';
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function setupDefaultDate() {
    if (formFields.data) {
        const today = new Date().toISOString().split('T')[0];
        formFields.data.value = today;
    }
}

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

// ================================
// VALIDAÇÃO
// ================================
function validateForm() {
    let valid = true;
    
    Object.entries(formFields).forEach(([key, field]) => {
        if (!field || key === 'assinatura') return;
        
        const value = field.value.trim();
        if (!value) {
            valid = false;
            field.style.borderColor = '#f44336';
            return;
        }
        
        // Validações específicas
        if (key === 'cpf') {
            const cpfValid = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value);
            field.style.borderColor = cpfValid ? '#4caf50' : '#f44336';
            if (!cpfValid) valid = false;
        }
        
        if (key === 'quantidade') {
            const qtd = parseFloat(value.replace(',', '.'));
            const qtdValid = !isNaN(qtd) && qtd > 0;
            field.style.borderColor = qtdValid ? '#4caf50' : '#f44336';
            if (!qtdValid) valid = false;
        }
        
        if (key === 'data') {
            field.style.borderColor = value.length === 10 ? '#4caf50' : '#f44336';
        }
    });
    
    if (elements.submitBtn) {
        elements.submitBtn.disabled = !valid;
    }
    
    return valid;
}

function clearForm() {
    if (!confirm('Limpar todos os campos?')) return;
    
    Object.values(formFields).forEach(field => {
        if (field) {
            field.value = '';
            field.style.borderColor = '';
            field.style.boxShadow = '';
        }
    });
    
    setupDefaultDate();
    
    if (elements.imagePreview) {
        elements.imagePreview.style.display = 'none';
        elements.imagePreview.src = '';
    }
    
    if (elements.imagePlaceholder) {
        elements.imagePlaceholder.style.display = 'flex';
    }
    
    currentImageData = null;
    validateForm();
}

// ================================
// ENVIO DO FORMULÁRIO
// ================================
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        showModal('Erro', 'Preencha todos os campos obrigatórios.', false);
        return;
    }
    
    showModal('Enviando...', 'Preparando dados para Google Sheets...', true);
    
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
    
    console.log('📤 Dados para envio:', formData);
    
    // Simulação de envio (substitua pelo seu Google Apps Script)
    setTimeout(() => {
        showModal('✅ Pronto!', 
            'Dados processados com sucesso!<br><br>' +
            '<strong>Para envio real ao Google Sheets:</strong><br>' +
            '1. Crie um Google Apps Script<br>' +
            '2. Configure o Web App<br>' +
            '3. Atualize a URL em send.js', 
            false
        );
    }, 1500);
}

// ================================
// UI HELPERS
// ================================
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

function setProgress(percent, message) {
    if (elements.progressFill) {
        elements.progressFill.style.width = `${percent}%`;
    }
    if (elements.progressLabel) {
        elements.progressLabel.textContent = message || `Progresso: ${percent}%`;
    }
}

function showModal(title, message, showSpinner = true) {
    if (elements.modalTitle) elements.modalTitle.textContent = title;
    if (elements.modalMessage) elements.modalMessage.innerHTML = message;
    if (elements.modalSpinner) elements.modalSpinner.style.display = showSpinner ? 'block' : 'none';
    if (elements.modalCloseBtn) elements.modalCloseBtn.style.display = showSpinner ? 'none' : 'block';
    if (elements.modal) elements.modal.style.display = 'flex';
}

function hideModal() {
    if (elements.modal) {
        elements.modal.style.display = 'none';
    }
}

// ================================
// EXPORT PARA DEBUG
// ================================
window.SocialColetor = {
    extractAndFillData,
    validateForm,
    clearForm,
    enhanceImageProfessionally
};

console.log('📦 Social Coletor carregado com OCR.Space!');
