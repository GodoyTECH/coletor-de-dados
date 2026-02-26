# RELATÓRIO DE AUDITORIA - WebChat Coletor de Dados

**Data:** 2026-02-26  
**Branch:** `chore/webchat-consolidation`  
**Repo:** GodoyTECH/coletor-de-dados

---

## A) INVENTÁRIO DE "WEBCHAT" NO REPO

### Arquivos HTML identificados:

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `index.html` | ✅ App Principal | Coleta via imagem + envio planilha |
| `chat.html` | ✅ WebChat | Chat Madruguinha (aponta para assets/) |
| `painel.html` | ✅ Admin | Painel administrativo |
| `frontend/index.html` | ⚠️ Fonte | Entry do React (não serve diretamente) |

### Assets:

| Caminho | Status |
|---------|--------|
| `assets/index-DXYjBaiD.js` | ✅ Build atual (155KB) |
| `assets/index-DYwp09Ob.css` | ✅ CSS (9.5KB) |

### Avatares:

| Caminho | Qtd | Formato |
|---------|-----|---------|
| `avatars/` (raiz) | 6 | PNG |
| `frontend/public/avatars/` | 6 + 7 SVG | PNG + SVG |

---

## B) QUADRO DE VERSÕES (por Git)

| Versão | Commit | Descrição | Arquivos-chave |
|--------|--------|-----------|----------------|
| V1 | ~7295ac0 | WebChat inicial como `/chat.html` | chat.html, assets/ |
| V2 | ea4151b | **PERFEITA** - Nova UI com avatares, fila imagens, áudio | ChatWidget.jsx, avatarMap.js |
| V3 | 1444a82 | PreviewCard + STT/TTS | PreviewCard.jsx, speechUtils.js |
| V4 | 61482b7 | Merge V2+V3 completo | tudo em `frontend/src/` |
| V5 | 50c6c93 | Consolidação - remove duplicados | Limpeza |
| V6 | 74f4505 | Vite config + build novo | vite.config.js, assets atualizados |

---

## C) ESTRATURA-ALVO (FRONTEND)

```
frontend/
├── src/
│   ├── components/
│   │   ├── ChatWidget.jsx     ✅ 19KB
│   │   ├── ChatWidget.css     ✅ 10KB
│   │   ├── PreviewCard.jsx    ✅ 2KB
│   │   └── PreviewCard.css    ✅ 2KB
│   ├── avatarMap.js           ✅ 1.7KB
│   ├── speechUtils.js         ✅ 2.4KB
│   ├── api.js                 ✅ 1.7KB
│   └── main.js                ✅ 214B
└── public/
    └── avatars/               ✅ 6 PNGs + 7 SVGs
```

**Status:** Estrutura completa ✅

---

## D) PROBLEMAS IDENTIFICADOS

### 1. Netlify não está buildando do `frontend/`
- `netlify.toml` não indica para buildar o frontend
- Os assets estão sendo copiados manualmente (atualmente em `assets/`)
- **Solução:** Configurar netlify.toml para buildar automaticamente

### 2. Backend (Render) está offline/travando
- `/health` timeout
- **Solução:** Verificar status do Render

### 3. Versão no Netlify desatualizada
- `chat.html` no Netlify ainda pointing para `/src/main.js` (old)
- **Solução:** Trigger new deploy

---

## E) PRINT'S

⚠️ **Pendente:** O backend do Render está offline. Não foi possível gerar screenshots do chat funcionando.

**Alternativa:** Podemos testar local com:
```bash
cd backend && npm start  # porta 8080
cd frontend && npm run dev  # porta 3001
```

---

## F) PRÓXIMOS PASSOS (aprovação)

1. ⏳ **Aguardando aprovação** do relatório acima
2. Trigger deploy no Netlify (após aprovado)
3. Configurar `netlify.toml` para buildar do `frontend/`
4. Testar local e gerar screenshots
5. Limpar assets duplicados

---

## G) RESUMO

| Item | Status |
|------|--------|
| Código ( fontefrontend/src/) | ✅ Completo |
| Assets (build) | ✅ Atual |
| chat.html | ✅ Aponta para assets corretos |
| Avatares | ✅ 6 PNGs |
| Backend | ⚠️ Offline (Render) |
| Deploy Netlify | ⚠️ Desatualizado |

**Conclusão:** O código está pronto. Falta deploy e validação.
