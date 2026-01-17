const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_FIELDS = [
  'beneficiario',
  'cpf',
  'numeroDocumento',
  'produto',
  'quantidade',
  'data',
  'atendente',
  'endereco',
  'fornecedor',
  'observacoes'
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: DEFAULT_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Método não permitido' })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'GEMINI_API_KEY não configurada' })
    };
  }

  let payload = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'JSON inválido', details: error?.message || String(error) })
    };
  }

  const text = String(payload.text || '').trim();
  if (!text) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Texto ausente para estruturação' })
    };
  }

  const prompt = `Você é um assistente que extrai dados de OCR em português.
Retorne SOMENTE um JSON válido com as chaves exatamente:
${ALLOWED_FIELDS.join(', ')}.
Se algum campo não existir, retorne string vazia.
Texto OCR:\n${text}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.9,
            topK: 20,
            maxOutputTokens: 512,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ success: false, error: 'Falha ao chamar Gemini', details: errorText })
      };
    }

    const result = await response.json();
    const contentText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!contentText) {
      return {
        statusCode: 500,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ success: false, error: 'Resposta vazia do Gemini' })
      };
    }

    let data = {};
    try {
      data = JSON.parse(contentText);
    } catch (error) {
      return {
        statusCode: 500,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ success: false, error: 'JSON inválido retornado pela IA', details: error?.message || String(error) })
      };
    }

    const normalized = ALLOWED_FIELDS.reduce((acc, key) => {
      acc[key] = typeof data[key] === 'string' ? data[key] : '';
      return acc;
    }, {});

    return {
      statusCode: 200,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: true, data: normalized })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Erro interno ao processar IA', details: error?.message || String(error) })
    };
  }
};
