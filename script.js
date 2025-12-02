let currentBase64 = "";
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

document.getElementById("btnUpload").onclick = () => {
    document.getElementById("inputFile").click();
};

document.getElementById("inputFile").onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        currentBase64 = reader.result;
        document.getElementById("preview").src = currentBase64;
        document.getElementById("preview").style.display = "block";
        await processImage();
    };
    reader.readAsDataURL(file);
};

function extract(text, regex, fallback = "") {
    const m = text.match(regex);
    return m ? m[1].trim() : fallback;
}

async function processImage() {
    progressBar.value = 10;
    progressText.textContent = "Analisando imagem...";

    const worker = Tesseract.createWorker({
        logger: m => {
            if (m.status && m.progress) {
                progressBar.value = Math.round(m.progress * 80 + 10);
                progressText.textContent = m.status + " — " + Math.round(m.progress*100) + "%";
            }
        }
    });

    await worker.load();
    await worker.loadLanguage("por");
    await worker.initialize("por");

    const result = await worker.recognize(currentBase64);
    await worker.terminate();

    const text = result.data.text;

    document.getElementById("campo_nome").value =
        extract(text, /Benefici[aá]rio\s*([\s\S]*?)\n/, "");

    document.getElementById("campo_cpf").value =
        extract(text, /CPF\s*[:\-]?\s*([\d\.\-]+)/);

    document.getElementById("campo_produto").value =
        extract(text, /Produto\s*([\s\S]*?)\n/, "");

    document.getElementById("campo_qtd").value =
        extract(text, /Quantidade\s*[:\-]?\s*([\d,\.]+)/);

    document.getElementById("campo_endereco").value =
        extract(text, /ENTREGUE EM[\s\S]*?NA:\s*(.*)/, "");

    document.getElementById("campo_data").value =
        extract(text, /Data\s*[:\-]?\s*([\d\/]+)/);

    document.getElementById("campo_atendente").value =
        extract(text, /Atendente\s*([\s\S]*?)\n/, "");

    document.getElementById("campo_numdoc").value =
        extract(text, /N[oº]\s*([\d\/]+)/);

    document.getElementById("campo_assinatura").value =
        text.includes("Ass.") ? "ok" : "não identificado";

    progressBar.value = 100;
    progressText.textContent = "Processo concluído!";
}

document.getElementById("btnEnviar").onclick = async () => {
    const payload = {
        nome: campo_nome.value,
        cpf: campo_cpf.value,
        produto: campo_produto.value,
        qtd: campo_qtd.value,
        endereco: campo_endereco.value,
        data: campo_data.value,
        atendente: campo_atendente.value,
        numdoc: campo_numdoc.value,
        assinatura: campo_assinatura.value
    };

    await fetch("SUA_URL_DO_APPSCRIPT_AQUI", {
        method: "POST",
        body: JSON.stringify(payload)
    });

    alert("Enviado para a planilha!");
};

