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

  const execUrl = process.env.EXEC_URL;
  const jwtSecret = process.env.JWT_SECRET;
  const execToken = process.env.EXEC_TOKEN;

  if (!execUrl || !jwtSecret) {
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

  const forwardPayload = {
    action: payload.action,
    data: payload.data || {}
  };

  if (execToken) {
    forwardPayload.token = execToken;
  }

  try {
    const response = await fetch(execUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardPayload)
    });

    const text = await response.text();
    return {
      statusCode: response.status,
      headers: DEFAULT_HEADERS,
      body: text || JSON.stringify({ success: false, error: 'Resposta vazia do servidor' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Falha ao enviar dados', details: error?.message || String(error) })
    };
  }
};
