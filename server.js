// ============================================
//  BACKEND — PROCESSAMENTO SEGURO COM OPENAI
// ============================================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";

// 🔒 SUA CHAVE FICA AQUI (seguro)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

// ============================================
//  ENDPOINT /api/vision
// ============================================
app.post("/api/vision", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Imagem não recebida" });
    }

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",   // RÁPIDO E BARATO — pode trocar por gpt-4o
      messages: [
        {
          role: "system",
          content:
            "Você é um extrator de dados de documentos. Sempre responda APENAS JSON válido."
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Extraia todos os dados do documento." },
            {
              type: "input_image",
              image_url: imageBase64
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doc_data",
          schema: {
            type: "object",
            properties: {
              beneficiario: { type: "string" },
              cpf: { type: "string" },
              atendente: { type: "string" },
              produto: { type: "string" },
              quantidade: { type: "string" },
              endereco: { type: "string" },
              data: { type: "string" },
              numeroDocumento: { type: "string" },
              observacoes: { type: "string" }
            },
            required: []
          }
        }
      }
    });

    const json = JSON.parse(result.choices[0].message.content);

    res.json({ ok: true, data: json });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao processar imagem" });
  }
});

// ============================================
//  INICIAR SERVIDOR
// ============================================
app.listen(3000, () => console.log("API rodando em http://localhost:3000"));
