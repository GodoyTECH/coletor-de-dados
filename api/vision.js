// =========================
//  API VISION (Render)
// =========================

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

// IMPORTAÇÃO CORRETA DA SDK NOVA
const OpenAI = require("openai").default;

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

// Carrega API Key do Render
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------------------------
//  OCR + EXTRAÇÃO COMPLETA
// ---------------------------
app.post("/api/vision", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nenhuma imagem recebida." });
    }

    // CHAMADA OFICIAL GPT-4.1 COM IMAGEM
    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: "Você é um extrator de dados altamente preciso."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extraia exatamente estes campos: beneficiario, cpf, atendente, produto, quantidade, endereco, data, assinatura, numeroDocumento, obs. OBS = anotações feitas à mão na imagem. Responda em JSON."
            },
            {
              type: "image_url",
              image_url: imageBase64
            }
          ]
        }
      ]
    });

    // Texto retornado
    const text = response.choices[0].message.content;

    // Tenta converter para JSON
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    return res.json(json);

  } catch (err) {
    console.error("Erro Vision API:", err);
    return res.status(500).json({
      error: "Erro na IA",
      details: err.message
    });
  }
});

// Porta Render
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`🔥 API Vision rodando na porta ${PORT}`)
);
