
/* app.js - Social Coletor
   Comentários em português como se você mesmo tivesse escrito.
   Funções:
   - capturar imagem do input
   - exibir preview
   - executar OCR (tesseract.js)
   - extrair campos com heurísticas
   - permitir editar/confirmar
   - enviar para o webhook (Apps Script)
*/

/* ==========================
   CONFIGURAÇÃO
   ========================== */
/* URL do Apps Script (webhook) - mantenha a sua ou altere aqui */
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx7kh79jJJut8eXLcwb7aOvYgfK0tTzilEbw58_43IEWGPYaPShU_A1hPUCFBXRQs36yg/exec";

/* ==========================
   ELEMENTOS DA PÁGINA
   ========================== */
const inputPhoto = document.getElementById("inputPhoto");
const previewWrap = document.getElementById("previewWrap");
const previewImg = document.getElementById("preview");
const btnRetake = document.getElementById("btnRetake");
const btnProcess = document.getElementById("btnProcess");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const editForm = document.getElementById("editForm");
const results = document.getElementById("results");
const jsonOutput = document.getElementById("jsonOutput");
const btnEnviar = document.getElementById("btnEnviar");
const btnSendAgain = document.getElementById("btnSendAgain");
const btnCancelarEdicao = document.getElementById("btnCancelarEdicao");

let currentBase64 = null;   // guarda imagem atual em dataURL
let lastPayload = null;     // guarda último payload pronto (para reenviar)

/* ==========================
   EVENTOS: seleção da foto
   ========================== */
inputPhoto.addEventListener("change", async (ev) => {
  // Pega o arquivo selecionado
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  // Mostra preview rápido (objeto URL)
  previewImg.src = URL.createObjectURL(file);
  previewWrap.classList.remove("hidden");
  // Esconde formulário de edição e resultados anteriores
  editForm.classList.add("hidden");
  results.classList.add("hidden");
  // Converte arquivo para base64 (com pequena compressão)
  currentBase64 = await fileToBase64(file);
});

/* ==========================
   EVENTO: refazer foto (cancelar)
   ========================== */
btnRetake.addEventListener("click", () => {
  inputPhoto.value = "";
  previewImg.src = "";
  previewWrap.classList.add("hidden");
  editForm.classList.add("hidden");
  results.classList.add("hidden");
  currentBase64 = null;
});

/* ==========================
   EVENTO: processar OCR
   ========================== */
btnProcess.addEventListener("click", async () => {
  if (!currentBase64) return alert("Selecione ou tire uma foto primeiro.");

  // Mostrar barra de progresso
  progressEl.classList.remove("hidden");
  progressText.textContent = "Inicializando OCR (Tesseract)...";
  progressBar.value = 5;

try {
    // Barra de progresso começa
    progressBar.value = 5;
    progressText.textContent = "Iniciando OCR...";

    // Executa OCR diretamente (v5 não usa worker)
    const { data: { text } } = await Tesseract.recognize(
        currentBase64,
        'por',
        {
            logger: m => {
                if (m.status === 'recognizing text' && m.progress !== undefined) {
                    const perc = Math.round(m.progress * 90) + 5;
                    progressBar.value = perc;
                    progressText.textContent = `Reconhecendo — ${Math.round(m.progress * 100)}%`;
                }
            }
        }
    );

    // Atualiza UI ao terminar
    progressBar.value = 100;
    progressText.textContent = "OCR concluído!";




    // Heurísticas para extrair campos do texto OCR
    const extracted = extractFields(text);

    // Prepara payload inicial (usado pra reenviar se necessário)
    lastPayload = {
      nome: extracted.nome || "",
      beneficio: extracted.beneficio || "",
      data: extracted.data || "",
      assinatura: extracted.assinatura || "",
      endereco: extracted.endereco || "",
      telefone: extracted.telefone || "",
      cpf: extracted.cpf || "",
      textoCompleto: text,
      foto: currentBase64
    };

    // Mostrar formulário para revisão pelo usuário antes do envio
    document.getElementById("nome").value = lastPayload.nome;
    document.getElementById("beneficio").value = lastPayload.beneficio;
    document.getElementById("data").value = lastPayload.data;
    document.getElementById("assinatura").value = lastPayload.assinatura;

    // Exibir formulário de edição e esconder preview/progresso
    editForm.classList.remove("hidden");
    previewWrap.classList.add("hidden");
    progressEl.classList.add("hidden");

  } catch (err) {
    progressEl.classList.add("hidden");
    console.error("Erro no OCR:", err);
    alert("Ocorreu um erro no OCR: " + (err.message || err));
  }
});

/* ==========================
   EVENTO: Cancelar edição
   ========================== */
btnCancelarEdicao.addEventListener("click", () => {
  // volta para preview (permite refazer)
  editForm.classList.add("hidden");
  previewWrap.classList.remove("hidden");
});

/* ==========================
   EVENTO: Enviar (após revisão)
   ========================== */
btnEnviar.addEventListener("click", async () => {
  // Monta payload final com os campos revisados pelo usuário
  const payload = {
    nome: document.getElementById("nome").value.trim(),
    beneficio: document.getElementById("beneficio").value.trim(),
    data: document.getElementById("data").value.trim(),
    assinatura: document.getElementById("assinatura").value.trim(),
    textoCompleto: lastPayload ? lastPayload.textoCompleto : "",
    foto: lastPayload ? lastPayload.foto : currentBase64
  };

  try {
    progressEl.classList.remove("hidden");
    progressText.textContent = "Enviando para a planilha...";
    progressBar.value = 75;

    // POST para o Apps Script (webhook)
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Atualiza UI
    progressBar.value = 100;
    progressText.textContent = "Concluído";
    editForm.classList.add("hidden");
    results.classList.remove("hidden");
    jsonOutput.textContent = JSON.stringify(payload, null, 2);

    // Atualiza lastPayload para possível reenvio
    lastPayload = payload;
    alert("Dados enviados com sucesso!");

  } catch (e) {
    progressEl.classList.add("hidden");
    console.error("Erro no envio:", e);
    alert("Erro ao enviar: " + (e.message || e));
  }
});

/* ==========================
   EVENTO: Reenviar último payload
   ========================== */
btnSendAgain.addEventListener("click", async () => {
  if (!lastPayload) return alert("Nenhum envio anterior encontrado.");
  try {
    progressEl.classList.remove("hidden");
    progressText.textContent = "Reenviando dados...";
    progressBar.value = 70;

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastPayload)
    });

    progressBar.value = 100;
    progressText.textContent = "Reenviado com sucesso!";
    alert("Reenviado com sucesso!");
  } catch (e) {
    progressEl.classList.add("hidden");
    console.error("Erro reenviando:", e);
    alert("Erro ao reenviar: " + (e.message || e));
  }
});

/* ==========================
   FUNÇÕES AUXILIARES
   ========================== */

/**
 * fileToBase64(file)
 * - Converte File para dataURL (base64)
 * - Redimensiona se imagem for muito grande (para reduzir upload)
 * - Retorna dataURL (JPEG 0.8)
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // redimensionamento máximo (manter performance)
        const maxDim = 1600;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = w / h;
          if (w > h) { w = maxDim; h = Math.round(maxDim / ratio); }
          else { h = maxDim; w = Math.round(maxDim * ratio); }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * extractFields(text)
 * - Recebe texto bruto do OCR e tenta extrair:
 *   nome, beneficio, data, assinatura, telefone, cpf
 * - Usa regex e heurísticas simples
 */
function extractFields(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const joined = lines.join("\n");

  const patterns = {
    nome: /\bNome[:\-\s]*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'`.\s-]{1,120})/i,
    beneficio: /\b(Benef[ií]cio|Beneficio)[:\-\s]*([^\n]+)/i,
    data: /\b(Data|Dt\.?)[:\-\s]*([0-3]?\d[\/\.\-][01]?\d[\/\.\-]\d{2,4})/i,
    assinatura: /\b(Assinatura|Ass\.?)[:\-\s]*([^\n]+)/i,
    telefone: /(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/i,
    cpf: /(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2})/i
  };

  const result = {};
  try {
    const mNome = joined.match(patterns.nome) || lines.find(l => l.match(/^[A-ZÀ-Ÿ][a-zà-ÿ]+(\s[A-ZÀ-Ÿ][a-zà-ÿ]+)+$/));
    if (mNome) result.nome = (mNome[1] || mNome).trim();

    const mBen = joined.match(patterns.beneficio);
    if (mBen) result.beneficio = (mBen[2] || mBen[1]).trim();

    const mData = joined.match(patterns.data);
    if (mData) result.data = (mData[2] || mData[1]).trim();

    const mAss = joined.match(patterns.assinatura);
    if (mAss) result.assinatura = (mAss[2] || mAss[1]).trim();

    const mTel = joined.match(patterns.telefone);
    if (mTel) result.telefone = mTel[1].trim();

    const mCpf = joined.match(patterns.cpf);
    if (mCpf) result.cpf = mCpf[1].trim();

    // fallback: tenta adivinhar nome nas primeiras linhas
    if (!result.nome) {
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const l = lines[i];
        if (l.split(' ').length >= 2 && /[A-ZÀ-Ÿ]/.test(l[0])) {
          if (!/benefic|data|assinatura|endereço|telefone|cpf|rg/i.test(l)) {
            result.nome = l;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Erro na extração heurística:", e);
  }

  result._lines = lines;
  return result;
}

/* Capitaliza a primeira letra de uma string (helper) */
function capitalize(s) {
  if (!s) return "";
  return s[0].toUpperCase() + s.slice(1);
}
