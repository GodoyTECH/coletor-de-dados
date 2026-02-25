# Chat UI v2 - Madruguinha

Novo chat UI responsivo e imersivo para o Social Coletor.

## 🚀 Quick Start

### Variáveis de Ambiente

**Frontend (Netlify):**
```
VITE_API_URL=https://coletor-de-dados-1.onrender.com
```

**Backend (Render):**
```
GATEWAY_URL=https://godoy-ipx1800e2.tail582c99.ts.net
GATEWAY_TOKEN=<token_do_gateway>
GATEWAY_AGENT_MODEL=agent:madruguinha
CORS_ORIGIN=https://scoletor.netlify.app
PORT=8080
```

### Testar Local

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
PORT=8080 npm start
```

### Testar Integração

```bash
# 1. Testar Gateway direto
curl -X POST https://godoy-ipx1800e2.tail582c99.ts.net/v1/chat/completions \
  -H "Authorization: Bearer <GATEWAY_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"model":"agent:madruguinha","messages":[{"role":"user","content":"teste"}]}'

# 2. Testar Backend /health
curl https://coletor-de-dados-1.onrender.com/health

# 3. Testar Chat endpoint
curl -X POST https://coletor-de-dados-1.onrender.com/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","message":"oi","name":"Teste"}'
```

## ✨ Features

### UI/UX
- Layout responsivo (mobile + desktop)
- Tema dark/light
- Avatar expressivo do Madruguinha (7 variações)
- Mensagens com timestamp
- Fila de imagens com preview
- Áudio recorder (segurar para gravar)

### Integração Gateway
- Usa `model: agent:madruguinha` no body
- Bearer token no header
- Fila sequencial de imagens (não trava)

### Preview Card (WhatsApp-like)
- Mostra imagem do comprovante
- Campos extraídos do OCR
- Campos duvidosos destacados em laranja
- Ações: Confirmar / Editar / Nova Foto / Pular

### Áudio (STT/TTS)
- STT: Grava áudio → transcreve → envia como texto
- TTS: Responde em áudio se:
  - Usuário pedir ("responde em áudio")
  - Toggle "Voz automática" ligado
- Usa Web Speech API (nativo do navegador)

## 🎭 Avatares Expressivos

Localização: `frontend/public/avatars/`

| Sentimento | Arquivo | Gatilho |
|------------|---------|----------|
| neutral | madruguinha-neutral.svg | padrão |
| happy | madruguinha-happy.svg | obrigado, perfeito, ótimo |
| thinking | madruguinha-thinking.svg | dúvida, como, ? |
| serious | madruguinha-serious.svg | (reservado) |
| warning | madruguinha-warning.svg | urgente, rápido |
| success | madruguinha-success.svg | sucesso, completado |
| error | madruguinha-error.svg | erro, falha, problema |

## 📱 Fluxo de Imagens

1. Usuário anexa 1..N imagens
2. Preview mostra thumbnails
3. Fila processa uma por vez (sequencial)
4. UI mostra "Processando X/Y..."
5. Madruguinha faz OCR + auditoria
6. Se tudo OK → segue sem interromper
7. Se dúvida/baixa confiança → Preview Card

## 🔧 Limitações Conhecidas

- TTS precisa de browser com Web Speech API
- OCR validation requer backend retornar `metadata.needsValidation`
- Áudio STT funciona melhor no Chrome/Edge
- Preview Card precisa de implementação no agente (backend)

## 📂 Estrutura

```
frontend/
├── src/
│   ├── components/
│   │   ├── ChatWidget.jsx    # Componente principal
│   │   ├── ChatWidget.css    # Estilos
│   │   ├── PreviewCard.jsx   # Card de validação
│   │   └── PreviewCard.css
│   ├── avatarMap.js          # Mapeamento de avatares
│   ├── speechUtils.js        # STT/TTS utilities
│   └── api.js                # Chamadas ao backend
└── public/
    └── avatars/              # SVGs dos avatares
```

## 🧪 Testes Manuais

1. **Texto simples:** Enviar "oi" → verificar resposta
2. **3 imagens:** Anexar 3 fotos → verificar fila sequencial
3. **1 imagem falhando:** Simular erro (sem rede) → verificar comportamento
4. **Áudio → Transcrição:** Gravar áudio → verificar transcrição
5. **"Responde em áudio":** Escrever → verificar player

---

Desenvolvido para o Social Coletor / Madruguinha Faz! 🚀
