import express from 'express';
import multer from 'multer';
import path from 'path';
import { ensureStoragePath, buildPublicFileUrl } from '../services/storage.js';
import { callAgent } from '../services/callAgent.js';
import { transcribeAudioPlaceholder } from '../services/audio.js';
import { resolveProfileByName } from '../services/agentProfiles.js';

const router = express.Router();
const storagePath = ensureStoragePath();
const sessionProfiles = new Map();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storagePath),
    filename: (_req, file, cb) => {
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const safe = String(file.originalname || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${stamp}-${safe}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

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

    const result = await callAgent({
      sessionId,
      message,
      attachments,
      systemPrompt: profile?.systemPrompt || ''
    });

    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      error: 'Erro ao consultar agente',
      detail: error.message
    });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado (campo: file)' });
    }

    return res.json({
      ok: true,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      fileUrl: buildPublicFileUrl(req, req.file.filename),
      storageKey: req.file.filename
    });
  } catch (error) {
    return res.status(500).json({ error: 'Falha no upload', detail: error.message });
  }
});


router.post('/submit-validated', async (_req, res) => {
  return res.status(410).json({
    error: 'Fluxo de validação local foi desativado neste gateway.',
    detail: 'Use o fluxo oficial do Madruguinha REAL no OpenClaw.'
  });
});

router.post('/audit-products', async (_req, res) => {
  return res.status(410).json({
    error: 'Auditoria local removida do gateway.',
    detail: 'A auditoria deve ser executada no ambiente OpenClaw.'
  });
});

router.post('/run-full-audit', async (_req, res) => {
  return res.status(410).json({
    error: 'Auto-auditoria local removida do gateway.',
    detail: 'A auditoria completa deve ser executada no ambiente OpenClaw.'
  });
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

export default router;
