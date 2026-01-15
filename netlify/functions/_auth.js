const crypto = require('crypto');

const base64UrlEncode = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const sign = (data, secret) =>
  crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const createToken = (payload, secret, expiresInSeconds = 60 * 60) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const verifyToken = (token, secret) => {
  if (!token) return { valid: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'format' };
  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (signature !== expected) return { valid: false, reason: 'signature' };
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
  } catch (error) {
    return { valid: false, reason: 'payload' };
  }
};

const hashPassword = (password) =>
  crypto.createHash('sha256').update(password || '').digest('hex');

const timingSafeEqual = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

module.exports = {
  createToken,
  verifyToken,
  hashPassword,
  timingSafeEqual
};
