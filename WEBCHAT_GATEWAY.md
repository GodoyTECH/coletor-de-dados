# WebChat ↔ Gateway ↔ OpenClaw (sem WhatsApp)

Arquitetura:

- Frontend (Netlify)
- Backend Gateway (Render)
- OpenCloud/OpenClaw como serviço (HTTP)

## Estrutura

- `backend/server.js`
- `backend/routes/agent.js`
- `backend/services/callAgent.js`
- `backend/services/audio.js`
- `backend/services/storage.js`
- `backend/.env.example`
- `frontend/src/components/ChatWidget.jsx`
- `frontend/src/api.js`
- `frontend/.env.example`

## Endpoints

- `POST /agent/chat`
- `POST /agent/upload`
- `POST /agent/audio`
- `GET /agent/chat/stream` (SSE simplificado)
- `GET /health`

## Deploy Render (backend)

1. Criar novo **Web Service** no Render apontando para o repo.
2. Root directory: `backend`
3. Build command: `npm install`
4. Start command: `npm start`
5. Variáveis de ambiente:
   - `PORT`
   - `CORS_ORIGIN`
   - `OPENCLAW_BASE_URL`
   - `OPENCLAW_API_KEY`
   - `OPENCLAW_CHAT_PATH`
   - `STORAGE_PATH`
   - `MAX_UPLOAD_MB`

## Deploy Netlify (frontend)

1. Criar site no Netlify com root `frontend`.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Env var:
   - `VITE_API_URL=https://SEU-BACKEND-RENDER`

## Testes Postman

### 1) Chat
`POST /agent/chat`
```json
{
  "sessionId": "sess_manual_1",
  "message": "Olá, teste",
  "attachments": []
}
```

### 2) Upload
`POST /agent/upload` (multipart)
- key: `file` (arquivo)

### 3) Áudio
`POST /agent/audio` (multipart)
- key: `sessionId` = `sess_manual_1`
- key: `audio` = arquivo de áudio

### 4) Erro de conexão
- Definir `OPENCLAW_BASE_URL` inválida e validar retorno 502 em `/agent/chat`.

## Escalabilidade (futuro)

- Trocar storage local por S3/R2/GCS.
- Trocar SSE simples por streaming real (WebSocket ou proxy chunked).
- Fila para jobs de OCR/transcrição (BullMQ + Redis).
- Observabilidade (logs estruturados + tracing + métricas).
- Rate limit e autenticação JWT no gateway.
