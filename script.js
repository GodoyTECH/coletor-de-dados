/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL (com melhoria automática + UX de progresso)
 * Integrado com OpenAI Vision via endpoint seguro (Render).
 *
 * Observações:
 * - Não há chave da OpenAI no frontend.
 * - Endpoint: https://coletor-de-dados.onrender.com/api/ocr
 * - O script cria o campo "obs" automaticamente se não existir no HTML.
 */

// ================================
// CONFIGURAÇÃO ENDPOINT (RENDER) - CORRIGIDO
// ================================
const OCR_ENDPOINT = "https://coletor-de-dados.onrender.com/api/ocr";


// ================================
// VARIÁVEIS GLOBAIS
// ================================
let elements = {};
let formFields = {};

let currentImageData = null;
let isProcessing = false;

// Regex base usados nas extrações
const regexPatterns = {
  cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g,
  numeroDocumento: /\b\d{6,7}\/\d{4}\b/g,
  data: /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-]\d{4}\b/g,
  quantidadeWithUnit: /\b\d+(?:[.,]\d+)?\s*(?:un(?:idade)?s?|kg|g|ml|l|cx|cxas|cxas\.)\b/ig,
  quantidadeOnly: /\b\d+(?:[.,]\d+)?\b/g,
  assinatura: /([-_~]{3,}|[xX]{3,}|assinado|assinatura)/i
};

// ================================
// INICIALIZAÇÃO
// ================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOM carregado, inicializando app...');
  setupElements();
  console.table(Object.keys(elements));
  console.table(Object.keys(formFields));
  initializeApp();
});

// ================================
// BUSCA ELEMENTOS DO DOM (e cria obs se necessário)
// ================================
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
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    enhanceBtn: document.getElementById('btnMelhorarFoto'),
    // optional canvas preview
    enhancedPreviewCanvas: document.getElementById('enhanced-preview')
  };

  // Ensure OBS textarea exists; if not, create and append to the form
  let obsEl = document.getElementById('obs');
  if (!obsEl) {
    try {
      const obsGroup = document.createElement('div');
      obsGroup.className = 'form-group full-width';
      obsGroup.style.marginTop = '12px';
      obsGroup.innerHTML = `
        <label for="obs">Observações (anotações manuais)</label>
        <textarea id="obs" name="obs" placeholder="Observações detectadas (manuscritos, post-its, anotações)" rows="3"></textarea>
      `;
      // Append before form actions if possible
      const form = document.getElementById('dataForm');
      if (form) {
        const actions = form.querySelector('.form-actions');
        if (actions) form.insertBefore(obsGroup, actions);
        else form.appendChild(obsGroup);
      }
      obsEl = document.getElementById('obs');
    } catch (e) {
      console.warn('Não foi possível criar campo OBS automaticamente:', e);
    }
  }

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
    obs: obsEl || null
  };
}

// ================================
// INICIALIZA O APP
// ================================
function initializeApp() {
  setupEventListeners();
  setupDefaultDate();
  validateForm();
  console.log('✅ Aplicativo pronto!');
}

// ================================
// EVENT LISTENERS
// ================================
function setupEventListeners() {
  if (elements.captureBtn) {
    elements.captureBtn.addEventListener('click', () => {
      if (!elements.fileInput) return;
      try { elements.fileInput.setAttribute('capture', 'environment'); } catch (e) {}
      elements.fileInput.click();
    });
  }

  if (elements.uploadBtn) {
    elements.uploadBtn.addEventListener('click', () => {
      if (!elements.fileInput) return;
      try { elements.fileInput.removeAttribute('capture'); } catch (e) {}
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

  // validação em tempo real
  Object.values(formFields).forEach(f => {
    if (f && f !== formFields.assinatura) {
      f.addEventListener('input', validateForm);
    }
  });
}

// ================================
// DATA PADRÃO
// ================================
function setupDefaultDate() {
  if (!formFields.data) return;
  const today = new Date();
  formFields.data.value = today.toISOString().slice(0, 10);
}

// ================================
// MANUSEIO DE IMAGEM (upload / preview)
// ================================
function handleImageSelection(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type || !file.type.startsWith('image')) {
    showModal('Erro', 'Selecione apenas imagens (JPG/PNG).', false);
    return;
  }

  showModal('Processando', 'Carregando imagem...', true);
  showProgressBar();
  setProgress(5, 'Carregando imagem...');

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const dataURL = e.target.result;
      // mostrar preview rapidamente (imagem original)
      showImagePreview(dataURL);

      // automatic enhancement + OCR pipeline
      await autoEnhanceAndOCR(dataURL);
    } catch (err) {
      console.error('Erro no pipeline de imagem:', err);
      hideProgressBar();
      showModal('Erro', 'Falha ao processar a imagem.', false);
    }
  };
  reader.onerror = (err) => {
    console.error('FileReader error:', err);
    hideProgressBar();
    showModal('Erro', 'Falha ao ler o arquivo.', false);
  };

  reader.readAsDataURL(file);
  if (elements.fileInput) elements.fileInput.value = '';
}

function showImagePreview(dataURL) {
  if (!elements) return;
  if (elements.imagePlaceholder) {
    try { elements.imagePlaceholder.style.display = 'none'; } catch (e) {}
  }
  if (elements.imagePreview) {
    elements.imagePreview.src = dataURL;
    elements.imagePreview.removeAttribute('hidden');
    try { elements.imagePreview.style.display = 'block'; } catch (e) {}
  }
  currentImageData = dataURL;
}

// ================================
// PIPELINE: melhoria automática + OCR
// ================================
async function autoEnhanceAndOCR(dataURL) {
  try {
    setProgress(8, 'Melhorando a foto...');
    const animPromise = animateProgress(60, 600);

    const improved = await melhorarImagemDataURL(dataURL);
    await animPromise;

    showImagePreview(improved);

    try {
      if (elements.fileInput) {
        const blob = dataURLtoBlob(improved);
        const f = new File([blob], 'melhorada.jpg', { type: blob.type });
        const dt = new DataTransfer();
        dt.items.add(f);
        elements.fileInput.files = dt.files;
      }
    } catch (e) {
      console.warn('Não foi possível atualizar fileInput com imagem melhorada:', e);
    }

    setProgress(90, 'Finalizando melhoria...');
    await animateProgress(100, 200);
    await new Promise(r => setTimeout(r, 150));

    const img = new Image();
    img.onload = () => {
      processImageWithOCR(img);
    };
    img.onerror = (err) => {
      console.warn('Erro ao carregar imagem melhorada para OCR:', err);
      hideProgressBar();
      showModal('Erro', 'Não foi possível executar OCR na imagem melhorada.', false);
    };
    img.src = improved;

  } catch (err) {
    console.error('Erro durante autoEnhanceAndOCR:', err);
    hideProgressBar();
    showModal('Erro', 'Falha ao melhorar a imagem automaticamente.', false);
  }
}

// animação simples de progresso visual (retorna Promise resolvida ao final)
function animateProgress(targetPct = 100, duration = 500) {
  return new Promise(resolve => {
    if (!elements || !elements.progressFill) return resolve();
    const el = elements.progressFill;
    const start = parseInt(el.style.width || '0', 10);
    const end = Math.min(100, Math.max(0, targetPct));
    const diff = end - start;
    if (diff === 0) return resolve();
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const cur = Math.round(start + diff * t);
      el.style.width = `${cur}%`;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// util: set progress and label
function setProgress(pct, label) {
  if (!elements) return;
  if (elements.progressFill) elements.progressFill.style.width = `${pct}%`;
  if (elements.progressLabel) elements.progressLabel.textContent = label ? `${label}` : `Progresso: ${pct}%`;
}

// ================================
// OCR (OpenAI Vision via backend)
// ================================
async function processImageWithOCR(imageElement) {
  if (isProcessing) return;
  isProcessing = true;
  showProgressBar();
  showModal('Lendo dados...', 'Enviando imagem para análise...', true);
  setProgress(10, 'Enviando imagem...');

  try {
    // use currentImageData (dataURL) if available
    const base64 = currentImageData || imageElement.src;
    if (!base64) throw new Error('Imagem não disponível para envio.');

    const result = await sendToOCR(base64);

    // result is expected to be an object with fields; fallback to raw text
    console.log('🔁 Resultado Vision:', result);

    // If API returns { raw: "..." }, try to normalize and extract via existing logic
    if (result && typeof result === 'object') {
      // Prefer explicit fields; if not available, try to use result.raw
      const mapped = {
        beneficiario: result.beneficiario || result.nome || '',
        cpf: result.cpf || result.CPF || '',
        atendente: result.atendente || '',
        produto: result.produto || '',
        quantidade: result.quantidade || '',
        endereco: result.endereco || '',
        data: result.data || '',
        assinatura: result.assinatura || '',
        numeroDocumento: result.numeroDocumento || result.numero || '',
        obs: result.obs || result.observacoes || result.notes || ''
      };

      // If the response contains a raw text: run the text-based extractor as fallback
      if (!mapped.beneficiario && result.raw) {
        const cleaned = normalizeOCRText(result.raw);
        extractAndFillData(cleaned);
        if (formFields.obs && !formFields.obs.value) formFields.obs.value = (result.raw || '').slice(0, 1000);
      } else {
        // set fields directly
        fillFormWithData(mapped);
        // set obs separately
        if (formFields.obs) {
          formFields.obs.value = mapped.obs || (result.raw ? result.raw : '');
          try { formFields.obs.style.borderColor = '#4caf50'; } catch (e) {}
        }
      }
    } else if (typeof result === 'string') {
      // If server returned a text string
      const cleaned = normalizeOCRText(result);
      extractAndFillData(cleaned);
    } else {
      showModal('Aviso', 'Resposta da API inesperada. Verifique logs.', false);
    }

    setProgress(100, 'Concluído');
    hideProgressBar();
    hideModal();
    showModal('Sucesso', 'Dados extraídos com sucesso!', false);

  } catch (err) {
    console.error('Erro no processo OCR via Vision:', err);
    hideProgressBar();
    showModal('Erro', 'Falha ao analisar imagem. Tente novamente.', false);
  } finally {
    isProcessing = false;
  }
}

// Envia imagem (dataURL) ao endpoint do backend (Render) e recebe JSON
async function sendToOCR(dataURL) {
  // ensure it's a data URL (if image element src is a blob url, convert)
  let payload = dataURL;
  // if it's a blob URL (startsWith blob:), convert to dataURL
  if (payload && payload.startsWith('blob:')) {
    payload = await blobUrlToDataURL(payload);
  }

  // If it is already a data URL, keep; if it's a remote URL, fetch and toDataURL
  if (payload && !payload.startsWith('data:')) {
    // attempt to fetch and convert
    try {
      const r = await fetch(payload);
      const b = await r.blob();
      payload = await blobToDataURL(b);
    } catch (e) {
      console.warn('Não foi possível converter URL para dataURL:', e);
    }
  }

  try {
    const resp = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: payload })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Erro do servidor: ${resp.status} - ${txt}`);
    }

    const json = await resp.json();
    return json;
  } catch (err) {
    console.error('Erro sendToOCR:', err);
    throw err;
  }
}

// helper: blob URL -> dataURL
function blobUrlToDataURL(blobUrl) {
  return new Promise((resolve, reject) => {
    fetch(blobUrl).then(r => r.blob()).then(blobToDataURL).then(resolve).catch(reject);
  });
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ================================
// NORMALIZAÇÃO / LIMPEZA DO TEXTO OCR
// (reaproveitado do seu código original)
// ================================
function normalizeOCRText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw;
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[••†‡••◊▮◼○■◦]/g, ' ');
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  s = s.replace(/ {2,}/g, ' ');
  s = s.replace(/[\u2018\u2019\u201c\u201d]/g, "'");
  s = s.replace(/O(?=\d{2,})/g, '0');
  s = s.replace(/(?<=\d)l(?=\d)/g, '1');
  s = s.replace(/\s*([:;,\-\/()])\s*/g, '$1');
  s = s.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  return s;
}

// ================================
// EXTRAÇÃO DE DADOS (sua lógica original - usada como fallback)
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

  if (!text) {
    fillFormWithData(data);
    return;
  }

  const cpfMatches = text.match(regexPatterns.cpf) || [];
  if (cpfMatches.length) {
    const rawCpf = cpfMatches[0];
    data.cpf = formatCPF(rawCpf);
  }

  const docMatches = text.match(regexPatterns.numeroDocumento) || [];
  if (docMatches.length) data.numeroDocumento = docMatches[0];

  const dateMatches = text.match(regexPatterns.data) || [];
  if (dateMatches.length) {
    data.data = formatDate(dateMatches[0]);
  }

  const qtdUnitMatches = text.match(regexPatterns.quantidadeWithUnit) || [];
  if (qtdUnitMatches.length) {
    data.quantidade = qtdUnitMatches[0].match(/[\d.,]+/)[0].replace(',', '.');
  } else {
    const allNums = text.match(regexPatterns.quantidadeOnly) || [];
    for (let n of allNums) {
      if (n.length >= 1 && !/\d{6,}/.test(n)) {
        data.quantidade = n.replace(',', '.');
        break;
      }
    }
  }

  if (regexPatterns.assinatura.test(text)) data.assinatura = 'OK';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();

    if (!data.beneficiario && /benef|benefici/i.test(low)) {
      data.beneficiario = (lines[i + 1] && lines[i + 1].length > 2) ? lines[i + 1] : data.beneficiario;
    }

    if (!data.atendente && /atend|atendente|operador/i.test(low)) {
      data.atendente = (lines[i + 1] && lines[i + 1].length > 2) ? lines[i + 1] : data.atendente;
    }

    if (!data.produto && /produto|cesta|item|items|descricao|conteudo/i.test(low)) {
      data.produto = data.produto || lines[i + 1] || lines[i];
    }

    if (!data.endereco && isAddressLine(low)) {
      data.endereco = lines.slice(i, i + 3).join(', ');
    }

    if (!data.endereco && low.includes('entregue') && low.includes('em')) {
      data.endereco = lines[i + 1] || '';
    }
  }

  if (!data.beneficiario) {
    let candidate = '';
    for (let ln of lines) {
      const cleaned = ln.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, '').trim();
      if (cleaned.length > candidate.length && cleaned.split(' ').length >= 2 && cleaned.length > 6) {
        candidate = cleaned;
      }
    }
    if (candidate) data.beneficiario = candidate;
  }

  if (!data.produto) {
    const found = lines.find(l => /cesta|produto|conteudo|kit/i.test(l));
    if (found) data.produto = found;
  }

  data.beneficiario = (data.beneficiario || '').trim();
  data.endereco = (data.endereco || '').trim();
  data.produto = (data.produto || '').trim();
  data.quantidade = (data.quantidade || '').toString();

  fillFormWithData(data);
}

function isAddressLine(line) {
  return ['rua', 'avenida', 'av.', 'travessa', 'bairro', 'cep', 'endereço', 'jardim', 'resid', 'rodovia', 'rua.'].some(k => line.includes(k));
}

function fillFormWithData(data) {
  if (!formFields) return;

  Object.entries(data).forEach(([k, v]) => {
    if (v && formFields[k]) {
      try {
        formFields[k].value = v;
        formFields[k].style.borderColor = '#4caf50';
      } catch (e) { /* ignore styling errors */ }
    }
  });

  validateForm();
}

// ================================
// UTILITÁRIOS (formatação)
// ================================
function formatCPF(cpf) {
  const n = (cpf || '').replace(/\D/g, '');
  if (n.length !== 11) return cpf;
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDate(str) {
  if (!str) return '';
  const m = str.match(/(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](\d{4})/);
  if (!m) return str;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ================================
// MELHORIA DE IMAGEM (Office-Lens like) - CORRIGIDO
// ================================
function melhorarImagemDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    if (!dataURL || typeof dataURL !== 'string') return reject('No dataURL');
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // CORREÇÃO: Adicionar willReadFrequently para evitar warning
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        ctx.filter = 'brightness(1.15) contrast(1.25) saturate(1.05)';
        ctx.drawImage(img, 0, 0);

        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          lum = ((lum - 128) * 1.05) + 128;
          data[i] = data[i + 1] = data[i + 2] = lum;
        }

        ctx.putImageData(imageData, 0, 0);

        try {
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = canvas.width;
          tmpCanvas.height = canvas.height;
          const tctx = tmpCanvas.getContext('2d', { willReadFrequently: true });

          tctx.filter = 'blur(1px)';
          tctx.drawImage(canvas, 0, 0);

          ctx.globalCompositeOperation = 'overlay';
          ctx.globalAlpha = 0.35;
          ctx.drawImage(tmpCanvas, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        } catch (e) { /* ignore */ }

        try {
          let finalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const fd = finalData.data;
          for (let i = 0; i < fd.length; i += 4) {
            fd[i] = Math.min(255, Math.max(0, (fd[i] - 20) * 1.12 + 10));
            fd[i+1] = Math.min(255, Math.max(0, (fd[i+1] - 20) * 1.12 + 10));
            fd[i+2] = Math.min(255, Math.max(0, (fd[i+2] - 20) * 1.12 + 10));
          }
          ctx.putImageData(finalData, 0, 0);
        } catch (e) { /* ignore */ }

        const enhancedDataURL = canvas.toDataURL('image/jpeg', 0.92);
        resolve(enhancedDataURL);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = dataURL;
  });
}

// handler (mantida como utilidade por compatibilidade, não ligada automaticamente)
async function handleEnhanceClick(ev) {
  try {
    let sourceDataURL = currentImageData || (elements.imagePreview && elements.imagePreview.src);
    if (!sourceDataURL && elements.fileInput && elements.fileInput.files && elements.fileInput.files[0]) {
      sourceDataURL = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = err => rej(err);
        r.readAsDataURL(elements.fileInput.files[0]);
      });
    }
    if (!sourceDataURL) {
      alert('Nenhuma imagem disponível. Primeiro selecione ou tire uma foto.');
      return;
    }
    showModal('Melhorando imagem', 'Aguarde enquanto a imagem é tratada...', true);
    setProgress(5, 'Melhorando a foto...');
    const improved = await melhorarImagemDataURL(sourceDataURL);
    showImagePreview(improved);
    setTimeout(() => {
      const img = new Image();
      img.onload = () => processImageWithOCR(img);
      img.src = improved;
    }, 200);
  } catch (err) {
    console.error('Erro na melhoria da imagem:', err);
    hideProgressBar();
    showModal('Erro', 'Falha ao melhorar a imagem.', false);
  }
}

// helper para converter dataURL -> Blob
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// ================================
// FORMULÁRIO / VALIDAÇÃO
// ================================
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

  if (elements && elements.submitBtn) elements.submitBtn.disabled = !valid;
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

  if (elements && elements.imagePreview) {
    elements.imagePreview.style.display = 'none';
    elements.imagePreview.src = '';
  }

  if (elements && elements.imagePlaceholder) {
    try { elements.imagePlaceholder.style.display = 'flex'; } catch (e) {}
  }

  currentImageData = null;
  validateForm();
}

// ================================
// SUBMIT (simulado)
// ================================
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
    observacoes: formFields.obs?.value || '',
    imagemBase64: currentImageData || '',
    timestamp: new Date().toISOString()
  };

  console.log('📤 Dados preparados (simulação):', payload);

  setTimeout(() => {
    showModal('Pronto!', 'Dados processados localmente (simulação). Configure envio para planilha depois.', false);
  }, 1200);
}

// ================================
// UI: progresso e modal
// ================================
function showProgressBar() {
  if (elements && elements.progressContainer) elements.progressContainer.hidden = false;
}
function hideProgressBar() {
  if (elements && elements.progressContainer) elements.progressContainer.hidden = true;
}

function showModal(title, message, spinner = true) {
  if (!elements || !elements.modal || !elements.modalTitle || !elements.modalMessage) {
    try { alert(title + '\n\n' + message); } catch (e) {}
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

// ================================
// FINALIZAÇÃO / limpeza
// ================================
window.addEventListener('beforeunload', async () => {
  // nothing to terminate (we removed tesseract worker use)
});

// Export para debug no console
window.SocialColetor = {
  extractAndFillData,
  processImageWithOCR,
  validateForm,
  clearForm,
  handleEnhanceClick
};

console.log('📦 Script Social Coletor carregado (versão integrada com OpenAI Vision).');
