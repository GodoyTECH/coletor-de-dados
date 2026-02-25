// Speech utilities - STT (Speech-to-Text) and TTS (Text-to-Speech)
// Uses Web Speech API (built into browser)

/**
 * STT - Speech to Text
 * Transcribes audio from microphone
 */
export function createSpeechRecognizer(onResult, onError, onEnd) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    return { error: 'Speech recognition not supported' };
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'pt-BR';
  
  recognition.onresult = (event) => {
    const results = event.results;
    const lastResult = results[results.length - 1];
    
    if (lastResult.isFinal) {
      onResult(lastResult[0].transcript);
    }
  };
  
  recognition.onerror = (event) => {
    onError(event.error);
  };
  
  recognition.onend = () => {
    onEnd();
  };
  
  return recognition;
}

/**
 * TTS - Text to Speech
 * Speaks text using browser's speech synthesis
 */
export function speakText(text, { lang = 'pt-BR', rate = 1, pitch = 1, onEnd } = {}) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    
    utterance.onend = () => {
      if (onEnd) onEnd();
      resolve();
    };
    
    utterance.onerror = (event) => {
      reject(new Error(event.error));
    };
    
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Check if browser supports speech features
 */
export function getSpeechSupport() {
  return {
    stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    tts: !!window.speechSynthesis
  };
}

/**
 * Get available voices for TTS
 */
export function getVoices() {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve([]);
      return;
    }
    
    let voices = window.speechSynthesis.getVoices();
    
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        resolve(voices);
      };
    } else {
      resolve(voices);
    }
  });
}
