import axios from 'axios';

/**
 * Camada desacoplada para conversar com OpenClaw Gateway via Tailscale.
 * Usa variáveis GATEWAY_* (preferencial) ou OPENCLAW_* (compatibilidade).
 * Endpoint: POST /v1/chat/completions com model: "agent:madruguinha"
 */
export async function callAgent({ sessionId, message, attachments = [], metadata = {}, systemPrompt = '' }) {
  // Priorizar novas variáveis GATEWAY_*
  const baseUrl = process.env.GATEWAY_URL || process.env.OPENCLAW_BASE_URL;
  const apiKey = process.env.GATEWAY_TOKEN || process.env.OPENCLAW_API_KEY;
  const agentModel = process.env.GATEWAY_AGENT_MODEL || `agent:${process.env.OPENCLAW_AGENT_ID || 'madruguinha'}`;
  const chatPath = process.env.OPENCLAW_CHAT_PATH || '/v1/chat/completions';

  if (!baseUrl) throw new Error('GATEWAY_URL não configurado');

  const url = `${baseUrl.replace(/\/$/, '')}${chatPath}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    };

    // Usar modelo "agent:madruguinha" para rotear para o agente correto
    const payload = {
      model: agentModel,
      user: sessionId,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        {
          role: 'user',
          content: `${message}${attachments?.length ? `\n\n[attachments]: ${JSON.stringify(attachments)}` : ''}`
        }
      ]
    };

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
