/* SOCIAL COLETOR - OCR
 * OCR.Space API + Controles de Imagem + Processamento de OCR
 */

// ================================
// CONFIGURAÇÃO OCR
// ================================

const OCR_API_KEY = 'K89229373088957'; // Chave gratuita do OCR.Space
const OCR_API_URL = 'https://api.ocr.space/parse/image';

// ================================
// MANUSEIO DE IMAGEM
// ================================
async function handleImageSelection(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image')) {
        showStatusMessage('Selecione apenas imagens (JPG/PNG).', 'error');
        return;
    }

    showStatusMessage('Carregando e melhorando imagem...', 'info');
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
            hideProgressBar();
            showStatusMessage('Imagem processada com sucesso!', 'success');
        };
        
        reader.onerror = () => {
            hideProgressBar();
            showStatusMessage('Erro ao ler a imagem.', 'error');
        };
        
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Erro ao processar imagem:', error);
        hideProgressBar();
        showStatusMessage('Erro ao processar imagem: ' + error.message, 'error');
    }
}

async function enhanceAndUpdateImage(dataURL) {
    try {
        const enhancedImage = await enhanceImageProfessionally(dataURL);
        showImagePreview(enhancedImage);
        showStatusMessage('Imagem otimizada com sucesso!', 'success');
    } catch (error) {
        showStatusMessage('Não foi possível melhorar a imagem.', 'error');
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
        formData.append('isTable', 'true');
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
        showStatusMessage('Erro ao processar OCR: ' + error.message, 'error');
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
        fornecedor: '',
        observacoes: ''
    };

    // Regex melhorados
    const patterns = {
        cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,
        numeroDocumento: /\b\d{6,7}\/\d{4}\b/,
        data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/,
        quantidade: /\b(\d+(?:[.,]\d{1,2})?)(?=\s*(?:un|kg|g|ml|l|cx|unidades?))/i,
        quantidadeRotulo: /\b(?:quantidade|qtd|qtde)\b[^\d]*(\d+(?:[.,]\d{1,2})?)/i,
        assinatura: /(assinado|assinatura|_+|\sX\s)/i
    };
    const quantidadeSolta = /(\d{1,4}(?:[.,]\d{1,2})?)(?!\d)/;
    const labelPatterns = {
        beneficiario: /\b(benefici[áa]rio|beneficiario|nome do benefici[áa]rio|nome benefici[áa]rio)\b/i,
        atendente: /\b(atendente|respons[aá]vel|funcion[aá]rio)\b/i,
        // IMPORTANTÍSSIMO: não tratar "PRODUTO PARA RETIRAR..." como rótulo de produto
        produto: /\b(produto|item|descri[cç][aã]o)\b(?!\s+para\s+retirar)/i,
        quantidade: /\b(quant\w{0,6}dad\w*|qtd|qtde)\b/i
    };
    const numericValue = /(\d+(?:[.,]\d{1,2})?)/;

    const isNumericOnly = (value) => {
        const cleaned = String(value || '').replace(/[.\-\s]/g, '');
        return cleaned.length > 0 && /^\d+$/.test(cleaned);
    };

    const isLikelyDocument = (value) => {
        return patterns.cpf.test(value) || patterns.numeroDocumento.test(value);
    };

    const extractAfterLabel = (line, regex) => {
        const match = line.match(new RegExp(`${regex.source}\\s*[:\\-]?\\s*(.+)`, 'i'));
        return match ? match[1].trim() : '';
    };

    const sanitizeProduto = (value) => {
        if (!value) return '';
        const trimmed = String(value).trim();

        // Se terminar com número, só considera como quantidade quando houver decimal (ex: 2,00 / 2.0)
        // Isso evita casos como "COVID 19" virar quantidade.
        const match = trimmed.match(/^(.*?)(?:\s+(\d+(?:[.,]\d{1,2})?))?$/);
        if (match) {
            const possibleQty = match[2];
            if (possibleQty && !data.quantidade) {
                if (/[.,]\d{1,2}$/.test(possibleQty)) {
                    data.quantidade = normalizeQuantityInput(possibleQty);
                }
            }
            return String(match[1] || '').trim();
        }
        return trimmed;
    };


    // ================================
    // HELPERS (mais robustos p/ Nota de Entrega)
    // ================================
    const normalizeSpaces = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    const hasLetters = (s) => /[A-ZÁ-Ú]/i.test(String(s || ''));
    const hasManyDigits = (s) => (String(s || '').match(/\d/g) || []).length >= 6;

    const looksLikeName = (s) => {
        const v = normalizeSpaces(s);
        if (!v || v.length < 4) return false;
        if (!hasLetters(v)) return false;
        if (/\d/.test(v)) return false;
        if (/\b(produto|item|descri[cç][aã]o|quantidade|qtd|qtde|fornecedor|benefici[áa]rio|cpf|documento|data|nota|entrega)\b/i.test(v)) return false;

        // rejeita palavras comuns de produto/logística que aparecem em anotações e confundem o OCR
        if (/\b(fralda|covid|doa[cç][aã]o|dep[oó]sito|prefeito|cidade|avenida|rua|jardim|barueri|sp)\b/i.test(v)) return false;

        // geralmente vem com 2+ palavras (ex: SHAMIRA CAROLINA ROMANZINI)
        return v.split(' ').length >= 2;
    };

    const looksLikeProdutoValue = (s) => {
        const v = normalizeSpaces(s);
        if (!v || v.length < 3) return false;
        if (!hasLetters(v)) return false;
        // evita capturar cabeçalhos/labels
        if (/\b(benefici|cpf|documento|fornecedor|atendente|quantidade|data|nota)\b/i.test(v)) return false;
        return true;
    };

    const isBadQuantity = (q) => {
        const n = Number(String(q || '').replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0) return true;
        if (n > 1000) return true; // evita 341245, 06401050, etc.
        if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true; // evita ano 2025
        return false;
    };

    const extractForwardValue = (linesArr, startIndex, inlineValue, validator, maxLook = 5) => {
        const inline = normalizeSpaces(inlineValue);
        if (inline && validator(inline)) return inline;

        for (let i = 1; i <= maxLook; i++) {
            const candidate = normalizeSpaces(linesArr[startIndex + i]);
            if (!candidate) continue;

            // ignora linha que parece barcode/código longo
            if (hasManyDigits(candidate)) continue;

            // evita bater em outros rótulos curtos
            if (/\b(benefici|cpf|documento|fornecedor|produto|quantidade|data|nota|atendente)\b/i.test(candidate) && candidate.length < 30) {
                continue;
            }

            if (validator(candidate)) return candidate;
        }
        return '';
    };

    const extractQuantidadeNear = (linesArr, index) => {
        const candidates = [];

        const pushFromLine = (ln) => {
            const line = String(ln || '');
            if (!line) return;

            // pula datas tipo 09/12/2025
            if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) return;

            const matches = line.match(/\d{1,4}(?:[.,]\d{1,2})?/g) || [];
            matches.forEach((m) => candidates.push(m));
        };

        pushFromLine(linesArr[index]);

        // olha algumas linhas à frente, mas para se entrar em outro bloco
        for (let i = 1; i <= 4; i++) {
            const ln = String(linesArr[index + i] || '');
            if (!ln) continue;
            if (/\b(produto|fornecedor|benefici|cpf|documento|data)\b/i.test(ln)) break;
            pushFromLine(ln);
        }

        const cleaned = candidates
            .map((raw) => ({ raw, num: Number(String(raw).replace(',', '.')) }))
            .filter((x) => Number.isFinite(x.num) && !isBadQuantity(x.raw));

        if (cleaned.length === 0) return '';

        // prioriza valores com decimal (ex: 2,00) e menores
        cleaned.sort((a, b) => {
            const aDec = /[.,]\d{1,2}$/.test(a.raw) ? 1 : 0;
            const bDec = /[.,]\d{1,2}$/.test(b.raw) ? 1 : 0;
            if (aDec !== bDec) return bDec - aDec;
            return a.num - b.num;
        });

        return cleaned[0].raw;
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

    // Extrair quantidade (prioridade por rótulo)
    const qtdMatch = text.match(patterns.quantidadeRotulo);
    if (qtdMatch) data.quantidade = normalizeQuantityInput(qtdMatch[1]);

    // Verificar assinatura
    if (patterns.assinatura.test(text)) data.assinatura = 'OK';

    // Análise inteligente por linhas
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    
    lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        
        // Beneficiário
        if (!data.beneficiario && labelPatterns.beneficiario.test(lowerLine)) {
            const inlineValue = extractAfterLabel(line, labelPatterns.beneficiario);
            const nextLine = lines[index + 1];
            const candidate = inlineValue || nextLine || '';
            if (candidate && candidate.length > 3) {
                data.beneficiario = candidate;
            }
        }
        // Atendente (mais robusto: limpa inline com dígitos e limita lookahead para não cair em rodapé/anotações)
        if (!data.atendente && labelPatterns.atendente.test(lowerLine)) {
            let inlineValue = extractAfterLabel(line, labelPatterns.atendente);
            inlineValue = normalizeSpaces(inlineValue)
                // remove sequências numéricas longas (barcode / códigos) e qualquer resto após isso
                .replace(/\b\d{6,}\b.*$/, '')
                .trim();

            const candidate = extractForwardValue(lines, index, inlineValue, (v) => {
                const cleaned = normalizeSpaces(v).replace(/\b\d{6,}\b.*$/, '').trim();
                if (!looksLikeName(cleaned)) return false;
                if (isNumericOnly(cleaned) || isLikelyDocument(cleaned)) return false;
                if (labelPatterns.produto.test(cleaned) || labelPatterns.quantidade.test(cleaned)) return false;
                return true;
            }, 3);

            if (candidate) {
                data.atendente = normalizeSpaces(candidate).replace(/\b\d{6,}\b.*$/, '').trim();
            }
        }
        // Quantidade (mais robusto: pega número perto do rótulo e evita ano/documento/endereço)
        if (!data.quantidade && labelPatterns.quantidade.test(lowerLine)) {
            const inlineValue = extractAfterLabel(line, labelPatterns.quantidade);

            let qty = '';
            const inlineMatch = normalizeSpaces(inlineValue).match(/(\d{1,4}(?:[.,]\d{1,2})?)/);
            if (inlineMatch && !isBadQuantity(inlineMatch[1])) {
                qty = inlineMatch[1];
            } else {
                qty = extractQuantidadeNear(lines, index);
            }

            if (qty && !isBadQuantity(qty)) {
                data.quantidade = normalizeQuantityInput(qty);
            }
        }
        // Produto (mais robusto: procura o valor real e evita cair em "Fornecedor" ou outros rótulos)
        if (!data.produto && labelPatterns.produto.test(lowerLine)) {
            const inlineValue = extractAfterLabel(line, labelPatterns.produto);
            const candidate = extractForwardValue(lines, index, inlineValue, (v) => {
                if (!looksLikeProdutoValue(v)) return false;
                if (isNumericOnly(v) || isLikelyDocument(v)) return false;
                if (labelPatterns.atendente.test(v) || labelPatterns.quantidade.test(v)) return false;
                return true;
            });

            if (candidate) data.produto = sanitizeProduto(candidate);
        }

        // Quantidade na mesma linha de "produto" (ex: "... Produto ... 2,00")
        // Regras de segurança:
        // - ignora "produto para retirar" (onde há datas)
        // - ignora linhas com datas
        // - só aceita número com decimal OU com unidade explícita
        if (!data.quantidade && labelPatterns.produto.test(lowerLine)) {
            const raw = String(line || '');
            if (/\bpara\s+retirar\b/i.test(raw)) {
                // ex: "PRODUTO PARA RETIRAR EM 09/12/2025..." -> não é quantidade
            } else if (/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(raw)) {
                // contém data -> não inferir quantidade daqui
            } else {
                const unitMatch = raw.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(un|kg|g|ml|l|cx|unidades?)\b/i);
                const decMatch = raw.match(/\b\d{1,4}[.,]\d{1,2}\b/);
                const qty = unitMatch ? unitMatch[1] : (decMatch ? decMatch[0] : '');

                if (qty && !isBadQuantity(qty)) {
                    data.quantidade = normalizeQuantityInput(qty);
                }
            }
        }
        
        // Endereço
        if (!data.endereco && /rua|av\.|avenida|travessa|alameda|endereço/.test(lowerLine)) {
            const parts = [line];

            // Pega até 4 linhas seguintes, aceitando linhas com letras (bairro/cidade) e/ou números (nº/CEP)
            for (let i = 1; i <= 4; i++) {
                const nextLine = normalizeSpaces(lines[index + i]);
                if (!nextLine) continue;

                // para se entrar em outro bloco/campo
                if (/\b(benefici|cpf|produto|quantidade|fornecedor|atendente|data|nota)\b/i.test(nextLine)) break;

                // ignora linha que parece barcode/código longo
                if (hasManyDigits(nextLine)) continue;

                if (hasLetters(nextLine) || /[\d,\-]/.test(nextLine)) {
                    parts.push(nextLine);
                }
            }

            data.endereco = parts.join(', ');
        }

        // Fornecedor
        if (!data.fornecedor && /fornecedor/.test(lowerLine)) {
            const match = line.match(/fornecedor\s*:\s*(.+)/i);
            if (match) {
                data.fornecedor = match[1];
            } else {
                const nextLine = lines[index + 1];
                if (nextLine && nextLine.length > 2) {
                    data.fornecedor = nextLine;
                }
            }
        }
    });

    if (data.atendente && (isNumericOnly(data.atendente) || isLikelyDocument(data.atendente))) {
        data.atendente = '';
    }

    if (data.produto) {
        const cleanedProduto = data.produto.replace(/\s+(\d+(?:[.,]\d{1,2})?)\s*$/, '');
        if (cleanedProduto !== data.produto) {
            if (!data.quantidade) {
                const match = data.produto.match(numericValue);
                // só aceita como quantidade se parecer decimal (evita COVID 19)
                if (match && /[.,]\d{1,2}$/.test(match[1])) {
                    data.quantidade = normalizeQuantityInput(match[1]);
                }
            }
            data.produto = cleanedProduto.trim();
        }
    }

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

    if (data.fornecedor) {
        const fornecedorInfo = `Fornecedor: ${data.fornecedor}`;
        data.observacoes = data.observacoes
            ? `${fornecedorInfo}; ${data.observacoes}`
            : fornecedorInfo;
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
        data.fornecedor && lineLower.includes(data.fornecedor.toLowerCase()) ||
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

function showImagePreview(dataURL) {
    if (elements.imagePlaceholder) {
        elements.imagePlaceholder.style.display = 'none';
    }
    
    if (elements.imageWrapper) {
        elements.imageWrapper.style.display = 'flex';
    }

    if (elements.imageDraggableContainer) {
        elements.imageDraggableContainer.style.display = 'flex';
    }
    
    if (elements.imagePreview) {
        elements.imagePreview.src = dataURL;
        elements.imagePreview.hidden = false;
        elements.imagePreview.removeAttribute('hidden');
        elements.imagePreview.style.display = 'block';
        
        // Resetar controles
        resetImageTransform();
    }
    
    if (elements.btnMelhorarFoto) {
        elements.btnMelhorarFoto.style.display = 'inline-block';
    }
    
    currentImageData = dataURL;
}

window.handleImageSelection = handleImageSelection;
window.extractAndFillData = extractAndFillData;
window.processOCR = processOCR;
window.enhanceAndUpdateImage = enhanceAndUpdateImage;
window.enhanceImageProfessionally = enhanceImageProfessionally;
