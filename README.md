# Social Coletor

Aplicação web para coleta e organização de dados a partir de documentos com OCR, preenchimento automático e envio para planilha/registro administrativo.

## Visão geral
O Social Coletor captura uma imagem do documento, executa OCR, preenche automaticamente os campos do formulário e envia os dados para o backend (Apps Script/planilha), com painel administrativo para consulta e gestão. 

## Arquitetura (alto nível)
- **Frontend (Netlify)**: UI, captura de imagem, OCR via proxy e preenchimento automático.
- **Netlify Functions (server-side)**:
  - `/.netlify/functions/login` para autenticação.
  - `/.netlify/functions/ocr` como proxy seguro para o OCR.
  - `/.netlify/functions/send` como proxy seguro para o Apps Script (exec).
  - `/.netlify/functions/sc-api` para operações do painel administrativo.
  - `/.netlify/functions/config` para expor URL da planilha (não sensível).
- **Apps Script / Exec**: grava e consulta os dados na planilha.

## Principais funcionalidades
- OCR com preenchimento automático de campos.
- Ajuste de imagem (zoom/mover/rotacionar) para facilitar o OCR.
- Envio de registros para a planilha com suporte offline.
- Painel administrativo com dashboard, registros, duplicados e relatórios.

## Tecnologias
- Netlify (Hosting + Functions)
- JavaScript (frontend)
- OCR provider (via proxy)
- Google Apps Script (exec)
- IndexedDB (cache offline)

## Setup e configuração
### Variáveis de ambiente (Netlify)
- `ADMIN_USER`
- `ADMIN_PASS_HASH` (SHA-256 da senha)
- `JWT_SECRET`
- `EXEC_URL`
- `EXEC_TOKEN` (opcional)
- `OCR_KEY`
- `OCR_URL` (opcional, default OCR.Space)
- `SHEET_URL` (URL da planilha para botão "Ver Planilha")
- `APPSCRIPT_URL` e `API_TOKEN` (para `sc-api`)

### Desenvolvimento/local
1) Configure variáveis de ambiente no Netlify (ou `.env` local para functions).
2) Rode um servidor local (ex.: `python -m http.server`) para testar UI.
3) Use o painel e o fluxo de OCR normalmente.

### Deploy Netlify
1) Commit + push.
2) Configure env vars no dashboard do Netlify.
3) Faça o deploy.

## Segurança
As chaves e URLs sensíveis não ficam no frontend. OCR e Exec são acessados somente via Netlify Functions, com validação de token. O frontend não contém segredos.

## Troubleshooting
- **App desatualizado (PWA)**: limpe o cache ou reabra o app após atualização do Service Worker.
- **Falha no login**: verifique `ADMIN_USER`, `ADMIN_PASS_HASH` e `JWT_SECRET`.
- **OCR não responde**: valide `OCR_KEY`/`OCR_URL` e a conectividade do serviço.
