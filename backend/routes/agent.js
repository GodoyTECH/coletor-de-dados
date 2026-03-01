import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ensureStoragePath, buildPublicFileUrl } from '../services/storage.js';
import { callAgent } from '../services/callAgent.js';
import { transcribeAudioPlaceholder } from '../services/audio.js';
import { resolveProfileByName } from '../services/agentProfiles.js';
import { extractFieldsFromImageUrl } from '../services/manualExtract.js';
import { runMadruguinhaRuntime } from '../services/madruguinhaBridge.js';

const router = express.Router();
const storagePath = ensureStoragePath();
const sessionProfiles = new Map();
const pendingValidations = new Map();

const upload = multer({
  dest: storagePath,
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024)
  }
});

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function hasBadProductPattern(value = '') {
  const v = normalize(value);
  if (!v) return true;
  return [
    /\b(rua|avenida|av\.|jardim|barueri|sp|cep)\b/i,
    /^\d+[.,]?\d*$/,
    /^produto$/i,
    /^emergenc(ia|ial)$/i
  ].some((rx) => rx.test(v));
}

async function callAppScript(action, data = {}) {
  const appsScriptUrl = process.env.APPSCRIPT_URL || process.env.SYSTEM_URL;
  const apiToken = process.env.API_TOKEN;

  if (!appsScriptUrl) throw new Error('APPSCRIPT_URL não configurada');

  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data, ...(apiToken ? { token: apiToken } : {}) })
  });

  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

  if (!response.ok || (parsed && parsed.success === false)) {
    throw new Error(parsed?.error || parsed?.message || text || response.statusText);
  }

  return parsed || {};
}

async function listAllRegistros(limit = 200, maxRows = 5000) {
  const rows = [];
  let offset = 0;
  let headers = [];
  let hasMore = true;

  while (hasMore && rows.length < maxRows) {
    const result = await callAppScript('listRegistros', { limit, offset });
    headers = result?.headers || headers;
    const chunk = result?.rows || [];

    chunk.forEach((row) => {
      const mapped = { rowNumber: row.rowNumber };
      headers.forEach((h, i) => { mapped[h] = row.values?.[i] ?? ''; });
      rows.push(mapped);
    });

    hasMore = Boolean(result?.meta?.hasMore);
    offset = Number(result?.meta?.offset || 0);

    if (!chunk.length) break;
  }

  return { headers, rows };
}

function analyzeRows(rows = []) {
  const summary = {
    total: rows.length,
    suspectProduto: 0,
    suspectCpf: 0,
    suspectData: 0,
    suspectQuantidade: 0,
    missingImage: 0,
    duplicatesByDoc: 0
  };

  const seenDocs = new Map();

  for (const row of rows) {
    const produto = row.PRODUTO || row.produto || '';
    const cpf = String(row.CPF || row.cpf || '').replace(/\D/g, '');
    const data = row.DATA || row.data || '';
    const qtd = Number(String(row.QUANTIDADE || row.quantidade || '').replace(',', '.'));
    const img = row.IMG_URL || row.img_url || '';
    const doc = String(row.NUM_DOCUMENTO || row.numeroDocumento || '').trim();

    if (hasBadProductPattern(produto)) summary.suspectProduto += 1;
    if (cpf && cpf.length !== 11) summary.suspectCpf += 1;
    if (data && !/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(String(data))) summary.suspectData += 1;
    if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 9999) summary.suspectQuantidade += 1;
    if (!String(img).trim()) summary.missingImage += 1;

    if (doc) {
      seenDocs.set(doc, (seenDocs.get(doc) || 0) + 1);
    }
  }

  for (const c of seenDocs.values()) {
    if (c > 1) summary.duplicatesByDoc += c - 1;
  }

  return summary;
}

function buildAnalysisText(summary, dashboard = {}) {
  return [
    '📊 Situação atual dos registros',
    '',
    `Dashboard: total=${dashboard.total ?? '-'} | ativos=${dashboard.ativos ?? '-'} | duplicados=${dashboard.duplicados ?? '-'}`,
    `Qualidade: produto_suspeito=${summary.suspectProduto} | cpf_inconsistente=${summary.suspectCpf} | data_inconsistente=${summary.suspectData}`,
    `Operacional: qtd_inconsistente=${summary.suspectQuantidade} | sem_imagem=${summary.missingImage} | duplicidade_doc=${summary.duplicatesByDoc}`
  ].join('\n');
}


async function runFullAudit() {
  const { rows } = await listAllRegistros(200, 5000);
  const updates = [];

  for (const row of rows) {
    const rowNumber = row.rowNumber;
    const imgUrl = String(row.IMG_URL || '').trim();
    if (!rowNumber || !imgUrl) continue;

    const currentProduto = String(row.PRODUTO || '').trim();
    const cpf = String(row.CPF || '').replace(/\D/g, '');
    const quantidade = Number(String(row.QUANTIDADE || '').replace(',', '.'));

    const needsProduto = hasBadProductPattern(currentProduto);
    const needsCpf = cpf && cpf.length !== 11;
    const needsQtd = !Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 9999;

    if (!needsProduto && !needsCpf && !needsQtd) continue;

    try {
      const extraction = await extractFieldsFromImageUrl(imgUrl);
      const candidate = extraction?.fields || {};
      const values = {};

      if (needsProduto && candidate.produto && !hasBadProductPattern(candidate.produto)) {
        values.PRODUTO = candidate.produto;
      }

      if (needsCpf && candidate.cpf && String(candidate.cpf).replace(/\D/g, '').length === 11) {
        values.CPF = candidate.cpf;
      }

      if (needsQtd && candidate.quantidade) {
        const cq = Number(String(candidate.quantidade).replace(',', '.'));
        if (Number.isFinite(cq) && cq > 0 && cq <= 9999) {
          values.QUANTIDADE = String(candidate.quantidade);
        }
      }

      if (Object.keys(values).length) {
        values.OBSERVACOES = `Auto-auditoria completa em ${new Date().toISOString()}`;
        updates.push({ rowNumber, values });
      }
    } catch {
      // ignora linha
    }
  }

  if (updates.length) {
    await callAppScript('updateRegistrosBatch', { updates });
  }

  const after = analyzeRows((await listAllRegistros(200, 5000)).rows);
  return { updates, after };
}

router.post('/identify', async (req, res) => {
  const { sessionId, name } = req.body || {};

  if (!sessionId || !name) {
    return res.status(400).json({ error: 'sessionId e name são obrigatórios' });
  }

  const profile = resolveProfileByName(name);
  sessionProfiles.set(sessionId, { ...profile, name });

  return res.json({
    ok: true,
    sessionId,
    profileId: profile.profileId,
    assistantName: profile.assistantName,
    matched: profile.matched
  });
});

router.post('/chat', async (req, res) => {
  try {
    const { sessionId, message, attachments = [], name } = req.body || {};

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId e message são obrigatórios' });
    }

    let profile = sessionProfiles.get(sessionId);
    if (!profile && name) {
      profile = { ...resolveProfileByName(name), name };
      sessionProfiles.set(sessionId, profile);
    }

    const systemPrompt = profile?.systemPrompt || '';
    const loopResult = await runMadruguinhaRuntime('agentLoop', {
      sessionId,
      message,
      attachments,
      systemPrompt
    });

    if (loopResult?.reply) return res.json(loopResult);

    const result = await callAgent({ sessionId, message, attachments, systemPrompt });
    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      error: 'Erro ao consultar agente',
      detail: error.message
    });
  }
});

// SSE preparado para evolução de streaming
router.get('/chat/stream', async (req, res) => {
  const { sessionId, message } = req.query;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId e message são obrigatórios' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const result = await callAgent({ sessionId, message, attachments: [] });
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(result)}\n\n`);
    res.write('event: end\n');
    res.write('data: done\n\n');
    res.end();
  } catch (error) {
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado (campo: file)' });
    }

    const fileUrl = buildPublicFileUrl(req, req.file.filename);

    return res.json({
      fileUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      storageKey: req.file.filename
    });
  } catch (error) {
    return res.status(500).json({ error: 'Falha no upload', detail: error.message });
  }
});

router.post('/submit-validated', async (req, res) => {
  try {
    const { sessionId, fields, force = false } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });

    const pending = pendingValidations.get(sessionId);
    const payloadFields = fields || pending?.fields;

    if (!payloadFields) {
      return res.status(400).json({ error: 'Nenhum dado pendente para validar' });
    }

    const required = ['beneficiario', 'cpf', 'atendente', 'produto', 'quantidade', 'endereco', 'data'];
    const missing = required.filter((k) => !String(payloadFields?.[k] || '').trim());

    if (missing.length && !force) {
      return res.status(422).json({
        error: 'Campos obrigatórios pendentes',
        missing
      });
    }

    const appsScriptUrl = process.env.APPSCRIPT_URL || process.env.SYSTEM_URL;
    const apiToken = process.env.API_TOKEN;

    if (!appsScriptUrl) {
      return res.status(500).json({ error: 'APPSCRIPT_URL não configurada' });
    }

    const payload = {
      action: 'submit',
      data: {
        beneficiario: String(payloadFields.beneficiario || '').trim(),
        cpf: String(payloadFields.cpf || '').replace(/\D/g, ''),
        atendente: String(payloadFields.atendente || '').trim(),
        produto: String(payloadFields.produto || '').trim(),
        quantidade: Number(String(payloadFields.quantidade || '').replace(',', '.')) || 0,
        endereco: String(payloadFields.endereco || '').trim(),
        data: String(payloadFields.data || '').trim(),
        assinatura: String(payloadFields.assinatura || 'N/A').trim(),
        numeroDocumento: String(payloadFields.numeroDocumento || '').trim(),
        observacoes: String(payloadFields.observacoes || '').trim(),
        imagemBase64: '',
        timestamp: new Date().toISOString()
      },
      ...(apiToken ? { token: apiToken } : {})
    };

    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

    if (!response.ok || (parsed && parsed.success === false)) {
      return res.status(502).json({ error: 'Falha ao enviar para planilha', detail: parsed || text || response.statusText });
    }

    pendingValidations.delete(sessionId);
    return res.json({ ok: true, result: parsed || { raw: text || 'ok' } });
  } catch (error) {
    return res.status(502).json({ error: 'Falha no envio validado', detail: error.message });
  }
});

router.post('/audit-products', async (req, res) => {
  try {
    const { rows = [], produtoKey = 'PRODUTO', imageKey = 'IMG_URL', rowNumberKey = 'rowNumber' } = req.body || {};

    const suspiciousPatterns = [
      /\b(rua|avenida|av\.|jardim|barueri|sp|cep)\b/i,
      /^\d+[.,]?\d*$/,
      /^produto$/i,
      /^emergenc(ia|ial)$/i
    ];

    const isSuspect = (value = '') => {
      const v = String(value || '').trim();
      if (!v) return true;
      return suspiciousPatterns.some((rx) => rx.test(v));
    };

    const updates = [];

    for (const row of rows) {
      const currentProduto = String(row?.[produtoKey] || '').trim();
      const imgUrl = String(row?.[imageKey] || '').trim();
      const rowNumber = row?.[rowNumberKey];

      if (!rowNumber || !imgUrl || !isSuspect(currentProduto)) continue;

      try {
        const extraction = await extractFieldsFromImageUrl(imgUrl);
        const candidate = String(extraction?.fields?.produto || '').trim();
        if (candidate && !isSuspect(candidate) && candidate.toLowerCase() !== currentProduto.toLowerCase()) {
          updates.push({
            rowNumber,
            values: {
              PRODUTO: candidate,
              OBSERVACOES: `Auto-auditoria: produto corrigido de "${currentProduto}" para "${candidate}" em ${new Date().toISOString()}`
            }
          });
        }
      } catch {
        // ignora linha individual
      }
    }

    return res.json({ ok: true, updates, analyzed: rows.length });
  } catch (error) {
    return res.status(500).json({ error: 'Falha na auditoria de produtos', detail: error.message });
  }
});

router.post('/run-full-audit', async (_req, res) => {
  try {
    const result = await runFullAudit();
    return res.json({ ok: true, updated: result.updates.length, summary: result.after });
  } catch (error) {
    return res.status(500).json({ error: 'Falha na auditoria completa', detail: error.message });
  }
});

router.post('/audio', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId, name } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Áudio não enviado (campo: audio)' });
    }

    const tx = await transcribeAudioPlaceholder(path.resolve(req.file.path));
    let profile = sessionProfiles.get(sessionId);
    if (!profile && name) {
      profile = { ...resolveProfileByName(name), name };
      sessionProfiles.set(sessionId, profile);
    }

    const result = await callAgent({
      sessionId,
      message: tx.text,
      attachments: [
        {
          type: 'audio',
          storageKey: req.file.filename,
          fileUrl: buildPublicFileUrl(req, req.file.filename),
          mimeType: req.file.mimetype
        }
      ],
      metadata: { transcriptionProvider: tx.provider },
      systemPrompt: profile?.systemPrompt || ''
    });

    return res.json({
      transcription: tx,
      ...result
    });
  } catch (error) {
    return res.status(502).json({ error: 'Falha no pipeline de áudio', detail: error.message });
  }
});

router.post('/tools/:tool', async (req, res) => {
  try {
    const { tool } = req.params;
    const input = req.body || {};
    const allowed = new Set([
      'processar_imagem',
      'processar_lote_imagens',
      'auditar_dashboard',
      'gerar_relatorio_pdf',
      'consultar_registros',
      'editar_registro',
      'excluir_registro',
      'listar_duplicados',
      'resolver_duplicados_documento',
      'interpretarIntencao',
      'agentLoop'
    ]);

    if (!allowed.has(tool)) {
      return res.status(404).json({ error: `Tool não encontrada: ${tool}` });
    }

    const result = await runMadruguinhaRuntime(tool, input);
    return res.json({ ok: true, tool, result });
  } catch (error) {
    return res.status(500).json({ error: 'Falha na execução da tool', detail: error.message });
  }
});

export default router;
