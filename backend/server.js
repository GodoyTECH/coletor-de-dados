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

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
// Aceita tanto com ou sem barra no final
const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (como Postman) ou origins permitidas
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
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
  console.log(`[gateway] CORS origin: ${corsOrigin}`);
});
