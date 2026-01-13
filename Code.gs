/**
 * ============================================
 * SOCIAL COLETOR - BACKEND (Google Apps Script)
 * ============================================
 * 
 * Este arquivo contém a lógica do servidor que:
 * 1. Processa formulários (doPost)
 * 2. Serve a WebApp (doGet)
 * 3. Gerencia dados no Google Sheets
 * 4. Interage com Google Drive (imagens, PDFs)
 * 5. Processa requisições da interface Web
 */

/**
 * ============================================
 * CONFIGURAÇÕES DO SISTEMA
 * ============================================
 * 
 * MODIFIQUE AQUI: Nomes das abas, colunas e configurações padrão
 */

// Nomes das abas (sheets) na planilha
const SHEETS = {
  REGISTROS: 'Registros',    // Dados principais
  INDEX: '_Index',           // Índice para buscas rápidas
  RELATORIOS: 'Relatorios',  // Relatórios gerados
  LOGS: 'Logs',              // Logs do sistema
  CONFIG: '_Config'          // Configurações
};

// Cabeçalhos da aba REGISTROS
// MODIFIQUE: Para adicionar/remover colunas, atualize esta lista
const REGISTROS_HEADERS = [
  'ID',              // Identificador único
  'DATA_REGISTRO',   // Data de criação
  'BENEFICIARIO',    // Nome do beneficiário
  'CPF',             // CPF
  'NUM_DOCUMENTO',   // Número do documento
  'ATENDENTE',       // Nome do atendente
  'PRODUTO',         // Produto entregue
  'QUANTIDADE',      // Quantidade
  'DATA_FORM',       // Data do formulário
  'ENDERECO',        // Endereço
  'OBS',             // Observações
  'ORIGEM',          // Origem do registro
  'IMG_URL',         // URL da imagem
  'STATUS',          // Status (NOVO, DUPLICADO, etc.)
  'DUP_REF_ID',      // ID do registro duplicado referência
  'DUP_REASON',      // Motivo da duplicação
  'UPDATED_AT',      // Data da última atualização
  'DELETADO'         // Registro deletado (TRUE/FALSE)
];

// Cabeçalhos da aba INDEX (índice para busca rápida)
const INDEX_HEADERS = [
  'NUM_DOCUMENTO',   // Documento normalizado
  'REG_ID',          // ID do registro
  'ROW_NUMBER',      // Número da linha
  'CREATED_AT',      // Data de criação
  'UPDATED_AT',      // Data de atualização
  'DELETADO'         // Índice deletado
];

// Cabeçalhos da aba RELATORIOS
const RELATORIOS_HEADERS = [
  'ID',              // ID do relatório
  'COMPETENCIA',     // Mês/Ano (YYYY-MM)
  'TOTAL_REGISTROS', // Total de registros
  'TOTAL_ATIVOS',    // Registros ativos
  'TOTAL_DUPLICADOS',// Registros duplicados
  'URL_PDF',         // Link do PDF no Drive
  'RESUMO',          // Resumo analítico
  'CREATED_AT'       // Data de criação
];

// Cabeçalhos da aba LOGS
const LOG_HEADERS = [
  'TIMESTAMP',       // Data/hora
  'ACTION',          // Ação realizada
  'DETAILS'          // Detalhes
];

// Cabeçalhos da aba CONFIG
const CONFIG_HEADERS = [
  'CHAVE',           // Nome da configuração
  'VALOR'            // Valor
];

// Configurações padrão do sistema
// MODIFIQUE: Para alterar valores padrão
const CONFIG_DEFAULTS = {
  WEBAPP_TITLE: 'Social Coletor - Admin',
  DRIVE_FOLDER_NAME_IMAGES: 'SocialColetor_Imagens',
  DRIVE_FOLDER_ID_IMAGES: '',          // Preenchido automaticamente
  DRIVE_FOLDER_NAME_REPORTS: 'SocialColetor_Relatorios',
  DRIVE_FOLDER_ID_REPORTS: ''          // Preenchido automaticamente
};

/**
 * ============================================
 * FUNÇÕES PRINCIPAIS DO GOOGLE APPS SCRIPT
 * ============================================
 */

/**
 * doGet() - Ponto de entrada da WebApp
 * Retorna a interface HTML para o usuário
 * 
 * @returns {HtmlOutput} Interface HTML da WebApp
 */
function doGet() {
  try {
    // Garante que o sistema está configurado
    ensureSystem_();
    
    // Cria template HTML
    const template = HtmlService.createTemplateFromFile('WebApp');
    
    // Passa variáveis para o HTML
    template.webAppTitle = getConfigValue_('WEBAPP_TITLE') || CONFIG_DEFAULTS.WEBAPP_TITLE;
    
    // Retorna a página
    return template.evaluate()
      .setTitle(template.webAppTitle)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    // Em caso de erro, retorna página de erro
    logEvent_('ERROR', 'doGet: ' + String(error));
    return HtmlService.createHtmlOutput(`
      <h1>Erro no sistema</h1>
      <p>${String(error)}</p>
      <p>Por favor, recarregue a página ou contate o administrador.</p>
    `);
  }
}

/**
 * doPost() - Processa requisições POST (formulários)
 * 
 * @param {Object} e - Evento POST com dados
 * @returns {ContentService.TextOutput} Resposta JSON
 */
function doPost(e) {
  try {
    // Garante sistema configurado
    ensureSystem_();
    
    // Parse dos dados recebidos
    const payload = parsePayload_(e);
    if (!payload) {
      return jsonOutput_({ 
        success: false, 
        error: 'Payload vazio ou inválido.' 
      });
    }
    
    // Roteamento de ações
    if (payload.action === 'submit') {
      // Submissão de novo registro
      const result = handleSubmit_(payload.data || {});
      return jsonOutput_({ 
        success: true, 
        ...result 
      });
    }
    
    // Ação não reconhecida
    return jsonOutput_({ 
      success: false, 
      error: 'Ação inválida ou não implementada.' 
    });
    
  } catch (error) {
    // Log do erro e retorna mensagem
    logEvent_('ERROR', 'doPost: ' + String(error));
    return jsonOutput_({ 
      success: false, 
      error: 'Erro interno: ' + String(error) 
    });
  }
}

/**
 * ============================================
 * FUNÇÕES DA INTERFACE WEB (CHAMADAS PELO FRONTEND)
 * ============================================
 */

/**
 * getDashboardData() - Retorna dados para o Dashboard
 * 
 * @returns {Object} Dados do dashboard
 *   - total: número total de registros
 *   - ativos: registros não deletados
 *   - duplicados: registros com status duplicado
 *   - porProduto: objeto com totais por produto
 * 
 * USO: Chamado pelo frontend ao abrir aba Dashboard
 */
function getDashboardData() {
  try {
    ensureSystem_();
    
    // Obtém todos os registros
    const registros = getRegistros_();
    const total = registros.length;
    
    // Filtra registros ativos (não deletados)
    const ativos = registros.filter((registro) => 
      !isDeleted_(registro.DELETADO)
    ).length;
    
    // Filtra duplicados ativos
    const duplicados = registros.filter((registro) => 
      isDuplicado_(registro.STATUS) && !isDeleted_(registro.DELETADO)
    ).length;
    
    // Calcula totais por produto
    const porProduto = {};
    registros.forEach((registro) => {
      if (isDeleted_(registro.DELETADO)) return;
      
      const produto = registro.PRODUTO || 'Não informado';
      const quantidade = Number(registro.QUANTIDADE || 0);
      
      porProduto[produto] = (porProduto[produto] || 0) + 
        (Number.isFinite(quantidade) ? quantidade : 0);
    });
    
    return { 
      total, 
      ativos, 
      duplicados, 
      porProduto 
    };
    
  } catch (error) {
    logEvent_('ERROR', 'getDashboardData: ' + String(error));
    throw error; // Propaga erro para frontend
  }
}

/**
 * getRegistrosTable() - Retorna registros com paginação
 * 
 * @param {Object} options - Opções de paginação
 *   - limit: número máximo de registros (default: 50)
 *   - offset: quantos registros pular (default: 0)
 * @returns {Object} Dados da tabela
 *   - headers: array de cabeçalhos
 *   - rows: array de objetos com {rowNumber, values}
 *   - meta: informações de paginação
 * 
 * USO: Chamado pelo frontend para carregar tabela paginada
 */
function getRegistrosTable(options) {
  try {
    ensureSystem_();
    
    // Configura opções com valores padrão
    options = options || {};
    const limit = Math.max(1, Math.min(500, Number(options.limit || 50)));
    const offset = Math.max(0, Number(options.offset || 0));
    
    const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
    const lastRow = sheet.getLastRow();
    
    // Verifica se há dados
    if (lastRow < 2) {
      return { 
        headers: REGISTROS_HEADERS, 
        rows: [], 
        meta: { 
          total: 0, 
          limit, 
          offset, 
          hasMore: false 
        } 
      };
    }
    
    const headers = getHeaders_(sheet);
    const total = lastRow - 1; // Exclui cabeçalho
    
    // Lógica de paginação: pega do FIM (mais recentes primeiro)
    // offset=0 pega os últimos 'limit' registros
    const endIndex = total - offset;
    const startIndex = Math.max(1, endIndex - limit + 1);
    
    const count = Math.max(0, endIndex - startIndex + 1);
    if (count <= 0) {
      return { 
        headers, 
        rows: [], 
        meta: { 
          total, 
          limit, 
          offset, 
          hasMore: false 
        } 
      };
    }
    
    // Obtém dados do intervalo calculado
    const startRow = startIndex + 1; // +1 para pular cabeçalho
    const range = sheet.getRange(startRow, 1, count, headers.length);
    const values = range.getValues();
    
    // Formata dados para retorno
    const rows = values.map((row, i) => ({
      rowNumber: startRow + i,
      values: row
    })).reverse(); // Inverte para mostrar mais recentes primeiro
    
    const loadedSoFar = offset + count;
    const hasMore = loadedSoFar < total;
    
    return {
      headers,
      rows,
      meta: { 
        total, 
        limit, 
        offset: loadedSoFar, 
        hasMore 
      }
    };
    
  } catch (error) {
    logEvent_('ERROR', 'getRegistrosTable: ' + String(error));
    throw error;
  }
}

/**
 * updateRegistroRow() - Atualiza uma linha de registro
 * 
 * @param {Object} payload - Dados da atualização
 *   - rowNumber: número da linha (base 1, incluindo cabeçalho)
 *   - values: objeto com {coluna: valor}
 * @returns {Object} Resultado da operação
 * 
 * USO: Chamado quando usuário edita célula e salva
 */
function updateRegistroRow(payload) {
  try {
    ensureSystem_();
    
    // Valida entrada
    if (!payload || !payload.rowNumber || !payload.values) {
      return { 
        success: false, 
        error: 'Dados incompletos para atualização.' 
      };
    }
    
    const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
    const headers = getHeaders_(sheet);
    const rowNumber = Number(payload.rowNumber);
    
    // Valida número da linha
    if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
      return { 
        success: false, 
        error: 'Linha inválida ou não encontrada.' 
      };
    }
    
    // Obtém valores atuais
    const rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
    const current = rowRange.getValues()[0];
    const incoming = payload.values;
    
    // Aplica atualizações
    headers.forEach((header, index) => {
      if (Object.prototype.hasOwnProperty.call(incoming, header)) {
        current[index] = incoming[header];
      }
    });
    
    // Atualiza timestamp
    const updatedIndex = headers.indexOf('UPDATED_AT');
    if (updatedIndex !== -1) {
      current[updatedIndex] = new Date();
    }
    
    // Salva no Google Sheets
    rowRange.setValues([current]);
    
    // Reconstroi índice para manter consistência
    rebuildIndex_();
    
    logEvent_('UPDATE', `Registro linha ${rowNumber} atualizado.`);
    
    return { 
      success: true 
    };
    
  } catch (error) {
    logEvent_('ERROR', 'updateRegistroRow: ' + String(error));
    return { 
      success: false, 
      error: String(error) 
    };
  }
}

/**
 * getDuplicados() - Retorna lista de registros duplicados
 * 
 * @returns {Array} Lista de objetos de registros duplicados
 * 
 * USO: Chamado pela aba "Duplicados"
 */
function getDuplicados() {
  try {
    ensureSystem_();
    const registros = getRegistros_();
    
    // Filtra registros duplicados ativos
    return registros.filter((registro) => 
      isDuplicado_(registro.STATUS) && !isDeleted_(registro.DELETADO)
    );
    
  } catch (error) {
    logEvent_('ERROR', 'getDuplicados: ' + String(error));
    throw error;
  }
}

/**
 * resolveDuplicado() - Processa ação sobre registro duplicado
 * 
 * @param {Object} payload - Dados da ação
 *   - id: ID do registro
 *   - action: ação (validar, manter, mesclar, excluir)
 * @returns {Object} Resultado da operação
 * 
 * USO: Chamado quando usuário clica em ação de duplicado
 */
function resolveDuplicado(payload) {
  try {
    ensureSystem_();
    
    // Valida entrada
    if (!payload || !payload.id || !payload.action) {
      return { 
        success: false, 
        error: 'Dados incompletos para resolução.' 
      };
    }
    
    const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0] || [];
    
    // Encontra índices das colunas relevantes
    const idIndex = headers.indexOf('ID');
    const statusIndex = headers.indexOf('STATUS');
    const updatedIndex = headers.indexOf('UPDATED_AT');
    const deletadoIndex = headers.indexOf('DELETADO');
    
    // Procura o registro pelo ID
    for (let i = 1; i < data.length; i += 1) {
      if (String(data[i][idIndex]) === String(payload.id)) {
        
        // Aplica ação baseada no parâmetro
        switch (payload.action) {
          case 'manter':
            data[i][statusIndex] = 'DUPLICADO_MANTIDO';
            break;
          case 'validar':
            data[i][statusIndex] = 'VALIDO';
            break;
          case 'mesclar':
            data[i][statusIndex] = 'MESCLADO';
            break;
          case 'excluir':
            if (deletadoIndex !== -1) {
              data[i][deletadoIndex] = 'TRUE';
            }
            data[i][statusIndex] = 'EXCLUIDO';
            break;
          default:
            return { 
              success: false, 
              error: 'Ação inválida. Use: validar, manter, mesclar ou excluir.' 
            };
        }
        
        // Atualiza timestamp
        if (updatedIndex !== -1) {
          data[i][updatedIndex] = new Date();
        }
        
        // Salva alteração
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([data[i]]);
        
        // Reconstroi índice e log
        rebuildIndex_();
        logEvent_('DUPLICADO', `Registro ${payload.id} => ${payload.action}`);
        
        return { 
          success: true 
        };
      }
    }
    
    return { 
      success: false, 
      error: 'Registro não encontrado com o ID fornecido.' 
    };
    
  } catch (error) {
    logEvent_('ERROR', 'resolveDuplicado: ' + String(error));
    return { 
      success: false, 
      error: String(error) 
    };
  }
}

/**
 * getRelatorios() - Retorna lista de relatórios gerados
 * 
 * @returns {Array} Lista de relatórios
 * 
 * USO: Chamado pela aba "Relatórios"
 */
function getRelatorios() {
  try {
    ensureSystem_();
    const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return [];
    
    const headers = data[0];
    
    // Converte dados da planilha para objetos
    return data.slice(1).map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index];
      });
      return item;
    });
    
  } catch (error) {
    logEvent_('ERROR', 'getRelatorios: ' + String(error));
    throw error;
  }
}

/**
 * gerarRelatorio() - Gera novo relatório (PDF + dados)
 * 
 * @returns {Object} Resultado com URL do PDF
 * 
 * USO: Chamado pelo botão "Gerar relatório"
 */
function gerarRelatorio() {
  try {
    ensureSystem_();
    
    // Obtém dados para o relatório
    const registros = getRegistros_();
    const totals = buildTotals_(registros);
    const competencia = formatCompetencia_(new Date());
    const resumo = gerarResumoAnalitico_(totals);
    const pdfUrl = gerarPdfRelatorio_(competencia, totals, resumo);
    
    // Salva metadados do relatório
    const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
    const headers = getHeaders_(sheet);
    
    const rowData = {
      ID: Utilities.getUuid(),
      COMPETENCIA: competencia,
      TOTAL_REGISTROS: totals.total,
      TOTAL_ATIVOS: totals.ativos,
      TOTAL_DUPLICADOS: totals.duplicados,
      URL_PDF: pdfUrl,
      RESUMO: resumo,
      CREATED_AT: new Date()
    };
    
    // Prepara valores para inserção
    const rowValues = headers.map((header) => 
      Object.prototype.hasOwnProperty.call(rowData, header) ? rowData[header] : ''
    );
    
    // Insere na planilha
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowValues]);
    
    logEvent_('RELATORIO', `Relatório ${competencia} gerado.`);
    
    return { 
      success: true, 
      url: pdfUrl 
    };
    
  } catch (error) {
    logEvent_('ERROR', 'gerarRelatorio: ' + String(error));
    return { 
      success: false, 
      error: String(error) 
    };
  }
}

/**
 * ============================================
 * FUNÇÕES DE PROCESSAMENTO DE FORMULÁRIOS
 * ============================================
 */

/**
 * handleSubmit_() - Processa submissão de novo registro
 * Função interna (não exposta diretamente)
 * 
 * @param {Object} data - Dados do formulário
 * @returns {Object} Resultado com ID e status
 */
function handleSubmit_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);
  
  const now = new Date();
  const recordId = Utilities.getUuid();
  
  // Normaliza número do documento para busca
  const numeroDocumentoRaw = String(data.numeroDocumento || '').trim();
  const numeroDocumentoNormalized = normalizeDoc_(numeroDocumentoRaw);
  
  // Verifica duplicidade
  const duplicateInfo = numeroDocumentoNormalized
    ? findDuplicateByDoc_(numeroDocumentoNormalized)
    : null;
  
  // Define status baseado na duplicidade
  const status = duplicateInfo ? 'DUPLICADO' : 'NOVO';
  const dupRefId = duplicateInfo ? duplicateInfo.id : '';
  const dupReason = duplicateInfo ? 'NUM_DOCUMENTO' : '';
  
  // Processa imagem se fornecida
  const imageUrl = data.imagemBase64
    ? saveImageToDrive_(data.imagemBase64, recordId, numeroDocumentoNormalized)
    : '';
  
  // Prepara dados para inserção
  const rowData = {
    ID: recordId,
    DATA_REGISTRO: now,
    BENEFICIARIO: String(data.beneficiario || '').trim(),
    CPF: String(data.cpf || '').trim(),
    NUM_DOCUMENTO: numeroDocumentoRaw,
    ATENDENTE: String(data.atendente || '').trim(),
    PRODUTO: String(data.produto || '').trim(),
    QUANTIDADE: Number(data.quantidade || 0),
    DATA_FORM: String(data.data || '').trim(),
    ENDERECO: String(data.endereco || '').trim(),
    OBS: String(data.observacoes || '').trim(),
    ORIGEM: 'SOCIAL_COLETOR',
    IMG_URL: imageUrl,
    STATUS: status,
    DUP_REF_ID: dupRefId,
    DUP_REASON: dupReason,
    UPDATED_AT: now,
    DELETADO: ''
  };
  
  // Insere na planilha
  const headers = getHeaders_(registrosSheet);
  const rowValues = headers.map((header) => 
    Object.prototype.hasOwnProperty.call(rowData, header) ? rowData[header] : ''
  );
  
  registrosSheet.getRange(registrosSheet.getLastRow() + 1, 1, 1, headers.length)
    .setValues([rowValues]);
  
  // Atualiza índice se não for duplicado
  if (!duplicateInfo && numeroDocumentoNormalized) {
    addIndexEntry_(numeroDocumentoNormalized, recordId, registrosSheet.getLastRow());
  }
  
  logEvent_('SUBMIT', `Registro ${recordId} inserido. Status=${status}.`);
  
  return {
    id: recordId,
    status,
    dupRefId,
    dupReason,
    imgUrl: imageUrl
  };
}

/**
 * ============================================
 * FUNÇÕES AUXILIARES (INTERNAS)
 * ============================================
 * Nota: Funções com _ no final são consideradas internas
 */

/**
 * ensureSystem_() - Garante que o sistema está configurado
 * Cria abas e estruturas se não existirem
 */
function ensureSystem_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Garante existência de todas as abas com cabeçalhos
  ensureSheetWithHeaders_(ss, SHEETS.REGISTROS, REGISTROS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.INDEX, INDEX_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.RELATORIOS, RELATORIOS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.LOGS, LOG_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.CONFIG, CONFIG_HEADERS);
  
  // Garante configurações padrão
  ensureDefaults_();
}

/**
 * ensureSheetWithHeaders_() - Cria/valida aba com cabeçalhos
 * 
 * @param {Spreadsheet} ss - Planilha
 * @param {string} name - Nome da aba
 * @param {Array} headers - Cabeçalhos
 * @returns {Sheet} Aba configurada
 */
function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  
  // Cria aba se não existir
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  
  // Configura cabeçalhos se aba estiver vazia
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  
  // Verifica e adiciona cabeçalhos faltantes
  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existingHeaders = headerRow.filter((value) => value !== '' && value !== null);
  
  const missing = headers.filter((header) => !existingHeaders.includes(header));
  if (missing.length > 0) {
    const startCol = headerRow.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  }
  
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * ensureDefaults_() - Garante configurações padrão
 */
function ensureDefaults_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const data = sheet.getDataRange().getValues();
  const existing = new Set(data.slice(1).map((row) => row[0]));
  
  // Adiciona configurações faltantes
  Object.keys(CONFIG_DEFAULTS).forEach((key) => {
    if (!existing.has(key)) {
      sheet.appendRow([key, CONFIG_DEFAULTS[key]]);
    }
  });
}

/**
 * getHeaders_() - Retorna cabeçalhos de uma aba
 * 
 * @param {Sheet} sheet - Aba do Google Sheets
 * @returns {Array} Cabeçalhos
 */
function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

/**
 * getSheet_() - Retorna aba pelo nome
 * 
 * @param {Spreadsheet} ss - Planilha
 * @param {string} name - Nome da aba
 * @returns {Sheet} Aba
 */
function getSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error(`Aba "${name}" não encontrada.`);
  }
  return sheet;
}

/**
 * getConfigValue_() - Obtém valor de configuração
 * 
 * @param {string} key - Chave da configuração
 * @returns {string} Valor
 */
function getConfigValue_(key) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i += 1) {
    if (values[i][0] === key) {
      return values[i][1] || '';
    }
  }
  
  return '';
}

/**
 * setConfigValue_() - Define valor de configuração
 * 
 * @param {string} key - Chave
 * @param {string} value - Valor
 */
function setConfigValue_(key, value) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i += 1) {
    if (values[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  
  sheet.appendRow([key, value]);
}

/**
 * parsePayload_() - Parse dos dados POST
 * 
 * @param {Object} e - Evento POST
 * @returns {Object} Dados parseados
 */
function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

/**
 * jsonOutput_() - Cria resposta JSON
 * 
 * @param {Object} obj - Objeto para converter em JSON
 * @returns {TextOutput} Resposta JSON
 */
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * normalizeDoc_() - Normaliza número de documento
 * Remove caracteres especiais e padroniza
 * 
 * @param {string} value - Número do documento
 * @returns {string} Documento normalizado
 */
function normalizeDoc_(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * findDuplicateByDoc_() - Busca duplicados por documento
 * 
 * @param {string} docNormalized - Documento normalizado
 * @returns {Object|null} Informações do duplicado
 */
function findDuplicateByDoc_(docNormalized) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return null;
  
  const headers = data[0];
  const idIndex = headers.indexOf('ID');
  const docIndex = headers.indexOf('NUM_DOCUMENTO');
  const deletadoIndex = headers.indexOf('DELETADO');
  
  // Busca por documento normalizado
  for (let i = 1; i < data.length; i += 1) {
    const rowDoc = normalizeDoc_(data[i][docIndex]);
    if (rowDoc && rowDoc === docNormalized && !isDeleted_(data[i][deletadoIndex])) {
      return { 
        id: data[i][idIndex] 
      };
    }
  }
  
  return null;
}

/**
 * addIndexEntry_() - Adiciona entrada ao índice
 * 
 * @param {string} docNormalized - Documento normalizado
 * @param {string} recordId - ID do registro
 * @param {number} rowNumber - Número da linha
 */
function addIndexEntry_(docNormalized, recordId, rowNumber) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.INDEX);
  const headers = getHeaders_(sheet);
  
  const rowData = {
    NUM_DOCUMENTO: docNormalized,
    REG_ID: recordId,
    ROW_NUMBER: rowNumber,
    CREATED_AT: new Date(),
    UPDATED_AT: new Date(),
    DELETADO: ''
  };
  
  const rowValues = headers.map((header) => 
    Object.prototype.hasOwnProperty.call(rowData, header) ? rowData[header] : ''
  );
  
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length)
    .setValues([rowValues]);
}

/**
 * rebuildIndex_() - Reconstrói índice completo
 * Garante consistência entre registros e índice
 */
function rebuildIndex_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);
  const indexSheet = getSheet_(ss, SHEETS.INDEX);
  
  const registrosData = registrosSheet.getDataRange().getValues();
  if (registrosData.length <= 1) return;
  
  const regHeaders = registrosData[0];
  const idIndex = regHeaders.indexOf('ID');
  const docIndex = regHeaders.indexOf('NUM_DOCUMENTO');
  const deletadoIndex = regHeaders.indexOf('DELETADO');
  
  const rows = [];
  const seenDocs = new Set();
  
  // Processa registros ativos não duplicados
  for (let i = 1; i < registrosData.length; i += 1) {
    const docNormalized = normalizeDoc_(registrosData[i][docIndex]);
    
    // Pula se: sem documento, já visto, ou deletado
    if (!docNormalized || seenDocs.has(docNormalized)) continue;
    if (isDeleted_(registrosData[i][deletadoIndex])) continue;
    
    seenDocs.add(docNormalized);
    
    rows.push([
      docNormalized,
      registrosData[i][idIndex],
      i + 1,
      new Date(),
      new Date(),
      ''
    ]);
  }
  
  // Limpa e recria índice
  indexSheet.clearContents();
  indexSheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
  
  if (rows.length > 0) {
    indexSheet.getRange(2, 1, rows.length, INDEX_HEADERS.length).setValues(rows);
  }
}

/**
 * saveImageToDrive_() - Salva imagem no Google Drive
 * 
 * @param {string} base64 - Imagem em base64
 * @param {string} recordId - ID do registro
 * @param {string} docNormalized - Documento normalizado
 * @returns {string} URL da imagem no Drive
 */
function saveImageToDrive_(base64, recordId, docNormalized) {
  try {
    const folder = getDriveFolder_('images');
    
    // Remove prefixo data URL
    const cleaned = String(base64).replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    
    // Cria blob a partir do base64
    const blob = Utilities.newBlob(Utilities.base64Decode(cleaned));
    
    // Define nome do arquivo
    const fileName = `REG_${recordId}_${docNormalized || 'SEM_DOC'}_${Date.now()}.jpg`;
    blob.setName(fileName);
    
    // Salva no Drive
    const file = folder.createFile(blob);
    
    // Torna acessível via link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
    
  } catch (error) {
    logEvent_('DRIVE_ERROR', 'saveImageToDrive: ' + String(error));
    return ''; // Retorna string vazia em caso de erro
  }
}

/**
 * getDriveFolder_() - Obtém ou cria pasta no Drive
 * 
 * @param {string} type - Tipo (images ou reports)
 * @returns {Folder} Pasta do Google Drive
 */
function getDriveFolder_(type) {
  const isReports = type === 'reports';
  const idKey = isReports ? 'DRIVE_FOLDER_ID_REPORTS' : 'DRIVE_FOLDER_ID_IMAGES';
  const nameKey = isReports ? 'DRIVE_FOLDER_NAME_REPORTS' : 'DRIVE_FOLDER_NAME_IMAGES';
  
  // Tenta usar ID salvo
  const existingId = getConfigValue_(idKey);
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      logEvent_('DRIVE', `Folder ID inválido (${idKey}). Criando novo.`);
    }
  }
  
  // Cria nova pasta
  const folderName = getConfigValue_(nameKey) || CONFIG_DEFAULTS[nameKey];
  const folder = DriveApp.createFolder(folderName);
  
  // Salva ID para uso futuro
  setConfigValue_(idKey, folder.getId());
  
  return folder;
}

/**
 * getRegistros_() - Obtém todos os registros como objetos
 * 
 * @returns {Array} Lista de registros
 */
function getRegistros_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return [];
  
  const headers = data[0];
  
  // Converte para array de objetos
  return data.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * buildTotals_() - Calcula totais para relatórios
 * 
 * @param {Array} registros - Lista de registros
 * @returns {Object} Totais calculados
 */
function buildTotals_(registros) {
  const totals = {
    total: registros.length,
    ativos: 0,
    duplicados: 0,
    porProduto: {}
  };
  
  registros.forEach((registro) => {
    const deletado = isDeleted_(registro.DELETADO);
    
    if (!deletado) {
      totals.ativos += 1;
    }
    
    if (!deletado && isDuplicado_(registro.STATUS)) {
      totals.duplicados += 1;
    }
    
    if (deletado) return;
    
    const produto = registro.PRODUTO || 'Não informado';
    const quantidade = Number(registro.QUANTIDADE || 0);
    
    totals.porProduto[produto] = (totals.porProduto[produto] || 0) + 
      (Number.isFinite(quantidade) ? quantidade : 0);
  });
  
  return totals;
}

/**
 * formatCompetencia_() - Formata data para competência (YYYY-MM)
 * 
 * @param {Date} date - Data
 * @returns {string} Competência formatada
 */
function formatCompetencia_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
}

/**
 * gerarResumoAnalitico_() - Gera resumo analítico usando IA
 * 
 * @param {Object} totals - Totais do relatório
 * @returns {string} Resumo analítico
 */
function gerarResumoAnalitico_(totals) {
  // Tenta usar Gemini AI se configurado
  const apiKey = PropertiesService.getScriptProperties().getProperty('API_GEMINI') || 
                 PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  const resumoBase = gerarResumoBase_(totals);
  
  if (!apiKey) {
    return `${resumoBase} Resumo analítico indisponível (chave API não configurada).`;
  }
  
  const prompt = [
    'Gere um texto analítico e objetivo em português sobre os dados abaixo.',
    'Não mencione nenhuma tecnologia utilizada.',
    `Total de registros: ${totals.total}.`,
    `Registros ativos: ${totals.ativos}.`,
    `Registros duplicados: ${totals.duplicados}.`,
    `Totais por produto: ${formatProdutos_(totals.porProduto)}.`,
    'Traga observações úteis para gestão, com 2 a 4 parágrafos curtos.'
  ].join(' ');
  
  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature: 0.4, 
            maxOutputTokens: 300 
          }
        })
      }
    );
    
    const data = JSON.parse(response.getContentText() || '{}');
    const text = data.candidates && data.candidates[0] && 
                 data.candidates[0].content && data.candidates[0].content.parts
      ? data.candidates[0].content.parts.map((part) => part.text).join('')
      : '';
    
    return text ? `${resumoBase} ${text.trim()}` : `${resumoBase} Resumo analítico indisponível.`;
    
  } catch (error) {
    logEvent_('GEMINI_ERROR', String(error));
    return `${resumoBase} Resumo analítico indisponível.`;
  }
}

/**
 * gerarPdfRelatorio_() - Gera PDF do relatório no Drive
 * 
 * @param {string} competencia - Competência (YYYY-MM)
 * @param {Object} totals - Totais
 * @param {string} resumo - Resumo analítico
 * @returns {string} URL do PDF
 */
function gerarPdfRelatorio_(competencia, totals, resumo) {
  try {
    // Gera HTML do relatório
    const linhasProdutos = Object.keys(totals.porProduto).map((produto) => {
      return `
        <tr>
          <td>${escapeHtml_(produto)}</td>
          <td>${formatNumber_(totals.porProduto[produto])}</td>
        </tr>
      `;
    }).join('');
    
    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { 
              font-family: Arial, sans-serif; 
              color: #111827; 
              margin: 0;
              padding: 20px;
            }
            h1 { 
              margin-bottom: 8px; 
              color: #1e40af;
            }
            .meta { 
              color: #6b7280; 
              margin-bottom: 16px; 
              font-size: 14px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 12px; 
            }
            th, td { 
              border: 1px solid #e5e7eb; 
              padding: 10px; 
              text-align: left; 
              font-size: 13px; 
            }
            th { 
              background: #f3f4f6; 
              font-weight: 600;
            }
            .section { 
              margin-top: 24px; 
              padding-bottom: 16px;
              border-bottom: 1px solid #e5e7eb;
            }
            .section:last-child {
              border-bottom: none;
            }
            .total-box {
              display: inline-block;
              padding: 12px 16px;
              background: #f0f9ff;
              border-radius: 8px;
              margin-right: 12px;
              margin-bottom: 12px;
              border: 1px solid #bae6fd;
            }
            .total-box strong {
              display: block;
              font-size: 20px;
              color: #0369a1;
            }
            .footer {
              margin-top: 30px;
              padding-top: 15px;
              border-top: 2px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <h1>Relatório Social Coletor - ${escapeHtml_(competencia)}</h1>
          <div class="meta">
            Gerado em ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}
          </div>
          
          <div class="section">
            <h2>Totais gerais</h2>
            <div class="total-box">
              Total de registros<br>
              <strong>${totals.total}</strong>
            </div>
            <div class="total-box">
              Registros ativos<br>
              <strong>${totals.ativos}</strong>
            </div>
            <div class="total-box">
              Registros duplicados<br>
              <strong>${totals.duplicados}</strong>
            </div>
          </div>
          
          <div class="section">
            <h2>Totais por produto</h2>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade total</th>
                </tr>
              </thead>
              <tbody>
                ${linhasProdutos || '<tr><td colspan="2">Sem dados</td></tr>'}
              </tbody>
            </table>
          </div>
          
          <div class="section">
            <h2>Análise e observações</h2>
            <p>${escapeHtml_(resumo)}</p>
          </div>
          
          <div class="footer">
            Sistema Social Coletor - Relatório gerado automaticamente
          </div>
        </body>
      </html>
    `;
    
    // Converte HTML para PDF
    const blob = HtmlService.createHtmlOutput(html)
      .getBlob()
      .getAs('application/pdf')
      .setName(`Relatorio_SocialColetor_${competencia}_${Date.now()}.pdf`);
    
    // Salva no Drive
    const folder = getDriveFolder_('reports');
    const file = folder.createFile(blob);
    
    // Permissão de visualização
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
    
  } catch (error) {
    logEvent_('PDF_ERROR', 'gerarPdfRelatorio: ' + String(error));
    return ''; // Retorna vazio em caso de erro
  }
}

/**
 * formatProdutos_() - Formata objeto de produtos para texto
 * 
 * @param {Object} produtos - Objeto {produto: quantidade}
 * @returns {string} Texto formatado
 */
function formatProdutos_(produtos) {
  return Object.keys(produtos)
    .map((produto) => `${produto}: ${formatNumber_(produtos[produto])}`)
    .join(', ');
}

/**
 * gerarResumoBase_() - Gera resumo base dos totais
 * 
 * @param {Object} totals - Totais
 * @returns {string} Resumo base
 */
function gerarResumoBase_(totals) {
  return `Resumo geral: ${totals.total} registros no período, ${totals.ativos} ativos e ${totals.duplicados} duplicados.`;
}

/**
 * formatNumber_() - Formata número para padrão brasileiro
 * 
 * @param {number} value - Valor numérico
 * @returns {string} Número formatado
 */
function formatNumber_(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR') : '0';
}

/**
 * isDuplicado_() - Verifica se status indica duplicado
 * 
 * @param {string} status - Status do registro
 * @returns {boolean} É duplicado
 */
function isDuplicado_(status) {
  if (!status) return false;
  const s = String(status).trim().toUpperCase();
  return s === 'DUPLICADO' || s === 'DUPLICATE' || s === 'DUP';
}

/**
 * isDeleted_() - Verifica se registro está deletado
 * 
 * @param {*} value - Valor do campo DELETADO
 * @returns {boolean} Está deletado
 */
function isDeleted_(value) {
  if (value === true) return true;
  if (value === false) return false;
  
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'TRUE' || normalized === 'SIM' || normalized === '1' || normalized === 'S';
}

/**
 * escapeHtml_() - Escapa caracteres HTML (segurança)
 * 
 * @param {string} value - Texto
 * @returns {string} Texto escapado
 */
function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * logEvent_() - Registra evento no log
 * 
 * @param {string} action - Ação realizada
 * @param {string} details - Detalhes do evento
 */
function logEvent_(action, details) {
  try {
    const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.LOGS);
    if (!sheet) return;
    
    sheet.appendRow([
      new Date(),
      action,
      String(details || '').substring(0, 490) // Limita tamanho
    ]);
    
    // Mantém log com tamanho razoável (últimas 1000 entradas)
    const maxRows = 1000;
    if (sheet.getLastRow() > maxRows) {
      sheet.deleteRows(2, sheet.getLastRow() - maxRows);
    }
  } catch (error) {
    // Silencia erro de log para não quebrar operação principal
    console.error('Falha ao logar evento:', error);
  }
}

/**
 * ============================================
 * TESTES E DEPURAÇÃO (OPCIONAL)
 * ============================================
 * 
 * Funções para testar o sistema durante desenvolvimento
 */

/**
 * testSystem() - Função para testes manuais
 * Executar via menu "Executar > testSystem"
 */
function testSystem() {
  console.log('=== TESTE DO SISTEMA SOCIAL COLETOR ===');
  
  try {
    // 1. Garante sistema
    ensureSystem_();
    console.log('✅ Sistema configurado');
    
    // 2. Testa dashboard
    const dashboard = getDashboardData();
    console.log('✅ Dashboard:', dashboard);
    
    // 3. Testa paginação
    const registros = getRegistrosTable({ limit: 5, offset: 0 });
    console.log('✅ Registros (5 primeiros):', registros.rows.length);
    
    // 4. Testa duplicados
    const duplicados = getDuplicados();
    console.log('✅ Duplicados encontrados:', duplicados.length);
    
    // 5. Testa relatórios
    const relatorios = getRelatorios();
    console.log('✅ Relatórios existentes:', relatorios.length);
    
    console.log('=== TESTE CONCLUÍDO COM SUCESSO ===');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error);
    throw error;
  }
}

/**
 * clearTestData() - Limpa dados de teste (cuidado!)
 * Remove todos os registros, mantém estrutura
 */
function clearTestData() {
  if (!confirm('Tem certeza? Isso apagará todos os registros!')) return;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Limpa dados, mantém cabeçalhos
  [SHEETS.REGISTROS, SHEETS.INDEX, SHEETS.RELATORIOS].forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clear();
    }
  });
  
  console.log('Dados de teste limpos.');
}

/**
 * createTestData() - Cria dados de teste para desenvolvimento
 */
function createTestData() {
  console.log('Criando dados de teste...');
  
  const testRecords = [
    {
      beneficiario: 'João Silva',
      cpf: '123.456.789-00',
      numeroDocumento: 'DOC001',
      atendente: 'Maria Santos',
      produto: 'Cesta Básica',
      quantidade: 1,
      data: '2024-01-15',
      endereco: 'Rua Teste, 123',
      observacoes: 'Primeiro teste'
    },
    {
      beneficiario: 'Ana Oliveira',
      cpf: '987.654.321-00',
      numeroDocumento: 'DOC002',
      atendente: 'Carlos Lima',
      produto: 'Kit Higiene',
      quantidade: 2,
      data: '2024-01-16',
      endereco: 'Av. Exemplo, 456',
      observacoes: 'Segundo teste'
    },
    {
      beneficiario: 'Pedro Costa',
      cpf: '456.789.123-00', 
      numeroDocumento: 'DOC001', // Duplicado proposital
      atendente: 'Maria Santos',
      produto: 'Cesta Básica',
      quantidade: 1,
      data: '2024-01-17',
      endereco: 'Rua Nova, 789',
      observacoes: 'Teste duplicado'
    }
  ];
  
  testRecords.forEach((record, index) => {
    console.log(`Processando registro ${index + 1}...`);
    
    const result = handleSubmit_(record);
    console.log(`Registro ${index + 1} criado:`, result);
    
    Utilities.sleep(500); // Pequena pausa entre registros
  });
  
  console.log('Dados de teste criados com sucesso!');
  console.log('Total registros:', getDashboardData().total);
}

/**
 * onOpen() - Cria menu personalizado na planilha
 * Executado automaticamente quando abre a planilha
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 Social Coletor')
    .addItem('Abrir Painel Admin', 'showSidebar')
    .addSeparator()
    .addItem('Testar Sistema', 'testSystem')
    .addItem('Criar Dados Teste', 'createTestData')
    .addItem('Limpar Dados Teste', 'clearTestData')
    .addSeparator()
    .addItem('Gerar Relatório', 'gerarRelatorio')
    .addToUi();
}

/**
 * showSidebar() - Mostra painel lateral na planilha
 * Para acesso rápido sem WebApp
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutput(`
    <div style="padding: 20px;">
      <h2>Social Coletor Admin</h2>
      <p>Painel administrativo rápido</p>
      <button onclick="google.script.run.testSystem()" style="padding: 10px; margin: 5px;">
        Testar Sistema
      </button>
      <button onclick="google.script.run.gerarRelatorio()" style="padding: 10px; margin: 5px;">
        Gerar Relatório
      </button>
      <p><a href="${ScriptApp.getService().getUrl()}" target="_blank">
        Abrir Painel Completo
      </a></p>
    </div>
  `)
  .setTitle('Social Coletor')
  .setWidth(300);
  
  SpreadsheetApp.getUi().showSidebar(html);
}
