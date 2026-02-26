# INVENTÁRIO - WEBCHATS ENCONTRADOS

Data: 2026-02-25
Repo: GodoyTECH/coletor-de-dados

---

## RESUMO EXECUTIVO

Encontramos **2 webchats** no repo:

| # | Pasta | Status | Stack | Entry Point |
|---|-------|--------|-------|-------------|
| 1 | `frontend/` | **MANTER (CANÔNICO)** | Vite + React | `frontend/index.html` → build → `/assets/` |
| 2 | `backend/frontend/` | **REMOVER** | Static HTML | `index.html`, `madruguinha.html` |

---

## DETALHAMENTO

### WEBCHAT 1 - PERFEITO (frontend/)

**Caminho:** `./frontend/`

**Stack:** Vite + React

**Arquivos do "perfeito":**
```
frontend/
├── src/
│   ├── api.js                 ✅ Chat API
│   ├── avatarMap.js           ✅ Mapeamento de avatares
│   ├── main.js                ✅ Entry React
│   ├── speechUtils.js         ✅ STT/TTS
│   └── components/
│       ├── ChatWidget.jsx     ✅ Componente principal
│       ├── ChatWidget.css     ✅ Estilos
│       ├── PreviewCard.jsx    ✅ Card de validação
│       └── PreviewCard.css    ✅ Estilos do card
└── public/
    └── avatars/               ✅ 7 avatares PNG
        ├── madruga_neutro.png
        ├── madruga_sorriso.png
        ├── madruga_serio.png
        ├── madruga_olhar_lado.png
        ├── madruga_joia.png
        ├── madruga_sorriso_torto.png
        └── (6 SVGs também)
```

**Build:** `npm run build` → `frontend/dist/`

**Entry Point atual:** `frontend/index.html`

**Como é servido no Netlify:**
- Build output vai para `/assets/` na raiz
- `chat.html` na raiz aponta para esses assets
- Rota: `/chat.html`

**Está em uso pelo Netlify:** ✅ SIM (`chat.html`)

**Conflita com app principal:** ❌ NÃO (é rota separada `/chat.html`)

---

### WEBCHAT 2 - ANTIGO (backend/frontend/)

**Caminho:** `./backend/frontend/`

**Stack:** Static HTML (antigo)

**Arquivos:**
```
backend/frontend/
├── dist/
│   ├── index.html           (antigo)
│   ├── madruguinha.html     (antigo)
│   ├── style.css
│   └── assets/
```

**Entry Point:** `madruguinha.html`

**Está em uso pelo Netlify:** ❌ NÃO (não referenciado em redirects)

**Conflita com app principal:** ❌ NÃO (está em backend/, não serve via Netlify)

**Status:** **REMOVER** - Está obsoleto

---

## OUTROS ARQUIVOS ENCONTRADOS

### Na raiz:
- `chat.html` - Entry point do chat atual (aponta para `/assets/`)
- `index.html` - App principal (coleta/formulário)
- `painel.html` - Painel admin

### Assets (raiz):
- `assets/index-BjXYvVox.js` - Build antigo do chat
- `assets/index-CMp7TsJM.css` - CSS antigo

### Backend:
- `backend/server.js` - Servidor Node/Express
- `backend/services/callAgent.js` - Integração Gateway

---

## AÇÃO RECOMENDADA

| Item | Ação | Motivo |
|------|------|--------|
| `frontend/` | **MANTER** | É o "perfeito" com todos os recursos |
| `backend/frontend/` | **REMOVER** | Obsoleto, não está em uso |
| `assets/` (raiz) | **REMOVER** | Build antigo duplicado |
| `chat.html` | **MANTER** | Entry point do chat |
| `frontend/dist/` | **MANTER** | Build output |

---

## PRÓXIMO PASSO

Verificar Fase 2: Rotas e entry points.
