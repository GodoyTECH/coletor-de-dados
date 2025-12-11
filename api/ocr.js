// ==================================================
//  API OCR — OCR.Space (Plano Grátis)
// ==================================================

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();

// Permite enviar JSON grandes (fotos base64)
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// ==================================================
//  OCR API — Envia imagem para OCR.Space (Free)
// ==================================================

app.post("/api/ocr", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nenhuma imagem recebida." });
    }

    // REMOVE prefixo "data:image/jpeg;base64,"
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // COLOQUE SUA KEY AQUI
    const apiKey = "SUA_API_KEY_AQUI";

    const formData = new URLSearchParams();
    formData.append("apikey", apiKey);
    formData.append("base64Image", "data:image/jpeg;base64," + cleanBase64);
    formData.append("language", "por");
    formData.append("isTable", "true");
    formData.append("scale", "true");
    formData.append("detectOrientation", "true");
    formData.append("OCREngine", "2");

    const response = await axios.post(
      "https://api.ocr.space/parse/image",
      formData,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );

    const data = response.data;

    if (!data || !data.ParsedResults || !data.ParsedResults[0]) {
      return res.status(500).json({ error: "Falha no OCR." });
    }

    const parsedText = data.ParsedResults[0].ParsedText || "";

    return res.json({ text: parsedText });

  } catch (err) {
    console.error("Erro OCR API:", err);
    return res.status(500).json({
      error: "Erro ao processar OCR",
      details: err.message
    });
  }
});

// ==================================================
// Porta Render — APENAS UM BLOCO!
// ==================================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () =>
  console.log(`🔥 API OCR rodando na porta ${PORT}`)
);
