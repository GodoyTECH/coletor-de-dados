import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import agentRoutes from './routes/agent.js';
import { ensureStoragePath } from './services/storage.js';

dotenv.config({ override: true });

const app = express();
const port = Number(process.env.PORT || 8080);
const storagePath = ensureStoragePath();

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'webchat-openclaw-gateway' });
});

app.use('/files', express.static(path.resolve(storagePath)));
app.use('/agent', agentRoutes);

// Servir frontend estático
const frontendPath = path.resolve('../frontend/dist');
app.use(express.static(frontendPath));
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[gateway:error]', err);
  res.status(500).json({ error: 'Erro interno do gateway' });
});

app.listen(port, () => {
  console.log(`[gateway] running on :${port}`);
  console.log(`[gateway] CORS origin: ${corsOrigin}`);
});
