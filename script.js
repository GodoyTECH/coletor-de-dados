/**
 * SOCIAL COLETOR - SCRIPT PRINCIPAL (versão final corrigida)
 * Responsável pela captura de imagem, OCR e preenchimento do formulário
 *
 * Observações:
 * - Preview via <img id="imagePreview"> (conforme indicado)
 * - Mantive envio simulado; configuração do Apps Script fica para depois
 * - Arquivo defensivo: checagens antes de acessar elementos
 */

// ================================
// VARIÁVEIS GLOBAIS
// ================================
let elements = {};
let formFields = {};

let currentImageData = null;
let tesseractWorker = null;
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

  // checar Tesseract
  if (typeof Tesseract === 'undefined') {
    console.error('❌ Tesseract não carregado!');
    alert('Biblioteca OCR não carregada. Recarregue a página e verifique a internet.');
    return;
  }

  setupElements();
  console.table(Object.keys(elements));
  console.table(Object.keys(formFields));

  initializeApp();
});

// ================================
// BUSCA ELEMENTOS DO DOM
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
      // pedir câmera traseira em dispositivos móveis (se suportado)
      try {
        elements.fileInput.setAttribute('capture', 'environment');
      } catch (e) { /* ignore */ }
      elements.fileInput.click();
    });
  }

  if (elements.uploadBtn) {
    elements.uploadBtn.addEventListener('click', () => {
      if (!elements.fileInput) return;
      try {
        elements.fileInput.removeAttribute('capture');
      } catch (e) { /* ignore */ }
      elements.fileInput.click();
    });
  }

  if (elements.fileInput) {
    // garantir que seja change e que exista
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

  // aceitar apenas imagens
  if (!file.type || !file.type.startsWith('image')) {
    showModal('Erro', 'Selecione apenas imagens (JPG/PNG).', false);
    return;
  }

  showModal('Processando', 'Carregando imagem...');

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataURL = e.target.result;
    showImagePreview(dataURL);

    // criar Image e processar quando estiver carregada
    const img = new Image();
    img.onload = () => {
      // small timeout para garantir render do preview antes do OCR pesado
      setTimeout(() => processImageWithOCR(img), 150);
    };
    img.onerror = (err) => {
      console.warn('Erro ao carregar imagem interna:', err);
      showModal('Erro', 'Não foi possível processar a imagem.', false);
    };
    img.src = dataURL;
  };
  reader.onerror = (err) => {
    console.error('FileReader error:', err);
    showModal('Erro', 'Falha ao ler o arquivo.', false);
  };

  reader.readAsDataURL(file);
  // limpar input para poder reusar o mesmo arquivo se necessário
  if (elements.fileInput) elements.fileInput.value = '';
}

function showImagePreview(dataURL) {
  if (!elements) return;

  // esconder placeholder e mostrar preview (img)
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
// OCR (Tesseract.js)
// ================================
async function processImageWithOCR(imageElement) {
  if (isProcessing) return;
  isProcessing = true;
  showProgressBar();
  showModal('Processando OCR', 'Iniciando reconhecimento de texto...');

  try {
    // Criar worker com logger para progresso
    tesseractWorker = await Tesseract.createWorker({
      logger: (m) => updateProgress(m)
    });

    await tesseractWorker.load();
    await tesseractWorker.loadLanguage('por');
    await tesseractWorker.initialize('por');

    // parâmetros defensivos, pageseg_mode como número
    await tesseractWorker.setParameters({
      tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÄÇÈÉÊËÍÓÔÕÖÚÛÜ.,-/:;() ',
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: 6
    });

    const { data: { text } } = await tesseractWorker.recognize(imageElement);

    // normalizar texto cru
    const cleaned = normalizeOCRText(text);
    console.log('🔎 Texto OCR (limpo):', cleaned);

    // preencher campos extraídos
    extractAndFillData(cleaned);

    hideProgressBar();
    hideModal();
    showModal('Sucesso', 'Dados extraídos automaticamente!', false);

  } catch (err) {
    console.error('Erro OCR:', err);
    hideProgressBar();
    showModal('Erro', 'Falha no OCR. Verifique a imagem e tente novamente.', false);
  } finally {
    isProcessing = false;
    if (tesseractWorker) {
      try { await tesseractWorker.terminate(); } catch (e) { console.warn(e); }
      tesseractWorker = null;
    }
  }
}

// Atualiza barra de progresso
function updateProgress(msg) {
  if (!elements || !elements.progressLabel || !elements.progressFill) return;
  if (msg && (msg.status || msg.progress !== undefined)) {
    // status pode ser 'recognizing text', progress é 0..1
    const pct = Math.round((msg.progress || 0) * 100);
    elements.progressLabel.textContent = `OCR: ${pct}%`;
    elements.progressFill.style.width = `${pct}%`;
  }
}

// ================================
// NORMALIZAÇÃO / LIMPEZA DO TEXTO OCR
// ================================
function normalizeOCRText(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let s = raw;

  // 1) substituir quebras indevidas por newline uniforme
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2) remover caracteres estranhos comumente gerados
  s = s.replace(/[••†‡••◊▮◼○■◦]/g, ' ');
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');

  // 3) normalizar espaçamento (múltiplos espaços -> único)
  s = s.replace(/ {2,}/g, ' ');

  // 4) limpar repetições de pontuação estranha
  s = s.replace(/[\u2018\u2019\u201c\u201d]/g, "'");

  // 5) corrigir casos comuns de OCR para números e letras (heurísticas simples)
  // Ex.: "0" trocado por "O" e vice-versa — tenta contexto de CPF (pouco intrusivo)
  s = s.replace(/O(?=\d{2,})/g, '0'); // O antes de números -> 0
  s = s.replace(/(?<=\d)l(?=\d)/g, '1'); // l entre números -> 1

  // 6) remover espaços ao redor de sinais importantes
  s = s.replace(/\s*([:;,\-\/()])\s*/g, '$1');

  // 7) normalizar múltiplas quebras em um bloco - manter estrutura por linhas
  s = s.split('\n').map(line => line.trim()).filter(Boolean).join('\n');

  return s;
}

// ================================
// EXTRAÇÃO DE DADOS
// ================================
function extractAndFillData(text) {
  // objeto inicial
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

  // Encontrar CPF (prioridade)
  const cpfMatches = text.match(regexPatterns.cpf) || [];
  if (cpfMatches.length) {
    // pegar o primeiro com 11 dígitos formatado
    const rawCpf = cpfMatches[0];
    data.cpf = formatCPF(rawCpf);
  }

  // Número do documento (ex: 333532/2925)
  const docMatches = text.match(regexPatterns.numeroDocumento) || [];
  if (docMatches.length) data.numeroDocumento = docMatches[0];

  // Datas (DD/MM/YYYY)
  const dateMatches = text.match(regexPatterns.data) || [];
  if (dateMatches.length) {
    // pegar a data mais comum (primeira)
    data.data = formatDate(dateMatches[0]);
  }

  // Quantidade com unidade (ex: "1,00 un")
  const qtdUnitMatches = text.match(regexPatterns.quantidadeWithUnit) || [];
  if (qtdUnitMatches.length) {
    // extrair o número da string
    data.quantidade = qtdUnitMatches[0].match(/[\d.,]+/)[0].replace(',', '.');
  } else {
    // fallback: pegar primeiro número que faça sentido
    const allNums = text.match(regexPatterns.quantidadeOnly) || [];
    for (let n of allNums) {
      // ignorar números que fazem parte de CPF/Doc identificados
      if (n.length >= 1 && !/\d{6,}/.test(n)) {
        data.quantidade = n.replace(',', '.');
        break;
      }
    }
  }

  // Assinatura (presença de padrões)
  if (regexPatterns.assinatura.test(text)) data.assinatura = 'OK';

  // Agora heurísticas por linhas para nome, atendente, produto, endereço
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Heurística 1: procurar linhas com palavras-chave
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();

    if (!data.beneficiario && /benef|benefici/i.test(low)) {
      // tentar próxima linha
      data.beneficiario = (lines[i + 1] && lines[i + 1].length > 2) ? lines[i + 1] : data.beneficiario;
    }

    if (!data.atendente && /atend|atendente|operador/i.test(low)) {
      data.atendente = (lines[i + 1] && lines[i + 1].length > 2) ? lines[i + 1] : data.atendente;
    }

    if (!data.produto && /produto|cesta|item|items|descricao|conteudo/i.test(low)) {
      // pegar a mesma linha ou a próxima como descrição
      data.produto = data.produto || lines[i + 1] || lines[i];
    }

    // endereço heurístico (procura por 'rua' 'avenida' 'bairro' 'cep' 'jardim' etc)
    if (!data.endereco && isAddressLine(low)) {
      // juntar 1-3 linhas a partir daqui
      data.endereco = lines.slice(i, i + 3).join(', ');
    }

    // Caso o doc tenha "ENTREGUE EM ..." tente extrair o endereço depois desta frase
    if (!data.endereco && low.includes('entregue') && low.includes('em')) {
      data.endereco = lines[i + 1] || '';
    }
  }

  // Heurística 2: se beneficiário ainda vazio, tentar achar a maior linha com muitas letras (possível nome)
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

  // Heurística 3: produto - procurar por linhas com 'CESTA' ou 'PRODUTO'
  if (!data.produto) {
    const found = lines.find(l => /cesta|produto|conteudo|kit/i.test(l));
    if (found) data.produto = found;
  }

  // Pequenas normalizações finais
  data.beneficiario = (data.beneficiario || '').trim();
  data.endereco = (data.endereco || '').trim();
  data.produto = (data.produto || '').trim();
  data.quantidade = (data.quantidade || '').toString();

  // Preencher formulário
  fillFormWithData(data);
}

// helpers
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
  // aceita DD/MM/YYYY ou DD-MM-YYYY
  if (!str) return '';
  const m = str.match(/(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](\d{4})/);
  if (!m) return str;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
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
// SUBMIT (simulado, envio Apps Script depois)
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
    imagemBase64: currentImageData || '',
    timestamp: new Date().toISOString()
  };

  console.log('📤 Dados preparados (simulação):', payload);

  // Simulação local (substituir por sendToGoogleSheets quando pronto)
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
  // fallback simples caso elementos não existentes
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
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch (e) {}
  }
});

// Export para debug no console
window.SocialColetor = {
  extractAndFillData,
  processImageWithOCR,
  validateForm,
  clearForm
};

console.log('📦 Script Social Coletor carregado (versão de OCR e preview corrigida).');

