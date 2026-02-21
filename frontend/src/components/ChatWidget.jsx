import React, { useEffect, useMemo, useRef, useState } from 'react';
import { identifyUser, sendChat, uploadFile, sendAudio } from '../api.js';
import './ChatWidget.css';

function getSessionId() {
  const key = 'webchat-session-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `sess_${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ChatWidget() {
  const sessionId = useMemo(() => getSessionId(), []);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Antes de começar, me diga seu nome para eu te atender no fluxo correto.' }
  ]);
  const [name, setName] = useState(() => localStorage.getItem('webchat-user-name') || '');
  const [identified, setIdentified] = useState(() => !!localStorage.getItem('webchat-user-name'));
  const [profileLabel, setProfileLabel] = useState(() => localStorage.getItem('webchat-profile') || 'default');
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('webchat-theme') || 'dark');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileRef = useRef(null);
  const logRef = useRef(null);

  const append = (role, content) => setMessages((prev) => [...prev, { role, content }]);

  useEffect(() => {
    localStorage.setItem('webchat-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (identified && name) {
      localStorage.setItem('webchat-user-name', name);
      localStorage.setItem('webchat-profile', profileLabel);
    }
  }, [identified, name, profileLabel]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function safeCall(fn) {
    try {
      setLoading(true);
      await fn();
    } catch (err) {
      append('system', `Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function onIdentify(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;

    await safeCall(async () => {
      const result = await identifyUser({ sessionId, name: n });
      setIdentified(true);
      setProfileLabel(result.profileId || 'default');
      append('system', `Perfil ativo: ${result.assistantName} (${result.profileId})`);
      append('assistant', `Perfeito, ${n}! Como posso te ajudar hoje?`);
    });
  }

  async function onSendText(e) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || loading) return;
    if (!identified) {
      append('system', 'Informe seu nome primeiro para ativar seu fluxo.');
      return;
    }

    setText('');
    append('user', msg);

    await safeCall(async () => {
      const result = await sendChat({ sessionId, message: msg, name });
      append('assistant', result.reply || '(sem resposta)');
    });
  }

  async function onAttach(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!identified) {
      append('system', 'Informe seu nome antes de enviar arquivos.');
      e.target.value = '';
      return;
    }

    await safeCall(async () => {
      const uploaded = await uploadFile(file);
      append('system', `Arquivo enviado: ${uploaded.originalName}`);
      const result = await sendChat({
        sessionId,
        name,
        message: `Arquivo anexado: ${uploaded.originalName}`,
        attachments: [{ fileUrl: uploaded.fileUrl, name: uploaded.originalName, mimeType: uploaded.mimeType }]
      });
      append('assistant', result.reply || '(sem resposta)');
    });

    e.target.value = '';
  }

  async function toggleRecord() {
    if (!identified) {
      append('system', 'Informe seu nome antes de enviar áudio.');
      return;
    }

    if (!recording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      mediaRecorder.onstop = async () => {
        await safeCall(async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          append('user', '[áudio enviado]');
          const result = await sendAudio({ sessionId, blob, name });
          append('assistant', result.reply || '(sem resposta)');
        });
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      return;
    }

    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className={`chat-page ${theme}`}>
      <div className="chat-shell">
        <header className="chat-header">
          <div className="chat-title">
            <span className="badge" />
            <div>
              <h1>WebChat Assistente</h1>
              <div className="chat-sub">Rápido, responsivo e pronto para produção</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-soft" type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}
            </button>
            <div className="session-pill" title={sessionId}>Sessão: {sessionId}</div>
            <div className="session-pill" title={profileLabel}>Agente: {profileLabel}</div>
          </div>
        </header>

        <main className="chat-log" ref={logRef}>
          {messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              <div className="bubble">{m.role === 'assistant' ? '🤖 ' : m.role === 'user' ? '🧑 ' : 'ℹ️ '}{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="row assistant">
              <div className="bubble typing">🤖 digitando<span>.</span><span>.</span><span>.</span></div>
            </div>
          )}
        </main>

        <footer className="composer">
          {!identified && (
            <form className="input-row" onSubmit={onIdentify}>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Digite seu nome para ativar seu agente"
              />
              <button className="btn" type="submit" disabled={loading}>Confirmar</button>
            </form>
          )}

          <form className="input-row" onSubmit={onSendText}>
            <textarea
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem... (Enter envia · Shift+Enter quebra linha)"
              rows={2}
              disabled={!identified}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSendText(e);
                }
              }}
            />
            <button className="btn" type="submit" disabled={loading}>Enviar</button>
          </form>

          <div className="tools">
            <button className="btn-soft" type="button" onClick={() => fileRef.current?.click()} disabled={loading || !identified}>
              Anexar arquivo
            </button>
            <input ref={fileRef} className="file-input" type="file" onChange={onAttach} />

            <button className="btn-soft" type="button" onClick={toggleRecord} disabled={loading || !identified}>
              {recording ? 'Parar áudio' : 'Gravar áudio'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
