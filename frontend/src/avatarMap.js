// Avatar expressivo do Madruguinha
// Os avatares são servidos estáticos via Netlify (frontend/public/avatars/)

export const avatarMap = {
  neutral: '/avatars/madruga_neutro.png',
  happy: '/avatars/madruga_sorriso.png',
  serious: '/avatars/madruga_serio.png',
  thinking: '/avatars/madruga_olhar_lado.png',
  warning: '/avatars/madruga_joia.png',
  success: '/avatars/madruga_sorriso_torto.png',
  error: '/avatars/madruga_serio.png',
};

// Sentimentos baseados em intenção do usuário
export function getSentimentFromIntent(message) {
  const lower = message.toLowerCase();
  
  if (lower.includes('obrigado') || lower.includes('perfeito') || lower.includes('ótimo') || lower.includes('amei')) {
    return 'happy';
  }
  if (lower.includes('erro') || lower.includes('falha') || lower.includes('não funciona') || lower.includes('problema')) {
    return 'error';
  }
  if (lower.includes('duvida') || lower.includes('como') || lower.includes('?')) {
    return 'thinking';
  }
  if (lower.includes('urgente') || lower.includes('rápido') || lower.includes('imediato')) {
    return 'warning';
  }
  
  return 'neutral';
}

// Sentimento baseado no status do fluxo
export function getSentimentFromStatus(status) {
  switch (status) {
    case 'processing':
    case 'ocr':
    case 'analyzing':
      return 'thinking';
    case 'success':
    case 'completed':
      return 'success';
    case 'error':
    case 'failed':
      return 'error';
    case 'warning':
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

// Get avatar URL por sentimento
export function getAvatarUrl(sentiment = 'neutral') {
  return avatarMap[sentiment] || avatarMap.neutral;
}
