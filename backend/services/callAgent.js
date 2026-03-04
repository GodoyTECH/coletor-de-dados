import axios from "axios";
import https from "https";

// Reutiliza conexão TLS (reduz falhas de handshake)
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30_000,
  timeout: 120_000
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableNetworkError(err) {
  const msg = String(err?.message || "");
  const code = err?.code;

  // Erros típicos de rede/TLS/DNS intermitente
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    msg.includes("socket disconnected before secure TLS connection was established") ||
    msg.includes("Client network socket disconnected") ||
    msg.includes("TLS") ||
    msg.includes("timeout")
  );
}

/**
 * callAgent — robusto
 */
export async function callAgent({
  sessionId,
  message,
  attachments = [],
  metadata = {},
  systemPrompt = ""
}) {
  const baseUrl = process.env.GATEWAY_URL;
  const apiKey = process.env.GATEWAY_TOKEN;
  const agentModel =
    process.env.GATEWAY_AGENT_MODEL || `agent:${process.env.OPENCLAW_AGENT_ID || "madruguinha"}`;
  const chatPath = process.env.OPENCLAW_CHAT_PATH || "/v1/chat/completions";
  const timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS || 120000);

  // Retries (padrão 3)
  const maxRetries = Number(process.env.GATEWAY_RETRIES || 3);

  if (!baseUrl) throw new Error("GATEWAY_URL não configurado");
  if (!apiKey) throw new Error("GATEWAY_TOKEN não configurado");

  const url = `${baseUrl.replace(/\/$/, "")}${chatPath}`;

  const headers = {
    "Content-Type": "application/json",
    ...(apiKey
      ? {
          Authorization: `Bearer ${apiKey}`,
          "X-OpenClaw-Gateway-Token": apiKey
        }
      : {})
  };

  const payload = {
    model: agentModel,
    user: sessionId, // importante: se sessionId muda entre devices, muda a sessão
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      {
        role: "user",
        content: `${message}${
          attachments?.length ? `\n\n[attachments]: ${JSON.stringify(attachments)}` : ""
        }`
      }
    ],
    // opcional: ajuda alguns gateways a manterem consistência
    metadata
  };

  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      console.debug("[gateway:request]", {
        url,
        attempt,
        timeoutMs
      });

      const response = await axios.post(url, payload, {
        timeout: timeoutMs,
        headers,
        httpsAgent,
        // força IPv4 (opcional, mas costuma estabilizar)
        family: Number(process.env.GATEWAY_IP_FAMILY || 4)
      });

      console.debug("[gateway:response]", {
        url,
        attempt,
        status: response.status,
        timingMs: Date.now() - start
      });

      const reply =
        response.data?.reply ??
        response.data?.message ??
        response.data?.choices?.[0]?.message?.content ??
        "";

      return {
        reply,
        metadata: response.data?.metadata ?? { upstreamStatus: response.status }
      };
    } catch (err) {
      lastErr = err;

      console.debug("[gateway:error]", {
        url,
        attempt,
        status: err.response?.status,
        code: err.code,
        timingMs: Date.now() - start,
        message: err.message
      });

      const status = err.response?.status;
      // Se respondeu HTTP 4xx (ex: 401/403), não adianta retry
      if (status && status >= 400 && status < 500) break;

      if (!isRetryableNetworkError(err)) break;

      // backoff: 300ms, 900ms, 1800ms...
      const wait = 300 * Math.pow(2, attempt);
      await sleep(wait);
    }
  }

  const status = lastErr?.response?.status;
  const data = lastErr?.response?.data;
  const msg =
    data?.error?.message || data?.error || lastErr?.message || "Falha ao chamar agente";

  throw new Error(`callAgent failed${status ? ` (${status})` : ""}: ${msg}`);
}
