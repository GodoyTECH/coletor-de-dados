
// app.js - Coletor de Beneficiados
// ------------------------------------------------------------------
// Lembrete: já coloquei a sua URL do Apps Script aqui (webhook)
// Troque se quiser por outra.
// ------------------------------------------------------------------

const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx7kh79jJJut8eXLcwb7aOvYgfK0tTzilEbw58_43IEWGPYaPShU_A1hPUCFBXRQs36yg/exec";

const inputPhoto = document.getElementById("inputPhoto");
const previewWrap = document.getElementById("previewWrap");
const previewImg = document.getElementById("preview");
const btnRetake = document.getElementById("btnRetake");
const btnProcess = document.getElementById("btnProcess");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const results = document.getElementById("results");
const jsonOutput = document.getElementById("jsonOutput");
const btnSendAgain = document.getElementById("btnSendAgain");

let currentBase64 = null;
let lastPayload = null;

// When user selects or takes a photo
inputPhoto.addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  // Show preview
  previewImg.src = URL.createObjectURL(file);
  previewWrap.classList.remove("hidden");
  results.classList.add("hidden");
  currentBase64 = await fileToBase64(file);
});

// Retake
btnRetake.addEventListener("click", () => {
  inputPhoto.value = "";
  previewImg.src = "";
  previewWrap.classList.add("hidden");
  currentBase64 = null;
  results.classList.add("hidden");
});

// Process and send
btnProcess.addEventListener("click", async () => {
  if (!currentBase64) return alert("Selecione ou tire uma foto primeiro.");

  // Show progress UI
  progressEl.classList.remove("hidden");
  progressText.textContent = "Inicializando OCR (Tesseract)...";
  progressBar.value = 5;

  try {
    // Run OCR with Tesseract
    const worker = Tesseract.createWorker({
      logger: m => {
        // map progress to progress bar
        if (m.status && m.progress !== undefined) {
          const perc = Math.round(m.progress * 90) + 5;
          progressBar.value = perc;
          progressText.textContent = `${capitalize(m.status)} — ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    await worker.load();
    await worker.loadLanguage('por');
    await worker.initialize('por');

    // Recognize
    const { data: { text } } = await worker.recognize(currentBase64);
    await worker.terminate();

    progressBar.value = 95;
    progressText.textContent = "Extraindo campos...";

    // Extract fields with heuristics
    const extracted = extractFields(text);

    // Prepare payload (include base64 image)
    const payload = {
      nome: extracted.nome || "",
      beneficio: extracted.beneficio || "",
      data: extracted.data || "",
      assinatura: extracted.assinatura || "",
      endereco: extracted.endereco || "",
      telefone: extracted.telefone || "",
      cpf: extracted.cpf || "",
      textoCompleto: text,
      foto: currentBase64 // Apps Script espera base64 data URL
    };

    lastPayload = payload;

    progressBar.value = 98;
    progressText.textContent = "Enviando para a planilha...";

    // Post to webhook (Apps Script)
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    progressBar.value = 100;
    progressText.textContent = "Concluído";

    // Show results to user
    jsonOutput.textContent = JSON.stringify(payload, null, 2);
    results.classList.remove("hidden");
    progressEl.classList.add("hidden");
    alert("Enviado com sucesso para a planilha!");

  } catch (err) {
    progressEl.classList.add("hidden");
    console.error(err);
    alert("Ocorreu um erro: " + (err.message || err));
  }
});

// allow re-send same payload quickly
btnSendAgain.addEventListener("click", async () => {
  if (!lastPayload) return alert("Nenhum envio anterior encontrado.");
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastPayload)
    });
    alert("Reenviado com sucesso!");
  } catch (e) {
    alert("Erro ao reenviar: " + e.message);
  }
});

/* -------------------------
   Helpers
   ------------------------- */

function fileToBase64(file) {
  // Small compression step: convert to canvas and export JPEG with quality 0.8
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // draw on canvas, resize if very large
        const maxDim = 1600;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = w / h;
          if (w > h) {
            w = maxDim; h = Math.round(maxDim / ratio);
          } else {
            h = maxDim; w = Math.round(maxDim * ratio);
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // export as JPEG data URL (80% quality)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function extractFields(text) {
  // normalize
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const joined = lines.join("\n");

  // simple regex patterns
  const patterns = {
    nome: /\bNome[:\-\s]*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'`.\s-]{1,80})/i,
    beneficio: /\b(Benef[ií]cio|Beneficio)[:\-\s]*([^\n]+)/i,
    data: /\b(Data|Dt\.?)[:\-\s]*([0-3]?\d[\/\.\-][01]?\d[\/\.\-]\d{2,4})/i,
    assinatura: /\b(Assinatura|Ass\.?)[:\-\s]*([^\n]+)/i,
    telefone: /(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/i,
    cpf: /(\d{3}\.?\d{3}\.?\d{3}[-\s]?\d{2})/i
  };

  const result = {};

  // Try patterns
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

    // fallback: try to guess name from first lines (common)
    if (!result.nome) {
      for (let i=0;i<Math.min(lines.length,6);i++){
        const l = lines[i];
        if (l.split(' ').length >=2 && /[A-ZÀ-Ÿ]/.test(l[0])) {
          // ignore lines that contain words "Benefício" etc.
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

  // attach raw text & lines
  result._lines = lines;
  return result;
}

function capitalize(s){
  if(!s) return "";
  return s[0].toUpperCase() + s.slice(1);
}
