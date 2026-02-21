import axios from 'axios';

/**
 * Camada desacoplada para conversar com OpenCloud/OpenClaw como serviço HTTP.
 * Suporta:
 *  - OPENCLAW_PROTOCOL=openai (default): /v1/chat/completions compatível OpenAI
 *  - OPENCLAW_PROTOCOL=native: endpoint customizado {sessionId,message,...}
 */
export async function callAgent({ sessionId, message, attachments = [], metadata = {}, systemPrompt = '' }) {
  const baseUrl = process.env.OPENCLAW_BASE_URL;
  const apiKey = process.env.OPENCLAW_API_KEY;
  const protocol = (process.env.OPENCLAW_PROTOCOL || 'openai').toLowerCase();
  const chatPath = process.env.OPENCLAW_CHAT_PATH || (protocol === 'openai' ? '/v1/chat/completions' : '/agent/chat');
  const agentId = process.env.OPENCLAW_AGENT_ID || 'main';

  if (!baseUrl) throw new Error('OPENCLAW_BASE_URL não configurado');

  const url = `${baseUrl.replace(/\/$/, '')}${chatPath}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    };

    let payload;
    if (protocol === 'openai') {
      payload = {
        model: 'openclaw',
        user: sessionId,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          {
            role: 'user',
            content: `${message}${attachments?.length ? `\n\n[attachments]: ${JSON.stringify(attachments)}` : ''}`
          }
        ]
      };
      headers['x-openclaw-agent-id'] = agentId;
    } else {
      payload = { sessionId, message, attachments, metadata };
    }

    const response = await axios.post(url, payload, { timeout: 45000, headers });

    const reply =
      response.data?.reply ??
      response.data?.message ??
      response.data?.choices?.[0]?.message?.content ??
      '';

    return {
      reply,
      metadata: response.data?.metadata ?? { upstreamStatus: response.status }
    };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data?.error?.message || data?.error || err.message || 'Falha ao chamar agente';
    throw new Error(`callAgent failed${status ? ` (${status})` : ''}: ${msg}`);
  }
}
