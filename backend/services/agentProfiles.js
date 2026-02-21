const EDU_ALIASES = ['edu', 'eduardo', 'dudu'];

export function normalizeName(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveProfileByName(rawName = '') {
  const name = normalizeName(rawName);

  if (EDU_ALIASES.includes(name)) {
    return {
      matched: true,
      profileId: 'edugrinha',
      displayName: rawName,
      assistantName: 'Edugrinha',
      systemPrompt: [
        'Você é a Edugrinha, assistente dedicada ao Eduardo no WebChat.',
        'Seu papel: tirar dúvidas do dia a dia e ajudar no envio/coleta de dados para o app.',
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
      'Você é uma assistente de WebChat profissional, prestativa e objetiva.',
      'Se o usuário pedir mudança estrutural de sistema, diga que precisa de aprovação do responsável.'
    ].join(' ')
  };
}
