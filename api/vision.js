app.post("/api/vision", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nenhuma imagem recebida." });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: "Você é um extrator de dados extremamente preciso. Extraia SOMENTE os campos que existirem."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extraia exatamente estes campos: beneficiario, cpf, atendente, produto, quantidade, endereco, data, assinatura, numeroDocumento, obs. OBS = anotações feitas à mão na imagem."
            },
            {
              type: "image_url",
              image_url: imageBase64
            }
          ]
        }
      ]
    });

    const text = response.choices[0].message.content;

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
app.listen(PORT, () => console.log(`🔥 API Vision rodando na porta ${PORT}`));
