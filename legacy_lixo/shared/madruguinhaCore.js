export const MADRUGUINHA_INTENTS = {
  ANALYZE_STATUS: /(analisa( os)? registros|analisa( o)? dashboard|status dos registros|situacao atual)/i,
  GENERATE_REPORT: /(gerar relatorio|criar relatorio|relatorio profissional)/i,
  FULL_AUDIT: /(analisa tudo|auditoria completa|corrigir planilha inteira)/i,
  BACKUP: /(backup registros|gerar backup|backup completo)/i,
  WIPE_REQUEST: /(zerar planilha|limpar registros)/i,
  WIPE_CONFIRM: /^confirmo zerar$/i
};

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function detectIntent(rawMessage = '') {
  const message = normalizeText(rawMessage);

  for (const [intent, regex] of Object.entries(MADRUGUINHA_INTENTS)) {
    if (regex.test(message)) return intent;
  }

  return 'NONE';
}
