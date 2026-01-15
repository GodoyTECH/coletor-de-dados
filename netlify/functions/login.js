const { createToken, hashPassword, timingSafeEqual } = require('./_auth');

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

  const adminUser = process.env.ADMIN_USER;
  const adminPassHash = process.env.ADMIN_PASS_HASH;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminUser || !adminPassHash || !jwtSecret) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Configuração do servidor ausente' })
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

  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');

  if (!username || !password) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Usuário e senha são obrigatórios' })
    };
  }

  const matchesUser = timingSafeEqual(username, adminUser);
  const inputHash = hashPassword(password);
  const matchesPass = timingSafeEqual(inputHash, adminPassHash);

  if (!matchesUser || !matchesPass) {
    return {
      statusCode: 401,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ success: false, error: 'Credenciais inválidas' })
    };
  }

  const token = createToken({ sub: username }, jwtSecret);
  return {
    statusCode: 200,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ success: true, token })
  };
};
