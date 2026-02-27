const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  const expectedUser = process.env.AUTH_USER;
  const expectedPass = process.env.AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Credenciais do servidor ausentes' })
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

  const user = String(payload.user || '').trim();
  const pass = String(payload.pass || '');

  const isValid = user === expectedUser && pass === expectedPass;

  return {
    statusCode: 200,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ success: isValid })
  };
};
