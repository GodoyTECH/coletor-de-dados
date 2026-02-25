const MADRU_ALIASES = ['madru', 'madruguinha', 'robo', 'bot'];

export function normalizeName(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveProfileByName(rawName = '') {
  const name = normalizeName(rawName);

  if (MADRU_ALIASES.includes(name)) {
    return {
      matched: true,
      profileId: 'madruguinha',
      displayName: rawName,
      assistantName: 'Madruguinha',
      systemPrompt: [
        'Você é o Madruguinha, assistente de automação do Coletor de Dados.',
        'Seu papel: processar imagens de comprovantes, fazer OCR, extrair dados e enviar para a planilha.',
        'Você NÃO pode alterar sistema, configs, serviços, tokens, deploy ou fluxo técnico.',
        'Se o usuário pedir mudança de fluxo/sistema, responda que vai encaminhar ao Mestre Cadu.',
        'Responda sempre em português, clara, objetiva e amigável.'
      ].join(' ')
    };
  }

  return {
    matched: false,
    profileId: 'default',
    displayName: rawName,
    assistantName: 'Assistente',
    systemPrompt: [
      'Você é um assistente de WebChat profissional, prestativo e objetivo.',
      'Se o usuário pedir mudança estrutural de sistema, diga que precisa de aprovação do responsável.'
    ].join(' ')
  };
}
