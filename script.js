/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL COMPLETO
 * OCR.Space API + Controles de Imagem + PWA
 */

// ================================
// CONFIGURAÇÃO
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

// ================================
// INICIALIZAÇÃO
// ================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando Social Coletor...');
    setupElements();
    initializeApp();
    setupPWA();
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
        
        // Modal
        modal: document.getElementById('statusModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalMessage: document.getElementById('modalMessage'),
        modalSpinner: document.getElementById('modalSpinner'),
        modalCloseBtn: document.getElementById('modalCloseBtn'),
        
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
        installContainer: document.getElementById('installContainer')
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
            if (currentImageData) {
                showModal('Melhorando...', 'Aplicando melhorias na imagem...', true);
                enhanceAndUpdateImage(currentImageData);
            }
        });
    }

    // Formulário
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', clearForm);
    }

    if (elements.dataForm) {
        elements.dataForm.addEventListener('submit', handleFormSubmit);
    }

    // Modal
    if (elements.modalCloseBtn) {
        elements.modalCloseBtn.addEventListener('click', hideModal);
    }

    // Validação de campos
    Object.values(formFields).forEach(field => {
        if (field && field !== formFields.assinatura && field !== formFields.observacoes) {
            field.addEventListener('input', validateForm);
        }
    });
}

// ================================
// CONTROLES DE IMAGEM
// ================================
function setupImageControls() {
    const imagePreview = elements.imagePreview;
    if (!imagePreview) return;

    // Eventos de zoom
    if (elements.zoomIn) {
        elements.zoomIn.addEventListener('click', () => {
            if (zoomLevel < MAX_ZOOM) {
                zoomLevel += ZOOM_STEP;
                updateImageTransform();
            }
        });
    }

    if (elements.zoomOut) {
        elements.zoomOut.addEventListener('click', () => {
            if (zoomLevel > MIN_ZOOM) {
                zoomLevel -= ZOOM_STEP;
                updateImageTransform();
            }
        });
    }

    // Eventos de movimento
    if (elements.moveUp) elements.moveUp.addEventListener('click', () => moveImage(0, -MOVE_STEP));
    if (elements.moveDown) elements.moveDown.addEventListener('click', () => moveImage(0, MOVE_STEP));
    if (elements.moveLeft) elements.moveLeft.addEventListener('click', () => moveImage(-MOVE_STEP, 0));
    if (elements.moveRight) elements.moveRight.addEventListener('click', () => moveImage(MOVE_STEP, 0));
    if (elements.moveCenter) elements.moveCenter.addEventListener('click', () => centerImage());

    // Eventos de rotação
    if (elements.rotateLeft) elements.rotateLeft.addEventListener('click', () => rotateImage(-90));
    if (elements.rotateRight) elements.rotateRight.addEventListener('click', () => rotateImage(90));

    // Eventos de arrastar
    imagePreview.addEventListener('mousedown', startDragging);
    imagePreview.addEventListener('touchstart', startDraggingTouch);
    
    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('touchmove', handleDraggingTouch);
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('touchend', stopDragging);

    // Zoom com roda do mouse
    if (elements.imageZoomContainer) {
        elements.imageZoomContainer.addEventListener('wheel', handleWheelZoom);
    }

    // Atalhos de teclado
    document.addEventListener('keydown', handleKeyboardControls);
}

function updateImageTransform() {
    const imagePreview = elements.imagePreview;
    if (!imagePreview) return;

    imagePreview.style.transform = `
        translate(${posX}px, ${posY}px) 
        scale(${zoomLevel}) 
        rotate(${rotation}deg)
    `;
    
    if (elements.zoomLevelDisplay) {
        elements.zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
}

function moveImage(deltaX, deltaY) {
    posX += deltaX;
    posY += deltaY;
    updateImageTransform();
}

function centerImage() {
    posX = 0;
    posY = 0;
    updateImageTransform();
}

function rotateImage(degrees) {
    rotation += degrees;
    updateImageTransform();
}

function startDragging(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startPosX = posX;
    startPosY = posY;
    elements.imagePreview.style.cursor = 'grabbing';
}

function startDraggingTouch(e) {
    if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startPosX = posX;
        startPosY = posY;
        e.preventDefault();
    }
}

function handleDragging(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    posX = startPosX + deltaX;
    posY = startPosY + deltaY;
    
    updateImageTransform();
}

function handleDraggingTouch(e) {
    if (!isDragging || e.touches.length !== 1) return;
    
    const deltaX = e.touches[0].clientX - startX;
    const deltaY = e.touches[0].clientY - startY;
    
    posX = startPosX + deltaX;
    posY = startPosY + deltaY;
    
    updateImageTransform();
    e.preventDefault();
}

function stopDragging() {
    isDragging = false;
    if (elements.imagePreview) {
        elements.imagePreview.style.cursor = 'move';
    }
}

function handleWheelZoom(e) {
    e.preventDefault();
    
    if (e.deltaY < 0) {
        // Scroll para cima - zoom in
        if (zoomLevel < MAX_ZOOM) {
            zoomLevel += ZOOM_STEP;
        }
    } else {
        // Scroll para baixo - zoom out
        if (zoomLevel > MIN_ZOOM) {
            zoomLevel -= ZOOM_STEP;
        }
    }
    
    updateImageTransform();
}

function handleKeyboardControls(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch(e.key) {
        case '+':
        case '=':
            e.preventDefault();
            if (zoomLevel < MAX_ZOOM) {
                zoomLevel += ZOOM_STEP;
                updateImageTransform();
            }
            break;
        case '-':
        case '_':
            e.preventDefault();
            if (zoomLevel > MIN_ZOOM) {
                zoomLevel -= ZOOM_STEP;
                updateImageTransform();
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            moveImage(0, -MOVE_STEP);
            break;
        case 'ArrowDown':
            e.preventDefault();
            moveImage(0, MOVE_STEP);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            moveImage(-MOVE_STEP, 0);
            break;
        case 'ArrowRight':
            e.preventDefault();
            moveImage(MOVE_STEP, 0);
            break;
        case 'c':
        case 'C':
            e.preventDefault();
            centerImage();
            break;
    }
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

async function enhanceAndUpdateImage(dataURL) {
    try {
        const enhancedImage = await enhanceImageProfessionally(dataURL);
        showImagePreview(enhancedImage);
        hideModal();
        showModal('✅ Imagem Melhorada!', 'A qualidade da imagem foi otimizada para OCR.', false);
    } catch (error) {
        hideModal();
        showModal('❌ Erro', 'Não foi possível melhorar a imagem.', false);
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
        numeroDocumento: '',
        observacoes: ''
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

    // Adicionar texto extra nas observações se tiver informações úteis
    const textoParaObservacoes = [];
    lines.forEach((line, index) => {
        // Capturar informações que não foram classificadas
        if (!isClassifiedLine(line, data) && line.length > 10) {
            textoParaObservacoes.push(line);
        }
    });
    
    if (textoParaObservacoes.length > 0) {
        data.observacoes = textoParaObservacoes.join('; ');
    }

    // Preencher formulário
    fillFormWithData(data);
}

function isClassifiedLine(line, data) {
    const lineLower = line.toLowerCase();
    return (
        data.beneficiario && lineLower.includes(data.beneficiario.toLowerCase()) ||
        data.atendente && lineLower.includes(data.atendente.toLowerCase()) ||
        data.produto && lineLower.includes(data.produto.toLowerCase()) ||
        data.endereco && lineLower.includes(data.endereco.toLowerCase()) ||
        /cpf|documento|assinatura|data|quantidade|valor/i.test(lineLower)
    );
}

function fillFormWithData(data) {
    Object.entries(data).forEach(([key, value]) => {
        if (value && formFields[key]) {
            formFields[key].value = value;
            // Efeito visual de preenchimento
            formFields[key].style.borderColor = '#4caf50';
            formFields[key].style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.2)';
            
            // Remover efeito após 2 segundos
            setTimeout(() => {
                if (formFields[key]) {
                    formFields[key].style.boxShadow = '';
                }
            }, 2000);
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
    
    if (elements.imageWrapper) {
        elements.imageWrapper.style.display = 'flex';
    }
    
    if (elements.imagePreview) {
        elements.imagePreview.src = dataURL;
        elements.imagePreview.style.display = 'block';
        
        // Resetar controles
        zoomLevel = 1;
        posX = 0;
        posY = 0;
        rotation = 0;
        updateImageTransform();
    }
    
    if (elements.btnMelhorarFoto) {
        elements.btnMelhorarFoto.style.display = 'inline-block';
    }
    
    currentImageData = dataURL;
}

// ================================
// VALIDAÇÃO
// ================================
function validateForm() {
    let valid = true;
    
    Object.entries(formFields).forEach(([key, field]) => {
        if (!field || key === 'assinatura' || key === 'observacoes') return;
        
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
        elements.submitBtn.title = valid ? 'Clique para enviar' : 'Preencha todos os campos obrigatórios';
    }
    
    return valid;
}

function clearForm() {
    if (!confirm('Limpar todos os campos e imagem?')) return;
    
    Object.values(formFields).forEach(field => {
        if (field) {
            field.value = '';
            field.style.borderColor = '';
            field.style.boxShadow = '';
        }
    });
    
    setupDefaultDate();
    
    // Resetar imagem
    if (elements.imagePreview) {
        elements.imagePreview.style.display = 'none';
        elements.imagePreview.src = '';
    }
    
    if (elements.imageWrapper) {
        elements.imageWrapper.style.display = 'none';
    }
    
    if (elements.imagePlaceholder) {
        elements.imagePlaceholder.style.display = 'flex';
    }
    
    if (elements.btnMelhorarFoto) {
        elements.btnMelhorarFoto.style.display = 'none';
    }
    
    // Resetar controles
    zoomLevel = 1;
    posX = 0;
    posY = 0;
    rotation = 0;
    updateImageTransform();
    
    currentImageData = null;
    validateForm();
}

// ================================
// ENVIO DO FORMULÁRIO
// ================================
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        showModal('Erro', 'Preencha todos os campos obrigatórios corretamente.', false);
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
        observacoes: formFields.observacoes.value.trim() || '',
        imagemBase64: currentImageData || '',
        timestamp: new Date().toISOString()
    };
    
    console.log('📤 Dados para envio:', formData);
    
    try {
        // Usar função de envio do send.js
        if (typeof sendToGoogleSheets === 'function') {
            const result = await sendToGoogleSheets(formData);
            
            if (result.success) {
                showModal('✅ Sucesso!', 
                    `Dados enviados com sucesso!<br><br>
                    <strong>ID do Registro:</strong> ${result.recordId || 'N/A'}<br>
                    <strong>Data/Hora:</strong> ${result.timestamp || new Date().toLocaleString('pt-BR')}`,
                    false
                );
                
                // Limpar formulário após sucesso
                setTimeout(() => {
                    clearForm();
                }, 3000);
            } else {
                showModal('❌ Erro no Envio', 
                    `Não foi possível enviar os dados:<br>
                    ${result.error || 'Erro desconhecido'}<br><br>
                    ${result.savedLocally ? '<small>✓ Dados salvos localmente para envio posterior</small>' : ''}`,
                    false
                );
            }
        } else {
            // Fallback se sendToGoogleSheets não existir
            setTimeout(() => {
                showModal('⚠️ Configuração Necessária', 
                    'Função de envio não encontrada.<br><br>' +
                    'Configure a URL do Google Apps Script em send.js', 
                    false
                );
            }, 1500);
        }
    } catch (error) {
        console.error('Erro no envio:', error);
        showModal('❌ Erro', 'Falha ao processar envio: ' + error.message, false);
    }
}

// ================================
// PWA - INSTALAÇÃO
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
    
    // Evento para instalação
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
            'Tente usar o menu do navegador (⋯) e selecione "Instalar aplicativo".',
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
    enhanceImageProfessionally,
    installPWA,
    showInstallPrompt,
    hideInstallPrompt
};

console.log('📦 Social Coletor carregado com PWA e controles de imagem!');
