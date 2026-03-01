import axios from 'axios';

const OCR_API_URL = 'https://api.ocr.space/parse/image';

function normalizeSpaces(s = '') {
  return String(s).replace(/\s+/g, ' ').trim();
}

function formatCPF(raw = '') {
  const d = String(raw).replace(/\D/g, '').slice(0, 11);
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function safeNumber(raw = '') {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function isLikelyName(line = '') {
  const v = normalizeSpaces(line);
  if (!v || v.length < 6) return false;
  if (/\d/.test(v)) return false;
  if (v.split(' ').length < 2) return false;
  if (/\b(produto|cpf|documento|data|quantidade|fornecedor|beneficiario|atendente|prefeitura|secretaria)\b/i.test(v)) return false;
  return true;
}

function extractFromText(text = '') {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => normalizeSpaces(l))
    .filter(Boolean);

  const fields = {
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

  const doubtful = new Set();

  const raw = lines.join('\n');

  const cpf = raw.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/);
  if (cpf) fields.cpf = formatCPF(cpf[0]);

  const doc = raw.match(/\b\d{6,7}\/\d{4}\b/);
  if (doc) fields.numeroDocumento = doc[0];

  const date = raw.match(/\b(0[1-9]|[12][0-9]|3[01])[\/-](0[1-9]|1[0-2])[\/-]\d{4}\b/);
  if (date) fields.data = date[0].replace(/-/g, '/');

  // Beneficiário: tenta linha pós-label ou próxima ao CPF
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\bbenefici[aá]rio\b/i.test(l)) {
      const inline = normalizeSpaces(l.replace(/\bbenefici[aá]rio\b[:\-]?/i, ''));
      if (isLikelyName(inline)) {
        fields.beneficiario = inline;
        break;
      }
      if (isLikelyName(lines[i + 1])) {
        fields.beneficiario = lines[i + 1];
        break;
      }
    }
  }

  if (!fields.beneficiario && fields.cpf) {
    const idx = lines.findIndex((l) => l.includes(fields.cpf) || l.replace(/\D/g, '').includes(fields.cpf.replace(/\D/g, '')));
    if (idx >= 0) {
      for (let k = Math.max(0, idx - 3); k <= Math.min(lines.length - 1, idx + 3); k++) {
        if (k === idx) continue;
        if (isLikelyName(lines[k])) {
          fields.beneficiario = lines[k];
          break;
        }
      }
    }
  }

  // Atendente por label e fallback em nomes no final
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\batendente\b/i.test(l)) {
      const inline = normalizeSpaces(l.replace(/\batendente\b[:\-]?/i, ''));
      if (isLikelyName(inline)) {
        fields.atendente = inline;
        break;
      }
      if (isLikelyName(lines[i + 1])) {
        fields.atendente = lines[i + 1];
        break;
      }
    }
  }

  if (!fields.atendente) {
    const tail = lines.slice(-12);
    const best = tail.find((l) => isLikelyName(l));
    if (best) fields.atendente = best;
  }

  // Produto + quantidade
  for (const line of lines) {
    if (/\b(rua|avenida|av\.|jardim|barueri|cpf|documento|data|atendente|benefici[aá]rio)\b/i.test(line)) continue;

    const m = line.match(/^(.*?)(\d{1,4}[.,]\d{1,2})\s*(un|kg|g|ml|l|cx|unidades?)?$/i);
    if (m) {
      const produto = normalizeSpaces(m[1]);
      const qtdRaw = m[2];
      const qtd = safeNumber(qtdRaw);
      if (produto && qtd && qtd > 0 && qtd < 1000) {
        fields.produto = produto;
        fields.quantidade = String(qtdRaw).replace('.', ',');
        break;
      }
    }
  }

  if (!fields.produto) {
    const line = lines.find((l) => /\bproduto\b/i.test(l));
    if (line) {
      fields.produto = normalizeSpaces(line.replace(/\bproduto\b[:\-]?/i, ''));
    }
  }

  // Normalização de produto para casos comuns
  if (/^emergenc(ia|ial)$/i.test(String(fields.produto || '').trim())) {
    fields.produto = 'CESTA EMERGENCIAL';
  }

  // Endereço
  const addrIdx = lines.findIndex((l) => /\b(rua|avenida|av\.|travessa|alameda|endereco|endereço)\b/i.test(l));
  if (addrIdx >= 0) {
    fields.endereco = lines.slice(addrIdx, Math.min(addrIdx + 3, lines.length)).join(', ');
  }

  // Assinatura (marker simples)
  if (/\b(assinado|assinatura|\sX\s|_{4,})\b/i.test(raw)) {
    fields.assinatura = 'OK';
  }

  // Flags de dúvida
  if (!fields.beneficiario) doubtful.add('beneficiario');
  if (!fields.cpf || String(fields.cpf).replace(/\D/g, '').length !== 11) doubtful.add('cpf');
  if (!fields.produto) doubtful.add('produto');
  if (!fields.quantidade) doubtful.add('quantidade');
  if (!fields.data) doubtful.add('data');

  return { fields, doubtfulFields: Array.from(doubtful) };
}

export async function extractFieldsFromImageUrl(fileUrl) {
  const ocrApiKey = process.env.OCR_SPACE_API_KEY || 'K89229373088957';
  if (!ocrApiKey) {
    throw new Error('OCR_SPACE_API_KEY não configurada');
  }

  const imageResponse = await axios.get(fileUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });

  const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
  const imageBuffer = Buffer.from(imageResponse.data);

  const form = new FormData();
  form.append('file', new Blob([imageBuffer], { type: contentType }), 'upload.jpg');
  form.append('apikey', ocrApiKey);
  form.append('language', 'por');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('isTable', 'false');
  form.append('OCREngine', '2');

  const ocrRes = await fetch(OCR_API_URL, {
    method: 'POST',
    body: form
  });

  if (!ocrRes.ok) {
    throw new Error(`OCR HTTP ${ocrRes.status}`);
  }

  const ocrData = await ocrRes.json();
  if (ocrData?.IsErroredOnProcessing) {
    throw new Error(ocrData?.ErrorMessage || 'OCR processing error');
  }

  const text = ocrData?.ParsedResults?.[0]?.ParsedText || '';
  const parsed = extractFromText(text);

  return {
    text,
    ...parsed
  };
}
