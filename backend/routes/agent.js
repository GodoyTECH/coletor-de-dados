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
  dest: storagePath,
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024)
  }
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

    const systemPrompt = profile?.systemPrompt || '';
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
