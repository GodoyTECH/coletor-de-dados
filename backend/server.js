import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import agentRoutes from './routes/agent.js';
import { ensureStoragePath } from './services/storage.js';

dotenv.config({ override: true });

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT || 8080);
const storagePath = ensureStoragePath();

// CORS - permitir todos por enquanto (depois restringir)
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check com teste real do Gateway
app.get('/health', async (_req, res) => {
  const gatewayUrl = process.env.GATEWAY_URL;
  const gatewayToken = process.env.GATEWAY_TOKEN;
  const agentModel = process.env.GATEWAY_AGENT_MODEL || process.env.OPENCLAW_AGENT_ID || 'main';

  const health = {
    render: 'ok',
    timestamp: new Date().toISOString()
  };

  // Testar Gateway se configurado
  if (gatewayUrl && gatewayToken) {
    const start = Date.now();
    try {
      const gatewayHealthUrl = `${gatewayUrl}/v1/chat/completions`;
      console.debug('[gateway:health:request]', {
        url: gatewayHealthUrl,
        timeoutMs: 10000
      });

      const response = await axios.post(
        gatewayHealthUrl,
        {
          model: agentModel,
          messages: [{ role: 'user', content: 'ping' }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${gatewayToken}`,
            'X-OpenClaw-Gateway-Token': gatewayToken
          },
          timeout: 10000
        }
      );
      console.debug('[gateway:health:response]', {
        url: gatewayHealthUrl,
        status: response.status,
        timingMs: Date.now() - start
      });
      health.gateway = {
        reachable: true,
        latencyMs: Date.now() - start,
        status: response.status === 200 ? 'ok' : 'error',
        responsePreview: response.data?.choices?.[0]?.message?.content?.substring(0, 50) || ''
      };
    } catch (err) {
      console.debug('[gateway:health:error]', {
        url: `${gatewayUrl}/v1/chat/completions`,
        status: err.response?.status,
        code: err.code,
        timingMs: Date.now() - start,
        message: err.message
      });
      health.gateway = {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err.message || 'Gateway unreachable'
      };
      health.render = 'degraded';
    }
  }

  const statusCode = health.render === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
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
