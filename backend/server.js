import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import agentRoutes from './routes/agent.js';
import { ensureStoragePath } from './services/storage.js';

dotenv.config({ override: true });

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 8080);
const storagePath = ensureStoragePath();

// CORS - permitir todos por enquanto (depois restringir)
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'webchat-openclaw-gateway' });
});

app.use('/files', express.static(path.resolve(storagePath)));
app.use('/agent', agentRoutes);

// API standalone - frontend no Netlify
app.get('/', (_req, res) => {
  res.json({ 
    ok: true, 
    service: 'webchat-openclaw-gateway',
    frontend: 'https://scoletor.netlify.app'
  });
});

app.use((err, _req, res, _next) => {
  console.error('[gateway:error]', err);
  res.status(500).json({ error: 'Erro interno do gateway' });
});

app.listen(port, () => {
  console.log(`[gateway] running on :${port}`);
});
