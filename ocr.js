/* SOCIAL COLETOR - OCR (IMPROVED)
 * OCR.Space API + Controles de Imagem + Processamento de OCR + Extração Robustecida
 *
 * Objetivo desta versão:
 * - Resolver preenchimento errado (Quantidade "09", Atendente virando anotação, Produto/Quantidade na mesma linha, Endereço incompleto)
 * - Sem quebrar integrações: mantém nomes de funções públicas já usados no sistema (handleImageSelection, processOCR, extractAndFillData, etc.)
 *
 * Observação importante de segurança:
 * - OCR_API_KEY no frontend expõe sua chave. Mantive como está para não quebrar.
 *   Recomendo mover para uma Netlify Function quando você quiser (instruções ao final).
 */

// ================================
// CONFIGURAÇÃO OCR
// ================================

const OCR_API_KEY = 'K89229373088957'; // Chave gratuita do OCR.Space (ATENÇÃO: exposta no frontend)
const OCR_API_URL = 'https://api.ocr.space/parse/image';

// Ajustes finos (não quebram nada; apenas controlam comportamento)
const OCR_CONFIG = {
  language: 'por',
  detectOrientation: true,
  scale: true,
  // "isTable" pode ajudar ou piorar dependendo do documento; mantenho seu padrão, mas você pode alternar:
  isTable: true,
  // Pedir overlay dá acesso a linhas/palavras e melhora muito a extração (não muda o ParsedText).
  isOverlayRequired: true,
  OCREngine: '2' // Engine 2 costuma ser melhor para português/impresso
};

// Opcional: usar Tesseract como fallback APENAS se existir no projeto (não quebra se não existir)
const TESSERACT_FALLBACK = {
  enabled: true,
  // Só roda se faltar algum campo crítico após OCR.space
  requireFields: ['beneficiario', 'cpf', 'numeroDocumento', 'produto', 'quantidade', 'atendente', 'endereco', 'data']
};

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

    img.onload = function () {
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
// OCR COM OCR.SPACE (com overlay p/ melhor parsing)
// ================================
async function processOCR(imageDataURL) {
  try {
    // Converter dataURL para blob
    const blob = await dataURLtoBlob(imageDataURL);
    const formData = new FormData();
    formData.append('file', blob, 'document.jpg');
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', OCR_CONFIG.language);
    formData.append('isOverlayRequired', OCR_CONFIG.isOverlayRequired ? 'true' : 'false');
    formData.append('detectOrientation', OCR_CONFIG.detectOrientation ? 'true' : 'false');
    formData.append('scale', OCR_CONFIG.scale ? 'true' : 'false');
    formData.append('isTable', OCR_CONFIG.isTable ? 'true' : 'false');
    formData.append('OCREngine', OCR_CONFIG.OCREngine);

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

    // Texto bruto
    let extractedText = '';
    let overlayLines = null;

    if (result.ParsedResults && result.ParsedResults.length > 0) {
      const pr = result.ParsedResults[0];
      extractedText = pr.ParsedText || '';
      overlayLines = pr?.TextOverlay?.Lines || null;
    }

    console.log('📝 Texto extraído (OCR.Space):', extractedText);

    // Processar e preencher dados usando a MELHOR FONTE (overlay se disponível)
    const filled = extractAndFillData(extractedText, overlayLines);

    // Fallback Tesseract (opcional)
    if (TESSERACT_FALLBACK.enabled && ('Tesseract' in window) && window.Tesseract) {
      const missing = getMissingCriticalFields_(filled, TESSERACT_FALLBACK.requireFields);
      if (missing.length > 0) {
        console.log('🔁 Rodando Tesseract fallback (faltando):', missing);

        setProgress(85, 'Refinando com Tesseract...');
        try {
          const { data } = await window.Tesseract.recognize(imageDataURL, 'por', { logger: () => {} });
          const tessText = data?.text || '';
          console.log('🧠 Texto extraído (Tesseract):', tessText);

          // Repassa combinando os textos; mantém preenchimento atual e só completa o que falta
          extractAndFillData(extractedText + '\n' + tessText, overlayLines, { onlyFillMissing: true });
        } catch (e) {
          console.warn('Tesseract fallback falhou:', e);
        }
      }
    }
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
// EXTRAÇÃO DE DADOS (ROBUSTA)
// ================================

/**
 * extractAndFillData(text, overlayLines, options)
 * - overlayLines: linhas do OCR.Space com posição (se isOverlayRequired=true)
 * - options.onlyFillMissing: quando true, não sobrescreve campos já preenchidos
 *
 * Retorna o objeto "data" preenchido.
 */
function extractAndFillData(text, overlayLines = null, options = {}) {
  const onlyFillMissing = !!options.onlyFillMissing;

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

  // Helpers base (mantém compatibilidade)
  const normalizeSpaces = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const cleanOCRText = (s) =>
    String(s || '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const hasLetters = (s) => /[A-ZÁ-Ú]/i.test(String(s || ''));
  const digitCount = (s) => (String(s || '').match(/\d/g) || []).length;
  const hasManyDigits = (s) => digitCount(s) >= 6;

  const isNumericOnly = (value) => {
    const cleaned = String(value || '').replace(/[.\-\s]/g, '');
    return cleaned.length > 0 && /^\d+$/.test(cleaned);
  };

  const looksLikeBarcodeOrCode = (s) => {
    const v = normalizeSpaces(s);
    if (!v) return false;
    const d = digitCount(v);
    const l = (v.match(/[A-ZÁ-Ú]/gi) || []).length;
    if (d >= 8 && l <= 2) return true;
    if (/^\d{8,}$/.test(v.replace(/\s+/g, ''))) return true;
    return false;
  };

  const isBadQuantity = (q) => {
    const n = Number(String(q || '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return true;
    if (n > 1000) return true; // evita CEP/documento
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true; // evita ano
    return false;
  };

  // Regex principais
  const patterns = {
    cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,
    numeroDocumento: /\b\d{6,7}\/\d{4}\b/,
    data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/,
    assinatura: /(assinado|assinatura|_+|\sX\s)/i
  };

  // Linhas (preferir overlay se disponível)
  const lines = buildLinesFromSources_(cleanOCRText(text), overlayLines);

  // Debug
  console.log('📌 Linhas normalizadas:', lines);

  // ===========
  // Passo 1: Extrações diretas por regex no texto completo (mais estável)
  // ===========
  const cpfMatch = text.match(patterns.cpf);
  if (cpfMatch) data.cpf = formatCPF(cpfMatch[0]);

  const docMatch = text.match(patterns.numeroDocumento);
  if (docMatch) data.numeroDocumento = docMatch[0];

  const dateMatch = text.match(patterns.data);
  if (dateMatch) data.data = formatDate(dateMatch[0]);

  if (patterns.assinatura.test(text)) data.assinatura = 'OK';

  // ===========
  // Passo 2: Regras fortes por linha (produto+quantidade, beneficiário, atendente, endereço)
  // ===========

  // 2.1) Produto + Quantidade na MESMA linha (seu caso principal)
  if (!data.produto || !data.quantidade) {
    const pq = findProdutoQuantidadeLine_(lines);
    if (pq) {
      data.produto = data.produto || pq.produto;
      data.quantidade = data.quantidade || pq.quantidade;
    }
  }

  // 2.2) Beneficiário
  if (!data.beneficiario) {
    const b = findBeneficiario_(lines);
    if (b) data.beneficiario = b;
  }

  // 2.3) Fornecedor
  if (!data.fornecedor) {
    const f = findFornecedor_(lines);
    if (f) data.fornecedor = f;
  }

  // 2.4) Endereço
  if (!data.endereco) {
    const e = findEndereco_(lines);
    if (e) data.endereco = e;
  }

  // 2.5) Atendente (nome pode vir antes do rótulo)
  if (!data.atendente) {
    const a = findAtendente_(lines);
    if (a) data.atendente = a;
  }

  // ===========
  // Passo 3: Observações
  // ===========
  const obs = buildObservacoes_(lines, data);
  if (obs) data.observacoes = obs;

  // ===========
  // Passo 4: preencher no formulário
  // ===========
  const finalData = onlyFillMissing ? filterOnlyMissingForForm_(data) : data;

  console.log('✅ Dados extraídos (final):', finalData);

  fillFormWithData(finalData);
  return data;

  // =========================
  // Funções internas (scoped)
  // =========================

  function buildLinesFromSources_(rawText, overlay) {
    const out = [];

    // 1) Overlay
    if (Array.isArray(overlay) && overlay.length > 0) {
      overlay.forEach((l) => {
        const t = normalizeSpaces(l?.LineText || '');
        if (t && t.length > 1) out.push(t);
      });
    }

    // 2) Fallback: split do ParsedText
    if (out.length === 0) {
      rawText
        .split('\n')
        .map((l) => normalizeSpaces(l))
        .filter((l) => l.length > 1)
        .forEach((l) => out.push(l));
    }

    return out
      .map((l) => l.replace(/[^\S\r\n]+/g, ' ').trim())
      .filter((l) => l.length > 1);
  }

  function findProdutoQuantidadeLine_(linesArr) {
    const rxTailDecimal = /^(?!.*\bpara\s+retirar\b)(?!.*\b\d{1,2}\/\d{1,2}\/\d{4}\b)(?=.*[A-ZÁ-Úa-zá-ú]).*?(\d{1,4}[.,]\d{1,2})\s*$/;
    const rxUnit = /^(?!.*\bpara\s+retirar\b)(?!.*\b\d{1,2}\/\d{1,2}\/\d{4}\b)(.*\D)\s+(\d{1,4}(?:[.,]\d{1,2})?)\s*(un|kg|g|ml|l|cx|unidades?)\b/i;

    let best = null;

    for (const line of linesArr) {
      const v = normalizeSpaces(line);

      if (/^\s*(prefeit|secret|nota|entrega|via)\b/i.test(v)) continue;
      if (/\bbenefici|cpf|documento|fornecedor|atendente\b/i.test(v) && v.length < 40) continue;
      if (looksLikeBarcodeOrCode(v)) continue;

      const mu = v.match(rxUnit);
      if (mu) {
        const produto = normalizeSpaces(mu[1]);
        const qtd = mu[2];
        if (produto && qtd && !isBadQuantity(qtd)) {
          return { produto: sanitizeProduto_(produto), quantidade: normalizeQuantityInput(qtd) };
        }
      }

      const md = v.match(rxTailDecimal);
      if (md) {
        const qtd = md[1];
        if (!isBadQuantity(qtd)) {
          const produto = normalizeSpaces(v.replace(new RegExp(`\\s*${escapeRegExp_(qtd)}\\s*$`), ''));
          if (produto && produto.length >= 3) {
            const score =
              (/[A-ZÁ-Ú]{3,}/.test(produto) ? 2 : 0) +
              (/\b(covid|fralda|doa[cç][aã]o)\b/i.test(produto) ? 2 : 0) -
              (/\bavenida|rua|jardim|barueri\b/i.test(produto) ? 3 : 0);

            if (!best || score > best.score) {
              best = { produto: sanitizeProduto_(produto), quantidade: normalizeQuantityInput(qtd), score };
            }
          }
        }
      }
    }

    return best ? { produto: best.produto, quantidade: best.quantidade } : null;
  }

  function findBeneficiario_(linesArr) {
    for (let i = 0; i < linesArr.length; i++) {
      const v = normalizeSpaces(linesArr[i]);
      if (/\bbenefici[áa]rio\b/i.test(v)) {
        const next = normalizeSpaces(linesArr[i + 1] || '');
        const inline = normalizeSpaces(v.replace(/\bbenefici[áa]rio\b[:\-]?\s*/i, ''));
        const cand = inline || next;
        if (looksLikeName_(cand)) return cand;
      }
    }

    const cpfIdx = linesArr.findIndex((l) => patterns.cpf.test(l));
    if (cpfIdx !== -1) {
      const around = [];
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const cand = normalizeSpaces(linesArr[cpfIdx + k] || '');
        if (looksLikeName_(cand)) around.push(cand);
      }
      if (around.length) {
        around.sort((a, b) => b.length - a.length);
        return around[0];
      }
    }

    return '';
  }

  function findFornecedor_(linesArr) {
    for (let i = 0; i < linesArr.length; i++) {
      const v = normalizeSpaces(linesArr[i]);
      if (/\bfornecedor\b/i.test(v)) {
        const inline = normalizeSpaces(v.replace(/\bfornecedor\b[:\-]?\s*/i, ''));
        const next = normalizeSpaces(linesArr[i + 1] || '');
        const cand = inline || next;
        if (cand && cand.length > 2 && !looksLikeBarcodeOrCode(cand)) return cand;
      }
    }
    return '';
  }

  function findEndereco_(linesArr) {
    const startIdx = linesArr.findIndex((l) => /\b(rua|av\.|avenida|travessa|alameda|endereço)\b/i.test(l));
    if (startIdx === -1) return '';

    const parts = [normalizeSpaces(linesArr[startIdx])];

    for (let i = 1; i <= 6; i++) {
      const nxt = normalizeSpaces(linesArr[startIdx + i] || '');
      if (!nxt) continue;

      if (/\b(benefici|cpf|documento|fornecedor|atendente|data|nota|produto|quantidade)\b/i.test(nxt) && nxt.length < 45) break;

      if (looksLikeBarcodeOrCode(nxt)) continue;

      if (hasLetters(nxt) || /[\d,\-]/.test(nxt)) {
        parts.push(nxt);
      }
    }

    const joined = parts.join(', ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/,\s*,/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return joined;
  }

  function findAtendente_(linesArr) {
    const labelIdx = linesArr.findIndex((l) => /\batendente\b/i.test(l));
    if (labelIdx !== -1) {
      const candidates = [];
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const candRaw = normalizeSpaces(linesArr[labelIdx + k] || '');
        const cand = stripAfterBarcode_(candRaw);

        if (!cand) continue;
        if (looksLikeBarcodeOrCode(candRaw)) continue;
        if (hasManyDigits(candRaw)) continue;

        const score = scoreNameCandidate_(cand);
        if (score > 0) candidates.push({ cand, score });
      }

      if (candidates.length) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].cand;
      }
    }

    const tail = linesArr.slice(Math.max(0, linesArr.length - 15));
    let best = null;
    tail.forEach((l) => {
      const cand = stripAfterBarcode_(normalizeSpaces(l));
      if (!cand) return;
      if (looksLikeBarcodeOrCode(l)) return;
      const score = scoreNameCandidate_(cand);
      if (score > 0 && (!best || score > best.score)) best = { cand, score };
    });

    return best ? best.cand : '';
  }

  function scoreNameCandidate_(s) {
    const v = normalizeSpaces(s);
    if (!looksLikeName_(v)) return 0;

    let score = 0;

    const words = v.split(' ').filter(Boolean);
    if (words.length >= 3) score += 4;
    else if (words.length === 2) score += 2;

    if (v === v.toUpperCase()) score += 2;

    if (/\b(fralda|covid|doa[cç][aã]o|genetic|genetica)\b/i.test(v)) score -= 6;
    if (/\b(avenida|rua|jardim|barueri|sp|prefeit|secret|nota)\b/i.test(v)) score -= 3;
    if (v.length < 10) score -= 2;

    return score;
  }

  function looksLikeName_(s) {
    const v = normalizeSpaces(s);
    if (!v || v.length < 4) return false;
    if (!hasLetters(v)) return false;
    if (/\d/.test(v)) return false;

    if (/\b(produto|item|descri[cç][aã]o|quantidade|qtd|qtde|fornecedor|benefici[áa]rio|cpf|documento|data|nota|entrega|via)\b/i.test(v)) return false;
    if (v.split(' ').filter(Boolean).length < 2) return false;
    if (v === v.toLowerCase()) return false;

    return true;
  }

  function stripAfterBarcode_(s) {
    return normalizeSpaces(String(s || '').replace(/\b\d{6,}\b.*$/, '')).trim();
  }

  function sanitizeProduto_(value) {
    if (!value) return '';
    const trimmed = String(value).trim();

    const withoutLabel = trimmed.replace(/^\s*(produto|item|descri[cç][aã]o)\b[:\-]?\s*/i, '').trim();

    const match = withoutLabel.match(/^(.*?)(?:\s+(\d+(?:[.,]\d{1,2})?))?$/);
    if (match) {
      const possibleQty = match[2];
      if (possibleQty && !data.quantidade) {
        if (/[.,]\d{1,2}$/.test(possibleQty) && !isBadQuantity(possibleQty)) {
          data.quantidade = normalizeQuantityInput(possibleQty);
        }
      }
      return normalizeSpaces(match[1] || '');
    }
    return normalizeSpaces(withoutLabel);
  }

  function buildObservacoes_(linesArr, d) {
    const keep = [];

    const lowerJoined = (x) => String(x || '').toLowerCase();

    const isAlreadyIn = (line) => {
      const ll = lowerJoined(line);
      return (
        (d.beneficiario && ll.includes(lowerJoined(d.beneficiario))) ||
        (d.atendente && ll.includes(lowerJoined(d.atendente))) ||
        (d.produto && ll.includes(lowerJoined(d.produto))) ||
        (d.endereco && ll.includes(lowerJoined(d.endereco))) ||
        (d.fornecedor && ll.includes(lowerJoined(d.fornecedor))) ||
        (d.cpf && ll.includes(lowerJoined(d.cpf.replace(/\D/g, '')))) ||
        (d.numeroDocumento && ll.includes(lowerJoined(d.numeroDocumento)))
      );
    };

    for (const l of linesArr) {
      const v = normalizeSpaces(l);
      if (!v || v.length < 10) continue;
      if (looksLikeBarcodeOrCode(v)) continue;
      if (/^\s*(prefeit|secret|nota|entrega|via)\b/i.test(v)) continue;

      if (!isAlreadyIn(v)) keep.push(v);
    }

    const fornecedorInfo = d.fornecedor ? `Fornecedor: ${d.fornecedor}` : '';
    const obs = keep.join('; ');

    if (fornecedorInfo && obs) return `${fornecedorInfo}; ${obs}`;
    if (fornecedorInfo) return fornecedorInfo;
    return obs;
  }

  function filterOnlyMissingForForm_(d) {
    const out = { ...d };

    if (typeof formFields === 'object' && formFields) {
      Object.keys(out).forEach((k) => {
        const field = formFields[k];
        if (!field) return;
        const current = String(field.value || '').trim();
        if (current) out[k] = '';
      });
    }

    return out;
  }

  function escapeRegExp_(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

function getMissingCriticalFields_(data, fields) {
  const missing = [];
  (fields || []).forEach((f) => {
    if (!data || !data[f] || String(data[f]).trim() === '') missing.push(f);
  });
  return missing;
}

// ================================
// Preenchimento e Preview (mantidos)
// ================================
function fillFormWithData(data) {
  Object.entries(data).forEach(([key, value]) => {
    if (value && typeof formFields === 'object' && formFields && formFields[key]) {
      formFields[key].value = value;

      formFields[key].style.borderColor = '#4caf50';
      formFields[key].style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.2)';

      setTimeout(() => {
        if (typeof formFields === 'object' && formFields && formFields[key]) {
          formFields[key].style.boxShadow = '';
        }
      }, 2000);
    }
  });
  if (typeof validateForm === 'function') validateForm();
}

function showImagePreview(dataURL) {
  if (elements?.imagePlaceholder) {
    elements.imagePlaceholder.style.display = 'none';
  }

  if (elements?.imageWrapper) {
    elements.imageWrapper.style.display = 'flex';
  }

  if (elements?.imageDraggableContainer) {
    elements.imageDraggableContainer.style.display = 'flex';
  }

  if (elements?.imagePreview) {
    elements.imagePreview.src = dataURL;
    elements.imagePreview.hidden = false;
    elements.imagePreview.removeAttribute('hidden');
    elements.imagePreview.style.display = 'block';

    if (typeof resetImageTransform === 'function') resetImageTransform();
  }

  if (elements?.btnMelhorarFoto) {
    elements.btnMelhorarFoto.style.display = 'inline-block';
  }

  if (typeof window.currentImageData !== 'undefined') {
    window.currentImageData = dataURL;
  } else {
    window.currentImageData = dataURL;
  }
}
65=
