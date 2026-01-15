const { verifyToken } = require('./_auth');

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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

  const ocrKey = process.env.OCR_KEY;
  const jwtSecret = process.env.JWT_SECRET;
  const ocrUrl = process.env.OCR_URL || 'https://api.ocr.space/parse/image';

  if (!ocrKey || !jwtSecret) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Configuração do servidor ausente' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/Bearer\s+/i, '').trim();
  const verification = verifyToken(token, jwtSecret);
  if (!verification.valid) {
    return {
      statusCode: 401,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Sessão inválida' })
    };
  }

  let payload = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'JSON inválido' })
    };
  }

  const imageDataURL = payload.imageDataURL || '';
  if (!imageDataURL.startsWith('data:image')) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Imagem inválida' })
    };
  }

  try {
    const formData = new FormData();
    formData.append('apikey', ocrKey);
    formData.append('language', 'por');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('isTable', 'true');
    formData.append('OCREngine', '2');
    formData.append('base64Image', imageDataURL);

    const response = await fetch(ocrUrl, {
      method: 'POST',
      body: formData
    });

    const text = await response.text();
    return {
      statusCode: response.status,
      headers: DEFAULT_HEADERS,
      body: text || JSON.stringify({ success: false, error: 'Resposta vazia do OCR' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Falha ao processar OCR', details: error?.message || String(error) })
    };
  }
};
