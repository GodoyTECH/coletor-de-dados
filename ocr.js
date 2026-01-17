/* SOCIAL COLETOR - OCR (MERGED CLEAN)
 * OCR.Space + Preprocess (binarize) + (Opcional) Gemini structuring + (Opcional) Tesseract fallback
 * - Sem conflitos, sem marcadores de merge, sem colisão de const com outros arquivos (IIFE)
 * - Mantém APIs públicas: handleImageSelection, processOCR, extractAndFillData, etc.
 */

(() => {
  'use strict';

  // ================================
  // CONFIGURAÇÃO OCR (mantém compat)
  // ================================
  const OCR_API_KEY = 'K89229373088957'; // ATENÇÃO: exposto no frontend (mantido para não quebrar)
  const OCR_API_URL = 'https://api.ocr.space/parse/image';

  // Feature flags (você liga/desliga)
  const ENABLE_AI_STRUCTURING = false; // true => chama Netlify Function do Gemini p/ organizar JSON
  const AI_STRUCTURE_ENDPOINT = '/.netlify/functions/ai-structure';

  const ENABLE_TESSERACT_FALLBACK = true; // true => se Tesseract existir, completa campos faltantes

  // Ajustes OCR.Space
  const OCR_CONFIG = {
    language: 'por',
    detectOrientation: true,
    scale: true,
    isTable: true,              // pode ajudar ou piorar, mas mantém seu padrão
    isOverlayRequired: true,    // melhora MUITO a extração por linhas
    OCREngine: '2'
  };

  // Campos críticos p/ decidir fallback
  const CRITICAL_FIELDS = ['beneficiario', 'cpf', 'numeroDocumento', 'produto', 'quantidade', 'atendente', 'endereco', 'data'];

  // ================================
  // HELPERS: chamadas seguras (não quebram se algo não existir)
  // ================================
  function safeCall(fnName, ...args) {
    try {
      if (typeof window[fnName] === 'function') return window[fnName](...args);
    } catch (e) {
      console.warn(`safeCall falhou em ${fnName}:`, e);
    }
    return undefined;
  }

  function safeProgress(percent, label) {
    if (typeof window.setProgress === 'function') {
      try { window.setProgress(percent, label); } catch (_) {}
    }
  }

  function safeShowStatus(msg, type) {
    if (typeof window.showStatusMessage === 'function') {
      try { window.showStatusMessage(msg, type); } catch (_) {}
    }
  }

  function safeShowProgressBar() {
    if (typeof window.showProgressBar === 'function') {
      try { window.showProgressBar(); } catch (_) {}
    }
  }

  function safeHideProgressBar() {
    if (typeof window.hideProgressBar === 'function') {
      try { window.hideProgressBar(); } catch (_) {}
    }
  }

  // ================================
  // MANUSEIO DE IMAGEM
  // ================================
  async function handleImageSelection(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;

    if (!file.type || !file.type.startsWith('image')) {
      safeShowStatus('Selecione apenas imagens (JPG/PNG).', 'error');
      return;
    }

    safeShowStatus('Carregando e melhorando imagem...', 'info');
    safeShowProgressBar();
    safeProgress(10, 'Carregando...');

    try {
      const reader = new FileReader();

      reader.onload = async (e) => {
        const originalDataURL = e && e.target ? e.target.result : '';
        if (!originalDataURL) {
          safeHideProgressBar();
          safeShowStatus('Erro ao ler a imagem.', 'error');
          return;
        }

        // 1) Preview original
        showImagePreview(originalDataURL);

        // 2) Melhorar (preview para o usuário)
        safeProgress(30, 'Otimizando imagem...');
        const enhancedImage = await enhanceImageProfessionally(originalDataURL);

        // 3) Preview melhorada
        showImagePreview(enhancedImage);

        // 4) OCR (usa versão "preprocessada" internamente)
        safeProgress(60, 'Analisando texto...');
        await processOCR(enhancedImage);

        safeProgress(100, 'Concluído!');
        safeHideProgressBar();
        safeShowStatus('Imagem processada com sucesso!', 'success');
      };

      reader.onerror = () => {
        safeHideProgressBar();
        safeShowStatus('Erro ao ler a imagem.', 'error');
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      safeHideProgressBar();
      safeShowStatus('Erro ao processar imagem: ' + (error && error.message ? error.message : String(error)), 'error');
    }
  }

  async function enhanceAndUpdateImage(dataURL) {
    try {
      const enhancedImage = await enhanceImageProfessionally(dataURL);
      showImagePreview(enhancedImage);
      safeShowStatus('Imagem otimizada com sucesso!', 'success');
    } catch (error) {
      safeShowStatus('Não foi possível melhorar a imagem.', 'error');
    }
  }

  // ================================
  // MELHORIA DE IMAGEM (preview do usuário)
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

          canvas.width = Math.round(width);
          canvas.height = Math.round(height);

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          let rMin = 255, rMax = 0;
          let gMin = 255, gMax = 0;
          let bMin = 255, bMax = 0;

          for (let i = 0; i < data.length; i += 4) {
            rMin = Math.min(rMin, data[i]);     rMax = Math.max(rMax, data[i]);
            gMin = Math.min(gMin, data[i + 1]); gMax = Math.max(gMax, data[i + 1]);
            bMin = Math.min(bMin, data[i + 2]); bMax = Math.max(bMax, data[i + 2]);
          }

          const rRange = (rMax - rMin) || 1;
          const gRange = (gMax - gMin) || 1;
          const bRange = (bMax - bMin) || 1;

          for (let i = 0; i < data.length; i += 4) {
            data[i]     = ((data[i]     - rMin) * 255) / rRange;
            data[i + 1] = ((data[i + 1] - gMin) * 255) / gRange;
            data[i + 2] = ((data[i + 2] - bMin) * 255) / bRange;

            data[i]     = Math.min(255, data[i]     * 1.1);
            data[i + 1] = Math.min(255, data[i + 1] * 1.1);
            data[i + 2] = Math.min(255, data[i + 2] * 1.1);

            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i]     = avg + (data[i]     - avg) * 1.15;
            data[i + 1] = avg + (data[i + 1] - avg) * 1.15;
            data[i + 2] = avg + (data[i + 2] - avg) * 1.15;
          }

          ctx.putImageData(imageData, 0, 0);

          ctx.filter = 'contrast(1.1) saturate(1.05)';
          ctx.drawImage(canvas, 0, 0);

          resolve(canvas.toDataURL('image/jpeg', 0.95));
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = reject;
      img.src = dataURL;
    });
  }

  // ================================
  // PRÉ-PROCESSAMENTO PARA OCR (não altera preview)
  // Binariza para reduzir ruído do OCR.Space
  // ================================
  async function preprocessForOCR(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          const maxWidth = 1400;
          const maxHeight = 1800;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = Math.round(width);
          canvas.height = Math.round(height);

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Grayscale + contraste + threshold fixo (robusto)
          // (Se quiser Otsu depois, dá para evoluir, mas isso já ajuda bastante)
          const threshold = 165;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // contraste
            const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));

            // binariza
            const bin = contrasted > threshold ? 255 : 0;
            data[i] = bin;
            data[i + 1] = bin;
            data[i + 2] = bin;
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = reject;
      img.src = dataURL;
    });
  }

  // ================================
  // OCR COM OCR.SPACE + (Opcional) IA + (Opcional) Tesseract
  // ================================
  async function structureWithAI(text) {
    if (!ENABLE_AI_STRUCTURING) return null;

    const res = await fetch(AI_STRUCTURE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) throw new Error(`Erro IA: ${res.status}`);

    const payload = await res.json();
    if (!payload || !payload.success || !payload.data) {
      throw new Error((payload && payload.error) ? payload.error : 'Resposta inválida da IA');
    }
    return payload.data;
  }

  function getMissingCriticalFieldsFromForm() {
    const missing = [];
    try {
      if (typeof formFields !== 'object' || !formFields) return CRITICAL_FIELDS.slice();
      for (const k of CRITICAL_FIELDS) {
        const f = formFields[k];
        const v = f && typeof f.value === 'string' ? f.value.trim() : '';
        if (!v) missing.push(k);
      }
    } catch (_) {
      return CRITICAL_FIELDS.slice();
    }
    return missing;
  }

  async function runTesseractFallback(imageDataURL) {
    if (!ENABLE_TESSERACT_FALLBACK) return false;
    if (!('Tesseract' in window) || !window.Tesseract) return false;

    const missing = getMissingCriticalFieldsFromForm();
    if (missing.length === 0) return false;

    try {
      console.log('🔁 Tesseract fallback: faltando', missing);
      safeProgress(85, 'Refinando com Tesseract...');

      const result = await window.Tesseract.recognize(imageDataURL, 'por', { logger: () => {} });
      const tText = result && result.data && result.data.text ? result.data.text : '';

      if (tText && tText.trim()) {
        extractAndFillData(tText, { onlyEmpty: true });
        return true;
      }
    } catch (e) {
      console.warn('Tesseract fallback falhou:', e);
    }
    return false;
  }

  async function processOCR(imageDataURL) {
    try {
      // 1) Pré-processamento para OCR.Space (não mexe no preview)
      const ocrInputDataURL = await preprocessForOCR(imageDataURL);

      // 2) Envia para OCR.Space
      const blob = await dataURLtoBlob(ocrInputDataURL);
      const formData = new FormData();
      formData.append('file', blob, 'document.jpg');
      formData.append('apikey', OCR_API_KEY);
      formData.append('language', OCR_CONFIG.language);
      formData.append('isOverlayRequired', OCR_CONFIG.isOverlayRequired ? 'true' : 'false');
      formData.append('detectOrientation', OCR_CONFIG.detectOrientation ? 'true' : 'false');
      formData.append('scale', OCR_CONFIG.scale ? 'true' : 'false');
      formData.append('isTable', OCR_CONFIG.isTable ? 'true' : 'false');
      formData.append('OCREngine', OCR_CONFIG.OCREngine);

      safeProgress(70, 'Enviando para OCR...');

      const response = await fetch(OCR_API_URL, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Erro OCR: ${response.status}`);

      const result = await response.json();
      if (result && result.IsErroredOnProcessing) {
        throw new Error(result.ErrorMessage || 'Erro no OCR');
      }

      let extractedText = '';
      let overlayLines = null;

      if (result && result.ParsedResults && result.ParsedResults.length > 0) {
        const pr = result.ParsedResults[0];
        extractedText = pr && pr.ParsedText ? pr.ParsedText : '';
        overlayLines = pr && pr.TextOverlay && pr.TextOverlay.Lines ? pr.TextOverlay.Lines : null;
      }

      console.log('📝 Texto extraído (OCR.Space):', extractedText);

      // 3) IA (Gemini) opcional, com fallback seguro
      let structuredData = null;
      if (ENABLE_AI_STRUCTURING) {
        try {
          structuredData = await structureWithAI(extractedText);
        } catch (e) {
          console.warn('⚠️ IA indisponível. Fallback parser:', e);
          structuredData = null;
        }
      }

      if (structuredData && typeof structuredData === 'object') {
        fillFormWithData(structuredData);
      } else {
        // parser robusto (overlay ajuda)
        extractAndFillData(extractedText, overlayLines);
      }

      // 4) Tesseract fallback (se existir) para completar faltantes
      await runTesseractFallback(ocrInputDataURL);
    } catch (error) {
      console.error('❌ Erro OCR:', error);
      safeShowStatus('Erro ao processar OCR: ' + (error && error.message ? error.message : String(error)), 'error');
      throw error;
    }
  }

  function dataURLtoBlob(dataURL) {
    const arr = String(dataURL || '').split(',');
    const mime = arr[0] && arr[0].match(/:(.*?);/) ? arr[0].match(/:(.*?);/)[1] : 'image/jpeg';
    const bstr = atob(arr[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  // ================================
  // EXTRAÇÃO DE DADOS (parser robusto)
  // Compat: aceita (text, overlayLines, options) OU (text, options)
  // ================================
  function extractAndFillData(text, overlayLinesOrOptions, maybeOptions) {
    let overlayLines = null;
    let options = {};

    if (Array.isArray(overlayLinesOrOptions) || overlayLinesOrOptions === null) {
      overlayLines = overlayLinesOrOptions;
      options = maybeOptions || {};
    } else if (overlayLinesOrOptions && typeof overlayLinesOrOptions === 'object') {
      options = overlayLinesOrOptions;
      overlayLines = null;
    }

    const onlyEmpty = !!options.onlyEmpty;
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
      if (n > 1000) return true;
      if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true;
      return false;
    };

    const patterns = {
      cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/,
      numeroDocumento: /\b\d{6,7}\/\d{4}\b/,
      data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/,
      assinatura: /(assinado|assinatura|_+|\sX\s)/i,
      quantidadeRotulo: /\b(?:quantidade|qtd|qtde)\b[^\d]*(\d+(?:[.,]\d{1,2})?)/i
    };

    // Monta linhas (overlay > split)
    const lines = buildLinesFromSources_(cleanOCRText(text), overlayLines);
    console.log('📌 Linhas normalizadas:', lines);

    // Regex no texto completo
    const cpfMatch = String(text || '').match(patterns.cpf);
    if (cpfMatch && typeof window.formatCPF === 'function') data.cpf = window.formatCPF(cpfMatch[0]);
    else if (cpfMatch) data.cpf = cpfMatch[0];

    const docMatch = String(text || '').match(patterns.numeroDocumento);
    if (docMatch) data.numeroDocumento = docMatch[0];

    const dateMatch = String(text || '').match(patterns.data);
    if (dateMatch && typeof window.formatDate === 'function') data.data = window.formatDate(dateMatch[0]);
    else if (dateMatch) data.data = dateMatch[0];

    if (patterns.assinatura.test(String(text || ''))) data.assinatura = 'OK';

    // Quantidade prioriza rótulo
    const qtdMatch = String(text || '').match(patterns.quantidadeRotulo);
    if (qtdMatch && typeof window.normalizeQuantityInput === 'function') data.quantidade = window.normalizeQuantityInput(qtdMatch[1]);
    else if (qtdMatch) data.quantidade = qtdMatch[1];

    // Regras fortes (produto + qtd mesma linha)
    if (!data.produto || !data.quantidade) {
      const pq = findProdutoQuantidadeLine_(lines);
      if (pq) {
        if (!data.produto) data.produto = pq.produto;
        if (!data.quantidade) data.quantidade = pq.quantidade;
      }
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

    // Observações
    data.observacoes = buildObservacoes_(lines, data) || '';

    // Preenche
    if (onlyEmpty) {
      fillFormWithDataMissing(data);
    } else if (onlyFillMissing) {
      // modo compatível: só completa vazios
      fillFormWithDataMissing(data);
    } else {
      fillFormWithData(data);
    }

    return data;

    function buildLinesFromSources_(rawText, overlay) {
      const out = [];
      if (Array.isArray(overlay) && overlay.length > 0) {
        for (const l of overlay) {
          const t = normalizeSpaces(l && l.LineText ? l.LineText : '');
          if (t && t.length > 1) out.push(t);
        }
      }
      if (out.length === 0) {
        rawText
          .split('\n')
          .map((l) => normalizeSpaces(l))
          .filter((l) => l.length > 1)
          .forEach((l) => out.push(l));
      }
      return out.map((l) => l.replace(/[^\S\r\n]+/g, ' ').trim()).filter((l) => l.length > 1);
    }

    function stripAfterBarcode_(s) {
      return normalizeSpaces(String(s || '').replace(/\b\d{6,}\b.*$/, '')).trim();
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

    function scoreNameCandidate_(v) {
      const s = normalizeSpaces(v);
      if (!looksLikeName_(s)) return 0;

      let score = 0;
      const words = s.split(' ').filter(Boolean);
      if (words.length >= 3) score += 4;
      else if (words.length === 2) score += 2;

      if (s === s.toUpperCase()) score += 2;

      if (/\b(fralda|covid|doa[cç][aã]o|genetic|genetica)\b/i.test(s)) score -= 6;
      if (/\b(avenida|rua|jardim|barueri|sp|prefeit|secret|nota)\b/i.test(s)) score -= 3;
      if (s.length < 10) score -= 2;

      return score;
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
            return { produto: sanitizeProduto_(produto), quantidade: normalizeQtd_(qtd) };
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

              if (!best || score > best.score) best = { produto: sanitizeProduto_(produto), quantidade: normalizeQtd_(qtd), score };
            }
          }
        }
      }

      return best ? { produto: best.produto, quantidade: best.quantidade } : null;
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
            data.quantidade = normalizeQtd_(possibleQty);
          }
        }
        return normalizeSpaces(match[1] || '');
      }
      return normalizeSpaces(withoutLabel);
    }

    function normalizeQtd_(q) {
      if (typeof window.normalizeQuantityInput === 'function') return window.normalizeQuantityInput(q);
      return String(q || '').trim();
    }

    function escapeRegExp_(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      for (const l of tail) {
        const cand = stripAfterBarcode_(normalizeSpaces(l));
        if (!cand) continue;
        if (looksLikeBarcodeOrCode(l)) continue;
        const score = scoreNameCandidate_(cand);
        if (score > 0 && (!best || score > best.score)) best = { cand, score };
      }
      return best ? best.cand : '';
    }

    function buildObservacoes_(linesArr, d) {
      const keep = [];
      const lower = (x) => String(x || '').toLowerCase();

      const isAlreadyIn = (line) => {
        const ll = lower(line);
        return (
          (d.beneficiario && ll.includes(lower(d.beneficiario))) ||
          (d.atendente && ll.includes(lower(d.atendente))) ||
          (d.produto && ll.includes(lower(d.produto))) ||
          (d.endereco && ll.includes(lower(d.endereco))) ||
          (d.fornecedor && ll.includes(lower(d.fornecedor))) ||
          (d.cpf && ll.includes(lower(String(d.cpf).replace(/\D/g, '')))) ||
          (d.numeroDocumento && ll.includes(lower(d.numeroDocumento)))
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
  }

  // ================================
  // Preenchimento (mantidos / seguros)
  // ================================
  function fillFormWithData(data) {
    try {
      Object.entries(data || {}).forEach(([key, value]) => {
        if (!value) return;
        if (typeof formFields !== 'object' || !formFields || !formFields[key]) return;

        formFields[key].value = value;
        if (formFields[key].style) {
          formFields[key].style.borderColor = '#4caf50';
          formFields[key].style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.2)';
          setTimeout(() => {
            try { formFields[key].style.boxShadow = ''; } catch (_) {}
          }, 2000);
        }
      });
      if (typeof validateForm === 'function') validateForm();
    } catch (e) {
      console.warn('fillFormWithData falhou:', e);
    }
  }

  function fillFormWithDataMissing(data) {
    try {
      Object.entries(data || {}).forEach(([key, value]) => {
        if (!value) return;
        if (typeof formFields !== 'object' || !formFields || !formFields[key]) return;

        const current = String(formFields[key].value || '').trim();
        if (current) return;

        formFields[key].value = value;
        if (formFields[key].style) {
          formFields[key].style.borderColor = '#4caf50';
          formFields[key].style.boxShadow = '0 0 0 2px rgba(76, 175, 80, 0.2)';
          setTimeout(() => {
            try { formFields[key].style.boxShadow = ''; } catch (_) {}
          }, 2000);
        }
      });
      if (typeof validateForm === 'function') validateForm();
    } catch (e) {
      console.warn('fillFormWithDataMissing falhou:', e);
    }
  }

  // ================================
  // Preview (sem optional chaining em atribuição)
  // ================================
  function showImagePreview(dataURL) {
    try {
      if (typeof elements !== 'undefined' && elements) {
        if (elements.imagePlaceholder) elements.imagePlaceholder.style.display = 'none';
        if (elements.imageWrapper) elements.imageWrapper.style.display = 'flex';
        if (elements.imageDraggableContainer) elements.imageDraggableContainer.style.display = 'flex';

        if (elements.imagePreview) {
          elements.imagePreview.src = dataURL;
          elements.imagePreview.hidden = false;
          elements.imagePreview.removeAttribute('hidden');
          elements.imagePreview.style.display = 'block';
          if (typeof resetImageTransform === 'function') resetImageTransform();
        }

        if (elements.btnMelhorarFoto) elements.btnMelhorarFoto.style.display = 'inline-block';
      }

      window.currentImageData = dataURL;
    } catch (e) {
      console.warn('showImagePreview falhou:', e);
    }
  }

  // ================================
  // EXPORTS GLOBAIS (para seu sistema chamar)
  // ================================
  window.handleImageSelection = handleImageSelection;
  window.processOCR = processOCR;
  window.extractAndFillData = extractAndFillData;
  window.enhanceAndUpdateImage = enhanceAndUpdateImage;
  window.enhanceImageProfessionally = enhanceImageProfessionally;
  window.showImagePreview = showImagePreview;
  window.fillFormWithData = fillFormWithData;
  window.fillFormWithDataMissing = fillFormWithDataMissing;
})();
