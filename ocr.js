/* SOCIAL COLETOR - OCR (ULTRA FIXED)
 * OCR.Space + (opcional) Tesseract fallback + Pré-processamento ADAPTATIVO
 *
 * O que foi corrigido/melhorado aqui:
 * 1) Evita piorar o OCR: binarização agressiva NÃO roda por padrão.
 * 2) OCR adaptativo: tenta primeiro SEM tabela; se a qualidade do texto for ruim, faz 1 retry com configuração alternativa.
 * 3) Mantém compatibilidade: nomes públicos preservados (handleImageSelection, processOCR, extractAndFillData, etc.)
 * 4) Mantém fallback Tesseract somente quando faltar campo crítico.
 * 5) (Opcional, desligado por padrão) Estruturação por IA via Netlify Function (Gemini) sem expor chave no frontend.
 *
 * IMPORTANTE (PWA/Service Worker): após trocar este arquivo, faça Hard Reload e/ou limpe o cache do SW.
 */

// ================================
// CONFIGURAÇÃO OCR
// ================================
const OCR_API_KEY = 'K89229373088957'; // OCR.Space (ATENÇÃO: exposta no frontend)
const OCR_API_URL = 'https://api.ocr.space/parse/image';

// Pré-processamento do que é enviado ao OCR (não muda seu preview):
// - 'off'       : envia a imagem como está.
// - 'grayscale' : aplica cinza + contraste leve (recomendado).
// - 'binarize'  : aplica PB (pode ajudar em alguns casos, mas pode piorar em outros).
// - 'adaptive'  : escolhe automaticamente (padrão).
const OCR_PREPROCESS_MODE = 'adaptive'; // 'adaptive' | 'off' | 'grayscale' | 'binarize'

// Configuração base do OCR.Space
const OCR_SPACE_OPTIONS = {
  language: 'por',
  isOverlayRequired: true,
  detectOrientation: true,
  scale: true,
  // IMPORTANTE: isTable=true frequentemente piora em nota/recibo.
  // Aqui começamos com false e só tentamos true se a qualidade ficar ruim.
  isTable: false,
  OCREngine: '2'
};

// Retry: no máximo 1 tentativa extra (para não estourar cota)
const OCR_RETRY_ENABLED = true;

// Fallback Tesseract (só roda se a lib estiver carregada e ainda faltarem campos)
const TESSERACT_FALLBACK_ENABLED = true;
const TESSERACT_REQUIRED_FIELDS = ['beneficiario', 'cpf', 'numeroDocumento', 'produto', 'quantidade', 'atendente', 'endereco', 'data'];

// (Opcional) Estruturação por IA (Netlify Function) — DESLIGADO por padrão
// Ative quando você criar a função e configurar a GEMINI_API_KEY no Netlify.
const AI_STRUCTURING = {
  enabled: false,
  endpoint: '/.netlify/functions/ai-structure',
  timeoutMs: 12000
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

      // 1) preview original
      showImagePreview(originalDataURL);

      // 2) melhoria visual
      setProgress(30, 'Otimizando imagem...');
      const enhancedImage = await enhanceImageProfessionally(originalDataURL);

      // 3) preview melhorado
      showImagePreview(enhancedImage);

      // 4) OCR (o preprocess agora é interno e adaptativo)
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
// MELHORIA DE IMAGEM PROFISSIONAL (mantida)
// ================================
async function enhanceImageProfessionally(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const maxWidth = 1200;
        const maxHeight = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

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

        const rRange = rMax - rMin || 1;
        const gRange = gMax - gMin || 1;
        const bRange = bMax - bMin || 1;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = ((data[i] - rMin) * 255) / rRange;
          data[i + 1] = ((data[i + 1] - gMin) * 255) / gRange;
          data[i + 2] = ((data[i + 2] - bMin) * 255) / bRange;

          data[i] = Math.min(255, data[i] * 1.08);
          data[i + 1] = Math.min(255, data[i + 1] * 1.08);
          data[i + 2] = Math.min(255, data[i + 2] * 1.08);

          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg + (data[i] - avg) * 1.12;
          data[i + 1] = avg + (data[i + 1] - avg) * 1.12;
          data[i + 2] = avg + (data[i + 2] - avg) * 1.12;
        }

        ctx.putImageData(imageData, 0, 0);

        // filtro leve (evita exagerar)
        ctx.filter = 'contrast(1.06) saturate(1.03)';
        ctx.drawImage(canvas, 0, 0);

        const enhancedDataURL = canvas.toDataURL('image/jpeg', 0.94);
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
// PRÉ-PROCESSAMENTO PARA OCR (ADAPTATIVO)
// - NÃO altera o preview; só a imagem enviada ao OCR
// ================================
async function makeImageForOCR(dataURL, mode) {
  const chosen = mode || OCR_PREPROCESS_MODE;
  if (chosen === 'off') return { dataURL, used: 'off' };

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Mantém dimensões (já foi redimensionado no enhance)
        canvas.width = img.width;
        canvas.height = img.height;

        // Primeiro desenha a imagem
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;

        // Calcula estatísticas simples para decidir binarização
        let sum = 0;
        let sumSq = 0;
        const n = d.length / 4;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const y = 0.299 * r + 0.587 * g + 0.114 * b;
          sum += y;
          sumSq += y * y;
        }

        const mean = sum / n;
        const variance = Math.max(0, sumSq / n - mean * mean);
        const std = Math.sqrt(variance);

        // Decide modo real
        let realMode = chosen;
        if (chosen === 'adaptive') {
          // Se contraste muito baixo, cinza + contraste ajuda.
          // Se fundo muito escuro e contraste baixo, binarize pode ajudar.
          if (std < 28 && mean < 140) realMode = 'binarize';
          else realMode = 'grayscale';
        }

        if (realMode === 'grayscale') {
          // Cinza + contraste leve (preserva detalhes)
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            let y = 0.299 * r + 0.587 * g + 0.114 * b;
            // contraste leve ao redor de 128
            y = (y - 128) * 1.18 + 128;
            // brilho mínimo
            y = y * 1.03;
            y = Math.max(0, Math.min(255, y));
            d[i] = d[i + 1] = d[i + 2] = y;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve({ dataURL: canvas.toDataURL('image/jpeg', 0.93), used: realMode });
          return;
        }

        if (realMode === 'binarize') {
          // Binarização menos agressiva (evita destruir caracteres finos)
          const threshold = Math.max(105, Math.min(185, mean * 0.98));
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const y = 0.299 * r + 0.587 * g + 0.114 * b;
            const v = y < threshold ? 0 : 255;
            d[i] = d[i + 1] = d[i + 2] = v;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve({ dataURL: canvas.toDataURL('image/jpeg', 0.92), used: realMode });
          return;
        }

        // fallback
        resolve({ dataURL, used: 'off' });
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = reject;
    img.src = dataURL;
  });
}

// ================================
// OCR COM OCR.SPACE (ADAPTATIVO)
// ================================
async function processOCR(imageDataURL) {
  try {
    // Tentativa 1: imagem como está + isTable=false
    const attempt1 = await callOcrSpace_(imageDataURL, {
      isTable: false,
      preprocess: 'off'
    });

    let best = attempt1;

    // Se qualidade ruim, tenta 1 fallback (preprocess/adaptação e/ou isTable=true)
    if (OCR_RETRY_ENABLED && isPoorOcrText_(attempt1.text) && OCR_SPACE_OPTIONS.isOverlayRequired) {
      setProgress(78, 'Refinando OCR...');

      // Preprocess adaptativo (geralmente melhora sem destruir caracteres)
      const pre = await makeImageForOCR(imageDataURL, OCR_PREPROCESS_MODE);

      // Se preprocess acabou escolhendo OFF (por exemplo), ainda tentamos isTable=true com imagem original
      const candidateDataURL = pre?.dataURL || imageDataURL;

      const attempt2 = await callOcrSpace_(candidateDataURL, {
        isTable: true,
        preprocess: pre?.used || OCR_PREPROCESS_MODE
      });

      best = pickBestOcrAttempt_(attempt1, attempt2);
    }

    console.log('📝 OCR escolhido:', { quality: best.quality, isTable: best.isTable, preprocess: best.preprocess });
    console.log('📝 Texto extraído (OCR.Space):', best.text);

    // 1) (Opcional) IA para estruturar
    let structured = null;
    if (AI_STRUCTURING.enabled) {
      try {
        setProgress(82, 'Organizando com IA...');
        structured = await structureWithAI_(best.text);
      } catch (e) {
        console.warn('⚠️ IA indisponível (seguindo sem IA):', e);
      }
    }

    // 2) Parser local (robusto) — sempre roda; se IA retornou algo, usamos como base
    let filled = null;
    if (structured && typeof structured === 'object') {
      fillFormWithData(structured);
      // Completa faltantes usando o parser local
      filled = extractAndFillData(best.text, best.overlayLines, { onlyFillMissing: true });
    } else {
      filled = extractAndFillData(best.text, best.overlayLines);
    }

    // 3) Fallback Tesseract (só se faltarem campos críticos)
    if (TESSERACT_FALLBACK_ENABLED && ('Tesseract' in window) && window.Tesseract) {
      const missing = getMissingCriticalFields_(filled, TESSERACT_REQUIRED_FIELDS);
      if (missing.length > 0) {
        console.log('🔁 Rodando Tesseract fallback (faltando):', missing);
        setProgress(90, 'Refinando com Tesseract...');
        try {
          const { data } = await window.Tesseract.recognize(imageDataURL, 'por', { logger: () => {} });
          const tessText = data?.text || '';
          if (tessText.trim()) {
            console.log('🧠 Texto extraído (Tesseract):', tessText);
            extractAndFillData(best.text + '\n' + tessText, best.overlayLines, { onlyFillMissing: true });
          }
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

async function callOcrSpace_(imageDataURL, opts) {
  const isTable = !!opts?.isTable;
  const preprocess = String(opts?.preprocess || 'off');

  const blob = await dataURLtoBlob(imageDataURL);
  const formData = new FormData();
  formData.append('file', blob, 'document.jpg');
  formData.append('apikey', OCR_API_KEY);
  formData.append('language', OCR_SPACE_OPTIONS.language);
  formData.append('isOverlayRequired', OCR_SPACE_OPTIONS.isOverlayRequired ? 'true' : 'false');
  formData.append('detectOrientation', OCR_SPACE_OPTIONS.detectOrientation ? 'true' : 'false');
  formData.append('scale', OCR_SPACE_OPTIONS.scale ? 'true' : 'false');
  formData.append('isTable', isTable ? 'true' : 'false');
  formData.append('OCREngine', OCR_SPACE_OPTIONS.OCREngine);

  setProgress(70, 'Enviando para OCR...');

  const response = await fetch(OCR_API_URL, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Erro OCR: ${response.status}`);

  const result = await response.json();
  if (result.IsErroredOnProcessing) throw new Error(result.ErrorMessage || 'Erro no OCR');

  let extractedText = '';
  let overlayLines = null;

  if (result.ParsedResults && result.ParsedResults.length > 0) {
    const pr = result.ParsedResults[0];
    extractedText = pr.ParsedText || pr.Parsedtext || '';
    overlayLines = pr?.TextOverlay?.Lines || null;
  }

  const quality = scoreOcrText_(extractedText);

  return {
    text: extractedText || '',
    overlayLines,
    quality,
    isTable,
    preprocess
  };
}

function pickBestOcrAttempt_(a, b) {
  if (!a) return b;
  if (!b) return a;
  return b.quality > a.quality ? b : a;
}

function scoreOcrText_(text) {
  const t = String(text || '');
  const letters = (t.match(/[A-ZÁ-Úa-zá-ú]/g) || []).length;
  const digits = (t.match(/[0-9]/g) || []).length;
  const bad = (t.match(/[�]/g) || []).length;
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0).length;

  // Heurística simples: mais letras e linhas -> melhor; muitos caracteres inválidos -> pior
  return letters * 1.0 + Math.min(digits, 60) * 0.15 + lines * 1.2 - bad * 5;
}

function isPoorOcrText_(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  const letters = (t.match(/[A-ZÁ-Úa-zá-ú]/g) || []).length;
  const bad = (t.match(/[�]/g) || []).length;
  // Poucas letras ou muitos caracteres quebrados
  if (letters < 60) return true;
  if (bad >= 5) return true;
  return false;
}

async function structureWithAI_(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_STRUCTURING.timeoutMs);

  try {
    const response = await fetch(AI_STRUCTURING.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Erro IA: ${response.status}`);
    const payload = await response.json();

    if (!payload || payload.success !== true || !payload.data) {
      throw new Error(payload?.error || 'Resposta inválida da IA');
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

// ================================
// EXTRAÇÃO DE DADOS (ROBUSTA) - baseada no seu OCR improved
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
    data: /\b(0[1-9]|[12][0-9]|3[01])[\/-](0[1-9]|1[0-2])[\/-]\d{4}\b/,
    assinatura: /(assinado|assinatura|_+|\sX\s)/i
  };

  // Linhas (preferir overlay se disponível)
  const lines = buildLinesFromSources_(cleanOCRText(text), overlayLines);

  // Debug
  console.log('📌 Linhas normalizadas:', lines);

  // Passo 1: extrações diretas
  const cpfMatch = String(text || '').match(patterns.cpf);
  if (cpfMatch) data.cpf = formatCPF(cpfMatch[0]);

  const docMatch = String(text || '').match(patterns.numeroDocumento);
  if (docMatch) data.numeroDocumento = docMatch[0];

  const dateMatch = String(text || '').match(patterns.data);
  if (dateMatch) data.data = formatDate(dateMatch[0]);

  if (patterns.assinatura.test(String(text || ''))) data.assinatura = 'OK';

  // Passo 2: regras fortes por linha
  if (!data.produto || !data.quantidade) {
    const pq = findProdutoQuantidadeLine_(lines);
    if (pq) {
      data.produto = data.produto || pq.produto;
      data.quantidade = data.quantidade || pq.quantidade;
    }
  }

  if (!data.produto) {
    const p = findProduto_(lines);
    if (p) data.produto = p;
  }

  if (!data.quantidade) {
    const q = findQuantidade_(lines);
    if (q) data.quantidade = q;
  }

  if (!data.beneficiario) {
    const b = findBeneficiario_(lines);
    if (b) data.beneficiario = b;
  }

  if (!data.fornecedor) {
    const f = findFornecedor_(lines);
    if (f) data.fornecedor = f;
  }

  if (!data.endereco) {
    const e = findEndereco_(lines);
    if (e) data.endereco = e;
  }

  if (!data.atendente) {
    const a = findAtendente_(lines);
    if (a) data.atendente = a;
  }

  // Passo 3: observações
  const obs = buildObservacoes_(lines, data);
  if (obs) data.observacoes = obs;

  // Passo 4: preencher
  const finalData = onlyFillMissing ? filterOnlyMissingForForm_(data) : data;
  console.log('✅ Dados extraídos (final):', finalData);

  fillFormWithData(finalData);
  return data;

  // =========================
  // Funções internas (scoped)
  // =========================
  function buildLinesFromSources_(rawText, overlay) {
    const out = [];

    if (Array.isArray(overlay) && overlay.length > 0) {
      overlay.forEach((l) => {
        const t = normalizeSpaces(l?.LineText || '');
        if (t && t.length > 1) out.push(t);
      });
    }

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

  function findProduto_(linesArr) {
    for (let i = 0; i < linesArr.length; i++) {
      const v = normalizeSpaces(linesArr[i]);
      if (!/\bproduto\b/i.test(v)) continue;
      if (/\bpara\s+retirar\b/i.test(v)) continue;

      const inline = normalizeSpaces(v.replace(/\bproduto\b[:\-]?\s*/i, ''));
      const next = normalizeSpaces(linesArr[i + 1] || '');
      const candidate = inline || next;
      const cleaned = sanitizeProduto_(candidate);
      if (cleaned && cleaned.length >= 3 && hasLetters(cleaned) && !looksLikeBarcodeOrCode(cleaned)) {
        return cleaned;
      }
    }
    return '';
  }

  function findQuantidade_(linesArr) {
    const qtyRegex = /\b\d{1,3}[.,]\d{2,3}\b/;

    for (const line of linesArr) {
      const v = normalizeSpaces(line);
      if (!v) continue;
      if (/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(v)) continue;
      if (/\bcpf\b|\bdocumento\b|\bnota\b|\bprefeit\b|\bsecret\b/i.test(v)) continue;
      if (looksLikeBarcodeOrCode(v)) continue;

      const match = v.match(qtyRegex);
      if (match && !isBadQuantity(match[0])) {
        return normalizeQuantityInput(match[0]);
      }
    }
    return '';
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

      if (hasLetters(nxt) || /[\d,\-]/.test(nxt)) parts.push(nxt);
    }

    return parts
      .join(', ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/,\s*,/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
  if (elements?.imagePlaceholder) elements.imagePlaceholder.style.display = 'none';
  if (elements?.imageWrapper) elements.imageWrapper.style.display = 'flex';
  if (elements?.imageDraggableContainer) elements.imageDraggableContainer.style.display = 'flex';

  if (elements?.imagePreview) {
    elements.imagePreview.src = dataURL;
    elements.imagePreview.hidden = false;
    elements.imagePreview.removeAttribute('hidden');
    elements.imagePreview.style.display = 'block';

    if (typeof resetImageTransform === 'function') resetImageTransform();
  }

  if (elements?.btnMelhorarFoto) elements.btnMelhorarFoto.style.display = 'inline-block';

  window.currentImageData = dataURL;
}

// ================================
// Exposição pública (mantém compatibilidade)
// ================================
window.handleImageSelection = handleImageSelection;
window.extractAndFillData = extractAndFillData;
window.processOCR = processOCR;
window.enhanceAndUpdateImage = enhanceAndUpdateImage;
window.enhanceImageProfessionally = enhanceImageProfessionally;
