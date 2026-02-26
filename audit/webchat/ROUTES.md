# ROTAS DO WEBCHAT

Data: 2026-02-25
Repo: GodoyTECH/coletor-de-dados

---

## ROTAS ATUAIS

### Netlify (Frontend)

| Rota | Arquivo/Servido | Status |
|------|-----------------|--------|
| `/` | `index.html` | App principal (coleta) |
| `/chat.html` | `chat.html` → `/assets/` | **Chat** |
| `/chat` | Redirect → `/chat.html` | **Chat** |
| `/chat/*` | Redirect → `/chat.html` | **Chat** |
| `/painel.html` | `painel.html` | Painel admin |

### Arquivos de Build

| Caminho | Conteúdo |
|---------|----------|
| `/assets/index-BjXYvVox.js` | Bundle JS do chat (ANTIGO) |
| `/assets/index-CMp7TsJM.css` | CSS do chat (ANTIGO) |
| `/avatars/*.png` | Avatares do Madruguinha |

---

## ENTRY POINT ATUAL DO CHAT

**Arquivo:** `chat.html` (raiz)

```html
<script type="module" crossorigin src="/assets/index-BjXYvVox.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-CMp7TsJM.css">
```

**Problema:** Aponta para assets antigos (index-BjXYvVox.js), não do `frontend/dist/`

---

## ESTRUTURA IDEAL

### Frontend (Vite/React) - `frontend/`

**Build:**
```bash
cd frontend
npm run build
# Output: frontend/dist/
```

**Entry Point depois do build:**
- `frontend/dist/index.html`
- Serve em: `/` (mas deveria servir em `/chat`)

**Como應該 funcionar:**
1. `frontend/index.html` → entry do React
2. Build → `frontend/dist/`
3. Conteúdo do dist deve ir para `/assets/` na raiz
4. `chat.html` deve apontar para esses assets

---

## PROBLEMAS IDENTIFICADOS

1. **Duplicação de assets:**
   - `/assets/` (raiz) = build antigo
   - `frontend/dist/` = build novo (não está sendo servido)

2. **chat.html pointing to wrong assets:**
   - Aponta para `index-BjXYvVox.js` (antigo)
   - Deveria apontar para assets do `frontend/dist/`

---

## SOLUÇÃO PROPOSTA

### Opção A: Usar chat.html como proxy

Manter `chat.html` apontando para assets na raiz, mas garantir que o build do frontend vá para `/assets/`.

### Opção B: Usar /chat como SPA

Fazer o build do frontend servir em `/chat` via redirects.

### Opção C (Recomendada): Consolidar

1. Fazer build do `frontend/` 
2. Copiar conteúdo de `frontend/dist/` para a raiz (ou para `/assets/`)
3. Atualizar `chat.html` para apontar para assets corretos
4. Remover `backend/frontend/` e `/assets/` antigos

---

## TESTES A FAZER

```bash
# Build frontend
cd frontend && npm run build

# Verificar output
ls frontend/dist/

# Testar localmente
cd frontend/dist && npx serve
```
