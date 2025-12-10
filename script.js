/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL (corrigido)
 * Responsável pela captura de imagem, OCR e preenchimento do formulário
 */

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let elements = {};
let formFields = {};

let currentImageData = null;
let tesseractWorker = null;
let isProcessing = false;

// ============================================
// REGEX PARA EXTRAÇÃO DE DADOS
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
document.addEventListener("DOMContentLoaded", () => {
    console.log('🚀 DOM carregado, inicializando app...');

    // Garantir que Tesseract carregou
    if (typeof Tesseract === 'undefined') {
        console.error('❌ Tesseract não carregado!');
        // tenta registrar modal se disponível
        alert('Biblioteca OCR não carregada. Recarregue a página.');
        return;
    }

    setupElements();
    console.table(elements);
    console.log('Campos do formulário detectados:', Object.keys(formFields));

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
    console.log('🛠 Inicializando Social Coletor...');

    setupEventListeners();
    setupDefaultDate();
    validateForm();

    console.log('✅ Aplicativo pronto!');
}

// ============================================
// EVENTOS
// ============================================
function setupEventListeners() {
    if (elements.captureBtn) {
        elements.captureBtn.addEventListener('click', () => {
            if (!elements.fileInput) return;
            elements.fileInput.setAttribute('capture', 'environment');
            elements.fileInput.click();
        });
    }

    if (elements.uploadBtn) {
        elements.uploadBtn.addEventListener('click', () => {
            if (!elements.fileInput) return;
            elements.fileInput.removeAttribute('capture');
            elements.fileInput.click();
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

    // Validação em tempo real - checando cada field
    Object.values(formFields).forEach(f => {
        if (f && f !== formFields.assinatura) {
            f.addEventListener('input', validateForm);
        }
    });
}

function setupDefaultDate() {
    if (!formFields.data) return;

    const today = new Date();
    formFields.data.value = today.toISOString().slice(0, 10);
}

// ============================================
// IMAGEM
// ============================================
function handleImageSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('image')) {
        showModal('Erro', 'Selecione apenas imagens JPG ou PNG.', false);
        return;
    }

    showModal('Processando', 'Carregando imagem...');

    const reader = new FileReader();
    reader.onload = e => {
        showImagePreview(e.target.result);

        const img = new Image();
        img.onload = () => processImageWithOCR(img);
        img.src = e.target.result;
    };

    reader.readAsDataURL(file);

    if (elements.fileInput) elements.fileInput.value = '';
}

function showImagePreview(dataURL) {
    if (elements.imagePlaceholder) elements.imagePlaceholder.style.display = 'none';
    if (elements.imagePreview) {
        elements.imagePreview.src = dataURL;
        elements.imagePreview.style.display = 'block';
    }

    currentImageData = dataURL;
}

// ============================================
// OCR
// ============================================
async function processImageWithOCR(imageElement) {
    if (isProcessing) return;

    isProcessing = true;
    showProgressBar();
    showModal('Processando OCR', 'Iniciando reconhecimento de texto...');

    try {
        tesseractWorker = await Tesseract.createWorker({
            logger: updateProgress
        });

        await tesseractWorker.loadLanguage('por');
        await tesseractWorker.initialize('por');

        // pageseg_mode como NÚMERO (melhor compatibilidade)
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-/() ,:;',
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: 6
        });

        const { data: { text } } = await tesseractWorker.recognize(imageElement);

        console.log('🔎 Texto OCR:', text);
        extractAndFillData(text);

        hideModal();
        showModal('Sucesso', 'Dados extraídos automaticamente!', false);

    } catch (err) {
        console.error('Erro OCR:', err);
        showModal('Erro', 'Falha no OCR. Verifique a imagem.', false);

    } finally {
        isProcessing = false;
        hideProgressBar();

        if (tesseractWorker) {
            try {
                await tesseractWorker.terminate();
            } catch (e) {
                console.warn('Erro ao terminar worker:', e);
            }
            tesseractWorker = null;
        }
    }
}

function updateProgress(msg) {
    if (!elements || !elements.progressLabel || !elements.progressFill) return;
    if (msg && msg.status === 'recognizing text') {
        const pct = Math.round((msg.progress || 0) * 100);
        elements.progressLabel.textContent = `OCR: ${pct}%`;
        elements.progressFill.style.width = `${pct}%`;
    }
}

// ============================================
// EXTRAÇÃO DE DADOS
// ============================================
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

    const cpfMatch = text.match(regexPatterns.cpf);
    if (cpfMatch) data.cpf = formatCPF(cpfMatch[0]);

    const docMatch = text.match(regexPatterns.numeroDocumento);
    if (docMatch) data.numeroDocumento = docMatch[0];

    const dateMatch = text.match(regexPatterns.data);
    if (dateMatch) data.data = formatDate(dateMatch[0]);

    // procura quantidade seguida de unidade comum
    const qtdMatch = text.match(/\d+(?:[.,]\d+)?(?=\s*(?:un\b|kg\b|g\b|ml\b|l\b))/i);
    if (qtdMatch) data.quantidade = qtdMatch[0].replace(',', '.');

    if (regexPatterns.assinatura.test(text)) data.assinatura = 'OK';

    // DETECÇÃO DE CAMPOS TEXTUAIS (linhas)
    const lines = text.split('\n').map(l => l.trim());

    for (let i = 0; i < lines.length; i++) {
        const line = (lines[i] || '').toLowerCase();

        if (line.includes('benef')) data.beneficiario = lines[i + 1] || data.beneficiario;
        if (line.includes('atend')) data.atendente = lines[i + 1] || data.atendente;
        if (line.includes('prod')) data.produto = lines[i + 1] || data.produto;

        if (isAddressLine(line)) {
            data.endereco = lines.slice(i, i + 3).filter(Boolean).join(', ');
        }
    }

    fillFormWithData(data);
}

function isAddressLine(line) {
    return ['rua', 'avenida', 'av.', 'travessa', 'bairro', 'cep', 'endereço', 'logradouro']
        .some(k => line.includes(k));
}

function fillFormWithData(data) {
    Object.entries(data).forEach(([k, v]) => {
        if (v && formFields[k]) {
            formFields[k].value = v;
            try { formFields[k].style.borderColor = '#4caf50'; } catch (e) { /* ignore */ }
        }
    });

    validateForm();
}

// ============================================
// UTILITÁRIOS
// ============================================
function formatCPF(cpf) {
    const n = cpf.replace(/\D/g, '');
    if (n.length !== 11) return cpf;
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatDate(str) {
    const parts = str.replace(/-/g, '/').split('/');
    const [d, m, y] = parts;
    if (!d || !m || !y) return str;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// ============================================
// FORMULÁRIO
// ============================================
function validateForm() {
    let valid = true;

    Object.entries(formFields).forEach(([k, field]) => {
        if (!field || k === 'assinatura') return;

        const val = (field.value || '').toString().trim();

        if (!val) valid = false;

        if (k === 'cpf') {
            const ok = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(val);
            if (!ok) valid = false;
        }

        if (k === 'quantidade') {
            const n = Number(val.replace(',', '.'));
            if (!n || n <= 0) valid = false;
        }
    });

    if (elements.submitBtn) elements.submitBtn.disabled = !valid;

    return valid;
}

function clearForm() {
    if (!confirm('Limpar todos os campos?')) return;

    Object.values(formFields).forEach(f => {
        if (f) {
            f.value = '';
            try { f.style.borderColor = ''; } catch (e) {}
        }
    });

    setupDefaultDate();

    if (elements.imagePreview) {
        elements.imagePreview.style.display = 'none';
        elements.imagePreview.src = '';
    }

    if (elements.imagePlaceholder) elements.imagePlaceholder.style.display = 'flex';

    currentImageData = null;
    validateForm();
}

async function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateForm()) {
        showModal('Erro', 'Preencha tudo corretamente.', false);
        return;
    }

    showModal('Enviando...', 'Aguardando...', true);

    const payload = {
        beneficiario: (formFields.beneficiario?.value || '').trim(),
        cpf: (formFields.cpf?.value || '').trim(),
        atendente: (formFields.atendente?.value || '').trim(),
        produto: (formFields.produto?.value || '').trim(),
        quantidade: parseFloat((formFields.quantidade?.value || '').replace(',', '.')) || 0,
        endereco: (formFields.endereco?.value || '').trim(),
        data: formFields.data?.value || '',
        assinatura: (formFields.assinatura?.value || '').trim() || 'N/A',
        numeroDocumento: (formFields.numeroDocumento?.value || '').trim(),
        imagemBase64: currentImageData || '',
        timestamp: new Date().toISOString()
    };

    console.log('📤 Dados preparados (simulação):', payload);

    // Simulação local: você configurará envio real depois
    setTimeout(() => {
        showModal('Pronto!', 'Dados processados localmente (simulação). Configure envio para planilha depois.', false);
    }, 1200);
}

// ============================================
// UI
// ============================================
function showProgressBar() {
    if (elements.progressContainer) elements.progressContainer.hidden = false;
}

function hideProgressBar() {
    if (elements.progressContainer) elements.progressContainer.hidden = true;
}

function showModal(title, message, spinner = true) {
    if (!elements || !elements.modal || !elements.modalTitle || !elements.modalMessage) {
        // fallback simples
        alert(title + '\n\n' + message);
        return;
    }

    elements.modalTitle.textContent = title;
    elements.modalMessage.innerHTML = message;

    if (elements.modalSpinner) elements.modalSpinner.style.display = spinner ? 'block' : 'none';
    if (elements.modalCloseBtn) elements.modalCloseBtn.style.display = spinner ? 'none' : 'block';

    elements.modal.style.display = 'flex';
}

function hideModal() {
    if (!elements || !elements.modal) return;
    elements.modal.style.display = 'none';
}

window.addEventListener('beforeunload', async () => {
    if (tesseractWorker) {
        try { await tesseractWorker.terminate(); } catch (e) {}
    }
});

// Export para debug (útil no console)
window.SocialColetor = {
    extractAndFillData,
    processImageWithOCR,
    validateForm,
    clearForm
};

console.log('📦 Script Social Coletor carregado (versão corrigida).');
