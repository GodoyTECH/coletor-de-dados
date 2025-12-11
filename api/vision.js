// =========================
//  API VISION (Render)
// =========================

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));

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

    // Chamada ao modelo Vision
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content:
            "Você é um extrator de dados extremamente preciso. Extraia SOMENTE os campos que existirem na imagem."
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extraia exatamente estes campos: beneficiario, cpf, atendente, produto, quantidade, endereco, data, assinatura, numeroDocumento, obs. OBS = anotações feitas à mão na imagem."
            },
            {
              type: "input_image",
              image_url: imageBase64
            }
          ]
        }
      ]
    });

    let text = response.output[0].content[0].text;

    // Tentamos converter para JSON automaticamente
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    return res.json(json);
  } catch (err) {
    console.error("Erro Vision API:", err);
    return res.status(500).json({ error: "Erro na IA", details: err.message });
    
  }
});

// Porta Render
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🔥 API Vision rodando na porta ${PORT}`));
