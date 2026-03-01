// URL da API - para produção use o Render
const API_URL = import.meta.env.VITE_API_URL || 'https://coletor-de-dados-1.onrender.com';

function ensureApiUrl() {
  if (!API_URL) throw new Error('VITE_API_URL não configurado');
}

async function parseApiError(res, fallbackLabel) {
  let detail = '';
  try {
    const data = await res.json();
    detail = data?.detail || data?.error || '';
  } catch {
    // ignora parse
  }
  const suffix = detail ? ` - ${detail}` : '';
  throw new Error(`${fallbackLabel} (${res.status})${suffix}`);
}

export async function identifyUser({ sessionId, name }) {
  ensureApiUrl();
  const res = await fetch(`${API_URL}/agent/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, name })
  });
  if (!res.ok) return parseApiError(res, 'identify failed');
  return res.json();
}

export async function sendChat({ sessionId, message, attachments = [], name }) {
  ensureApiUrl();
  const res = await fetch(`${API_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, attachments, name })
  });
  if (!res.ok) return parseApiError(res, 'chat failed');
  return res.json();
}

export async function uploadFile(file) {
  ensureApiUrl();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/agent/upload`, { method: 'POST', body: form });
  if (!res.ok) return parseApiError(res, 'upload failed');
  return res.json();
}

export async function sendAudio({ sessionId, blob, name }) {
  ensureApiUrl();
  const form = new FormData();
  form.append('sessionId', sessionId);
  form.append('audio', blob, 'audio.webm');
  if (name) form.append('name', name);
  const res = await fetch(`${API_URL}/agent/audio`, { method: 'POST', body: form });
  if (!res.ok) return parseApiError(res, 'audio failed');
  return res.json();
}

export async function submitValidated({ sessionId, fields, force = false }) {
  ensureApiUrl();
  const res = await fetch(`${API_URL}/agent/submit-validated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fields, force })
  });
  if (!res.ok) return parseApiError(res, 'submit failed');
  return res.json();
}

export async function auditProducts({ rows }) {
  ensureApiUrl();
  const res = await fetch(`${API_URL}/agent/audit-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows })
  });
  if (!res.ok) return parseApiError(res, 'audit failed');
  return res.json();
}
