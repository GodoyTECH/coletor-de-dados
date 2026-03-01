# Social Coletor — refactor seguro (Netlify + Render + OpenClaw)

Este repositório foi ajustado para manter **somente** o que pertence ao app web:

- UI do chat/PWA (Netlify)
- chamadas HTTP para o backend (Render)
- gateway/autenticação/proxy para encaminhar ao **Madruguinha REAL** (OpenClaw)

## O que foi movido para `legacy_lixo/`

Para evitar conflito entre lógica antiga e o agente real, nenhum arquivo foi apagado.
Tudo suspeito/duplicado foi movido para `legacy_lixo/` para revisão posterior.

### Itens movidos

- `legacy_lixo/backend/routes/agent.js`
  - Rota antiga com OCR local, auditoria automática, geração de relatório e ações destrutivas.
- `legacy_lixo/backend/services/manualExtract.js`
  - Extração OCR via OCR.space dentro do repo.
- `legacy_lixo/shared/madruguinhaCore.js`
  - Engine de intents locais para simular comportamentos do agente no próprio repo.
- `legacy_lixo/root_scripts/ocr.js`
  - Script OCR legado no front raiz.
- `legacy_lixo/root_scripts/painel.js`
  - Auto-auditoria contínua/loop de correções no painel legado.

## Fluxo oficial após o refactor

1. Frontend (`chat.html`) envia `fetch` para URL do Render (`VITE_API_URL` ou fallback de produção).
2. Backend Render valida/organiza payload.
3. Backend Render encaminha para OpenClaw usando `GATEWAY_URL` + `GATEWAY_TOKEN`.
4. Resposta do Madruguinha REAL volta para o chat.

## Observações

- Endpoints legados de auditoria/validação local continuam expostos apenas como `410 Gone` para não quebrar consumidores antigos e sinalizar migração.
- Se quiser limpeza definitiva no futuro, remova a pasta `legacy_lixo/` após validação completa em produção.
