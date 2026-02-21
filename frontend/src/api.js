const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) throw new Error('VITE_API_URL não configurado');
}

export async function identifyUser({ sessionId, name }) {
  ensureApiUrl();
  const res = await fetch(`${API_URL}/agent/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, name })
  });
  if (!res.ok) throw new Error(`identify failed: ${res.status}`);
  return res.json();
}

export async function sendChat({ sessionId, message, attachments = [], name }) {
  ensureApiUrl();
  const res = await fetch(`${API_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, attachments, name })
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  return res.json();
}

export async function uploadFile(file) {
  ensureApiUrl();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/agent/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

export async function sendAudio({ sessionId, blob, name }) {
  ensureApiUrl();
  const form = new FormData();
  form.append('sessionId', sessionId);
  form.append('audio', blob, 'audio.webm');
  if (name) form.append('name', name);
  const res = await fetch(`${API_URL}/agent/audio`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`audio failed: ${res.status}`);
  return res.json();
}
