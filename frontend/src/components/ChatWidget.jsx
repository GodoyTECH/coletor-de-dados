import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { identifyUser, sendChat, uploadFile, sendAudio } from '../api.js';
import { getAvatarUrl, getSentimentFromIntent, getSentimentFromStatus } from '../avatarMap.js';
import { speakText, createSpeechRecognizer, getSpeechSupport } from '../speechUtils.js';
import PreviewCard from './PreviewCard.jsx';
import './ChatWidget.css';

// Constantes
const MAX_MESSAGES_IN_MEMORY = 50;

// Utilitários
function getSessionId() {
  const key = 'webchat-session-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `sess_${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

// Componente de Avatar
function Avatar({ sentiment = 'neutral', size = 'normal' }) {
  const sizeClass = size === 'small' ? 'avatar-small' : size === 'large' ? 'avatar-large' : '';
  return (
    <img 
      src={getAvatarUrl(sentiment)} 
      alt="Avatar" 
      className={`madruguinha-avatar ${sizeClass}`}
      onError={(e) => {
        e.target.src = getAvatarUrl('neutral');
      }}
    />
  );
}

// Componente de Preview de Imagens na Fila
function ImageQueue({ files, onRemove, onSend }) {
  if (!files || files.length === 0) return null;
  
  return (
    <div className="image-queue">
      <div className="image-queue-header">
        <span>{files.length} imagem(ns) na fila</span>
        <button type="button" className="btn-small" onClick={onSend}>
          Enviar todas
        </button>
      </div>
      <div className="image-queue-grid">
        {files.map((file, i) => (
          <div key={i} className="image-queue-item">
            <img src={file.preview} alt={`preview-${i}`} />
            <button 
              type="button" 
              className="remove-btn" 
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Componente de Mensagem
function MessageBubble({ message, sentiment }) {
  const time = new Date(message.timestamp || Date.now()).toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const isUser = message.role === 'user';
  const isTranscribed = message.isTranscribed;
  
  return (
    <div className={`row ${message.role}`}>
      {!isUser && <Avatar sentiment={sentiment} size="small" />}
      <div className="bubble-wrapper">
        {!isUser && <span className="avatar-name">Madruguinha</span>}
        <div className={`bubble ${message.role} ${message.status || ''}`}>
          {isTranscribed && <span className="transcribed-tag">🎤 Transcrito</span>}
          {message.content}
          {message.attachments && message.attachments.map((att, i) => (
            <div key={i} className="attachment-preview">
              <img src={att.fileUrl} alt={att.name} />
            </div>
          ))}
        </div>
        <div className="message-meta">
          <span className="time">{time}</span>
          {message.status === 'sending' && <span className="status">enviando...</span>}
          {message.status === 'error' && <span className="status error">erro</span>}
        </div>
      </div>
      {isUser && <div className="user-avatar">🧑</div>}
    </div>
  );
}

// Componente de Input de Áudio
function AudioRecorder({ onSend, disabled }) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onSend(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      
      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      setDuration(0);
      
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Erro ao gravar:', err);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };
  
  const formatDuration = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <button 
      className={`btn-mic ${recording ? 'recording' : ''}`}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      disabled={disabled}
      title="Segure para gravar"
    >
      {recording ? `🎤 ${formatDuration(duration)}` : '🎙️'}
    </button>
  );
}

// Componente de Player de Áudio
function AudioPlayer({ src }) {
  return (
    <audio controls src={src} className="audio-player">
      Seu navegador não suporta áudio.
    </audio>
  );
}

// MAIN COMPONENT
export default function ChatWidget() {
  const sessionId = useMemo(() => getSessionId(), []);
  const [messages, setMessages] = useState([]);
  const [name, setName] = useState(() => localStorage.getItem('webchat-user-name') || '');
  const [identified, setIdentified] = useState(() => !!localStorage.getItem('webchat-user-name'));
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('webchat-theme') || 'dark');
  const [sentiment, setSentiment] = useState('neutral');
  const [imageQueue, setImageQueue] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [settings, setSettings] = useState({
    sound: localStorage.getItem('webchat-sound') !== 'false',
    autoScroll: localStorage.getItem('webchat-autoScroll') !== 'false',
    autoVoice: localStorage.getItem('webchat-autoVoice') === 'true',
  });
  
  // Preview Card state
  const [previewCard, setPreviewCard] = useState(null); // { imageUrl, fields, doubtfulFields }
  
  // Speech state
  const [speechSupported, setSpeechSupported] = useState({ stt: false, tts: false });
  const [speaking, setSpeaking] = useState(false);
  
  const logRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  
  // Efeitos
  useEffect(() => {
    localStorage.setItem('webchat-theme', theme);
  }, [theme]);
  
  useEffect(() => {
    if (identified && name) {
      localStorage.setItem('webchat-user-name', name);
    }
  }, [identified, name]);
  
  useEffect(() => {
    if (settings.autoScroll && logRef.current) {
      logRef.current.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading, settings.autoScroll]);
  
  useEffect(() => {
    localStorage.setItem('webchat-sound', settings.sound);
    localStorage.setItem('webchat-autoScroll', settings.autoScroll);
    localStorage.setItem('webchat-autoVoice', settings.autoVoice);
  }, [settings]);
  
  // Check speech support
  useEffect(() => {
    setSpeechSupported(getSpeechSupport());
  }, []);
  
  // Funções auxiliares
  const append = useCallback((role, content, extra = {}) => {
    setMessages(prev => {
      const newMsgs = [...prev, { 
        role, 
        content, 
        timestamp: Date.now(), 
        ...extra 
      }];
      // Manter only últimas MAX_MESSAGES_IN_MEMORY
      if (newMsgs.length > MAX_MESSAGES_IN_MEMORY) {
        return newMsgs.slice(-MAX_MESSAGES_IN_MEMORY);
      }
      return newMsgs;
    });
  }, []);
  
  const setMessageLoading = (loading) => {
    setLoading(loading);
    if (!loading) {
      setUploadProgress(null);
    }
  };
  
  // Handlers
  async function onIdentify(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    
    setLoading(true);
    try {
      await identifyUser({ sessionId, name: n });
      setIdentified(true);
      append('system', `Olá, ${n}! Como posso te ajudar hoje?`);
    } catch (err) {
      append('system', `Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }
  
  async function sendMessageWithImages(msgText, attachments = []) {
    setMessageLoading(true);
    
    // Processar imagens em sequência
    const uploadedAttachments = [];
    const totalImages = attachments.length;
    
    for (let i = 0; i < attachments.length; i++) {
      setUploadProgress({ current: i + 1, total: totalImages, status: 'uploading' });
      
      try {
        const uploaded = await uploadFile(attachments[i]);
        uploadedAttachments.push({
          fileUrl: uploaded.fileUrl,
          name: uploaded.originalName,
          mimeType: uploaded.mimeType
        });
      } catch (err) {
        append('system', `Erro ao enviar imagem ${i + 1}: ${err.message}`);
        // Continuar com as outras imagens
      }
    }
    
    if (uploadedAttachments.length === 0 && msgText.trim() === '') {
      setMessageLoading(false);
      return;
    }
    
    // Enviar para o agente
    setUploadProgress({ current: totalImages, total: totalImages, status: 'processing' });
    
    try {
      const result = await sendChat({ 
        sessionId, 
        message: msgText || 'Processar imagens anexadas',
        attachments: uploadedAttachments,
        name 
      });
      
      // Detectar sentimento da resposta
      const newSentiment = getSentimentFromIntent(result.reply || '');
      setSentiment(newSentiment);
      
      append('assistant', result.reply || '(sem resposta)', { status: 'success' });
      
      // TTS se solicitado ou auto-voice ligado
      if (shouldSpeak(result.reply || '') && speechSupported.tts) {
        await handleSpeak(result.reply);
      }
      
      // TODO: Detectar se o agente retornou campos para validação
      // Se returned fields com baixa confiança, mostrar PreviewCard
      // if (result.metadata?.needsValidation) {
      //   showPreviewCard(result.metadata.imageUrl, result.metadata.fields, result.metadata.doubtfulFields);
      // }
    } catch (err) {
      append('system', `Erro: ${err.message}`, { status: 'error' });
    } finally {
      setMessageLoading(false);
    }
  }
  
  // Preview Card handlers
  function showPreviewCard(imageUrl, fields, doubtfulFields = []) {
    setPreviewCard({ imageUrl, fields, doubtfulFields });
  }
  
  function hidePreviewCard() {
    setPreviewCard(null);
  }
  
  async function handlePreviewConfirm() {
    if (!previewCard) return;
    hidePreviewCard();
    append('user', '✅ Dados confirmados');
    // Continuar com o fluxo normal
  }
  
  async function handlePreviewEdit() {
    if (!previewCard) return;
    hidePreviewCard();
    append('user', '✏️ Vou editar os dados');
    // TODO: Abrir modal de edição
  }
  
  async function handlePreviewResend() {
    if (!previewCard) return;
    hidePreviewCard();
    append('user', '🔄 Vou enviar uma nova foto');
  }
  
  async function handlePreviewSkip() {
    if (!previewCard) return;
    hidePreviewCard();
    append('user', '⏭️ Pular essa imagem');
  }
  
  // TTS - Speak response
  async function handleSpeak(text) {
    if (!speechSupported.tts || speaking) return;
    
    try {
      setSpeaking(true);
      await speakText(text, { 
        lang: 'pt-BR',
        onEnd: () => setSpeaking(false)
      });
    } catch (err) {
      console.error('TTS error:', err);
      setSpeaking(false);
    }
  }
  
  // Check if user wants audio response
  function shouldSpeak(text) {
    const lower = text.toLowerCase();
    return lower.includes('responde em áudio') || 
           lower.includes('fala comigo') || 
           lower.includes('me liga') ||
           settings.autoVoice;
  }
  
  async function onSendText(e) {
    e.preventDefault();
    const msg = text.trim();
    const files = [...imageQueue];
    
    if ((!msg && files.length === 0) || loading) return;
    if (!identified) {
      append('system', 'Informe seu nome primeiro.');
      return;
    }
    
    setText('');
    append('user', msg, { attachments: files.map(f => ({ fileUrl: f.preview, name: f.name })) });
    
    await sendMessageWithImages(msg, files);
    setImageQueue([]);
  }
  
  // Handler para selecionar arquivos
  function onFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    // Criar previews
    const newFiles = files.map(file => ({
      file,
      name: file.name,
      preview: URL.createObjectURL(file)
    }));
    
    setImageQueue(prev => [...prev, ...newFiles]);
    e.target.value = '';
  }
  
  // Remover imagem da fila
  function removeFromQueue(index) {
    setImageQueue(prev => {
      const newQueue = [...prev];
      URL.revokeObjectURL(newQueue[index].preview);
      newQueue.splice(index, 1);
      return newQueue;
    });
  }
  
  // Enviar fila de imagens
  async function sendQueue() {
    const files = [...imageQueue];
    const msgText = text.trim();
    setText('');
    setImageQueue([]);
    
    if (identified) {
      append('user', msgText || `${files.length} imagem(ns) anexada(s)`);
      await sendMessageWithImages(msgText, files.map(f => f.file));
    }
  }
  
  // Áudio
  async function handleAudioSend(blob) {
    if (!identified) {
      append('system', 'Informe seu nome primeiro.');
      return;
    }
    
    append('user', '[áudio enviado]', { isTranscribed: true });
    setMessageLoading(true);
    
    try {
      const result = await sendAudio({ sessionId, blob, name });
      
      const newSentiment = getSentimentFromIntent(result.reply || '');
      setSentiment(newSentiment);
      
      append('assistant', result.reply || '(sem resposta)');
    } catch (err) {
      append('system', `Erro: ${err.message}`);
    } finally {
      setMessageLoading(false);
    }
  }
  
  // Limpar conversa
  function clearChat() {
    if (window.confirm('Tem certeza que deseja limpar a conversa?')) {
      setMessages([]);
      setImageQueue([]);
      setSentiment('neutral');
    }
  }
  
  // Toggle settings
  function toggleSetting(key) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }
  
  return (
    <div className={`chat-page ${theme}`}>
      <div className="chat-shell">
        {/* HEADER */}
        <header className="chat-header">
          <div className="chat-title">
            <Avatar sentiment={sentiment} size="large" />
            <div>
              <h1>Madruguinha</h1>
              <div className="chat-sub">
                <span className="status-dot online"></span> Online
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button 
              className={`btn-icon ${settings.sound ? 'active' : ''}`}
              onClick={() => toggleSetting('sound')}
              title="Som"
            >
              {settings.sound ? '🔔' : '🔕'}
            </button>
            <button 
              className="btn-icon"
              onClick={clearChat}
              title="Nova conversa"
            >
              🧹
            </button>
          </div>
        </header>
        
        {/* MENSAGENS */}
        <main className="chat-log" ref={logRef}>
          {!identified && (
            <div className="welcome-message">
              <Avatar sentiment="happy" size="large" />
              <p>Olá! Antes de começar, me diga seu nome para eu te atender no fluxo correto.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble 
              key={i} 
              message={m} 
              sentiment={m.role === 'assistant' ? sentiment : 'neutral'} 
            />
          ))}
          {loading && (
            <div className="row assistant">
              <Avatar sentiment="thinking" size="small" />
              <div className="bubble assistant typing">
                {uploadProgress 
                  ? `Processando ${uploadProgress.current}/${uploadProgress.total}...`
                  : '🤔 processando...'
                }
              </div>
            </div>
          )}
        </main>
        
        {/* PREVIEW CARD - Validation */}
        {previewCard && (
          <PreviewCard
            imageUrl={previewCard.imageUrl}
            extractedFields={previewCard.fields}
            doubtfulFields={previewCard.doubtfulFields}
            onConfirm={handlePreviewConfirm}
            onEdit={handlePreviewEdit}
            onResend={handlePreviewResend}
            onSkip={handlePreviewSkip}
            isProcessing={loading}
          />
        )}
        
        {/* INPUT */}
        <footer className="composer">
          {!identified ? (
            <form className="input-row identify-form" onSubmit={onIdentify}>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Qual é o seu nome?"
                disabled={loading}
              />
              <button className="btn" type="submit" disabled={loading || !name.trim()}>
                Confirmar
              </button>
            </form>
          ) : (
            <>
              {/* Fila de imagens */}
              <ImageQueue 
                files={imageQueue} 
                onRemove={removeFromQueue}
                onSend={sendQueue}
              />
              
              <form className="input-row" onSubmit={onSendText}>
                <button 
                  type="button" 
                  className="btn-attach"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="Anexar imagens"
                >
                  📎
                </button>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFileSelect}
                  style={{ display: 'none' }}
                />
                
                <textarea
                  className="input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  rows={1}
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSendText(e);
                    }
                  }}
                />
                
                <AudioRecorder 
                  onSend={handleAudioSend} 
                  disabled={loading || !identified} 
                />
                
                <button className="btn-send" type="submit" disabled={loading || (!text.trim() && imageQueue.length === 0)}>
                  ➤
                </button>
              </form>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
