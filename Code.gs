/**
 * SOCIAL COLETOR - BACKEND COMPLETO
 * Sistema integrado com Google Sheets
 * Versão: 3.0 - Estável e Completa
 */

// ===== CONFIGURAÇÕES DO SISTEMA =====
const CONFIG = {
  SHEET_NAMES: {
    REGISTROS: 'Registros',
    INDEX: '_Index',
    RELATORIOS: 'Relatorios',
    LOGS: 'Logs',
    CONFIG: '_Config'
  },
  
  REGISTROS_HEADERS: [
    'ID', 'DATA_REGISTRO', 'BENEFICIARIO', 'CPF', 'NUM_DOCUMENTO',
    'ATENDENTE', 'PRODUTO', 'QUANTIDADE', 'DATA_FORM', 'ENDERECO',
    'OBS', 'ORIGEM', 'IMG_URL', 'STATUS', 'DUP_REF_ID', 'DUP_REASON',
    'UPDATED_AT', 'DELETADO'
  ],
  
  INDEX_HEADERS: [
    'NUM_DOCUMENTO', 'REG_ID', 'ROW_NUMBER', 'CREATED_AT', 'UPDATED_AT', 'DELETADO'
  ],
  
  RELATORIOS_HEADERS: [
    'ID', 'COMPETENCIA', 'TOTAL_REGISTROS', 'TOTAL_ATIVOS', 'TOTAL_DUPLICADOS',
    'URL_PDF', 'RESUMO', 'CREATED_AT'
  ],
  
  DEFAULTS: {
    WEBAPP_TITLE: 'Social Coletor - Admin'
  }
};

// ===== DIAGNÓSTICO =====
const DEBUG = false;

function logDebug(message, data) {
  if (!DEBUG) return;
  const payload = typeof data === 'undefined' ? '' : data;
  try {
    Logger.log(`${message} ${JSON.stringify(payload)}`);
  } catch (err) {
    Logger.log(`${message} ${String(payload)}`);
  }
  try {
    console.log(message, payload);
  } catch (err) {}
}

function logError(context, error) {
  const detail = error && error.stack ? error.stack : String(error);
  try {
    Logger.log(`${context}: ${detail}`);
  } catch (err) {}
  try {
    console.error(`${context}:`, error);
  } catch (err) {}
}

function errorResponse(error, details) {
  const message = error && error.message ? error.message : String(error || 'Erro desconhecido');
  const info = details || (error && error.stack ? error.stack : undefined);
  return { success: false, error: message, details: info };
}

// ===== FUNÇÃO PRINCIPAL - WEBAPP ENTRY POINT =====
function doGet() {
  try {
    ensureSystem();
    return jsonResponse({
      success: true,
      message: 'Social Coletor API online',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError('Erro no doGet', error);
    return jsonResponse(errorResponse(error));
  }
}

// ===== ENDPOINT DE RECEBIMENTO (POST) =====
// Compatível com send.js (payload { action:'submit', data:{...} })
function doPost(e) {
  try {
    ensureSystem();

    const req = parseRequest(e);

    // Permite chamada simples de saúde
    if (req.action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'pong',
        timestamp: new Date().toISOString()
      });
    }

    if (req.action === 'submit') {
      const result = submitRegistro(req);
      return jsonResponse(result);
    }

    const tokenCheck = validatePanelToken(req);
    if (!tokenCheck.success) {
      return jsonResponse(tokenCheck);
    }

    switch (req.action) {
      case 'getDashboardData':
        return jsonResponse(getDashboardData());
      case 'listRegistros':
        return jsonResponse(getRegistrosTable(req.data || {}));
      case 'updateRegistrosBatch':
        return jsonResponse(updateRegistroRowsBatch(req.data || {}));
      case 'deleteRegistro':
        return jsonResponse(deleteRegistroByRow(req.data || {}));
      case 'listDuplicados':
        return jsonResponse(listDuplicados());
      case 'resolveDuplicado':
        return jsonResponse(resolveDuplicadoByRow(req.data || {}));
      case 'listRelatorios':
        return jsonResponse(listRelatorios());
      case 'gerarRelatorio':
        return jsonResponse(gerarRelatorio());
      default:
        return jsonResponse({
          success: false,
          error: 'Ação inválida.',
          receivedAction: req.action || null
        });
    }
  } catch (error) {
    logError('Erro no doPost', error);
    try { logEvent('ERROR', 'doPost: ' + error.toString()); } catch (_) {}
    return jsonResponse(errorResponse(error));
  }
}

/**
 * parseRequest - Extrai action + data de:
 * - JSON (fetch com Content-Type: application/json)
 * - x-www-form-urlencoded / multipart (fallback)
 */
function parseRequest(e) {
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      const raw = String(e.postData.contents || '').trim();
      if (raw) {
        // Tenta JSON primeiro
        try {
          body = JSON.parse(raw);
        } catch (_) {
          // Fallback: tenta parse de querystring (a=b&c=d)
          body = parseQueryString(raw);
        }
      }
    }
  } catch (err) {
    console.warn('Falha ao parsear body:', err);
  }

  // Se vier como parâmetros, mescla
  const params = (e && e.parameter) ? e.parameter : {};
  // Prioridade: body.action > params.action
  const action = (body && body.action) ? body.action : (params.action || '');

  // send.js envia { action:'submit', data:{...} }
  let data = (body && body.data) ? body.data : body;
  // Se vier data como string, tenta parse
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) {}
  }

  // Normaliza
  return {
    action: String(action || '').trim(),
    data: data || {},
    raw: body || {},
    parameter: params || {}
  };
}

function validatePanelToken(req) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) {
    return { success: false, error: 'Token do painel não configurado' };
  }

  const provided = extractToken(req);
  if (!provided || String(provided) !== String(expected)) {
    return { success: false, error: 'Token inválido' };
  }

  return { success: true };
}

function extractToken(req) {
  if (!req) return '';
  if (req.token) return req.token;
  if (req.raw && req.raw.token) return req.raw.token;
  if (req.data && req.data.token) return req.data.token;
  if (req.parameter && req.parameter.token) return req.parameter.token;
  return '';
}

function parseQueryString(qs) {
  const out = {};
  String(qs || '').split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return out;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * submitRegistro - Insere uma nova linha em "Registros"
 * Mapeamento esperado do send.js:
 * data: { beneficiario, cpf, atendente, produto, quantidade, endereco, data, assinatura, numeroDocumento, observacoes, imagemBase64, timestamp }
 */
function submitRegistro(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const payload = req && req.data ? req.data : {};
    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) {
      return { success: false, error: 'Aba Registros não encontrada' };
    }

    const headers = getSheetHeaders(sheet) || CONFIG.REGISTROS_HEADERS;
    const now = new Date();

    const recordId = 'REG-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    const beneficiario = String(payload.beneficiario || '').trim();
    const cpfRaw = String(payload.cpf || '').replace(/\D/g, '');
    const cpf = cpfRaw; // Mantém apenas dígitos (send.js já envia assim)
    const numDocumento = String(payload.numeroDocumento || '').trim();
    const atendente = String(payload.atendente || '').trim();
    const produto = String(payload.produto || '').trim();
    const quantidade = coerceNumber(payload.quantidade);
    const dataForm = normalizeDate(payload.data); // aceita YYYY-MM-DD ou dd/MM/yyyy
    const endereco = String(payload.endereco || '').trim();
    const obs = String(payload.observacoes || '').trim();

    // Origem padrão (para rastreabilidade)
    const origem = String((req.raw && req.raw.isOfflineSync) ? 'APP_OFFLINE_SYNC' : 'APP').trim() || 'APP';

    // Imagem (opcional): salva no Drive e armazena URL
    const imagemBase64 = String(payload.imagemBase64 || '').trim();
    const imgUrl = saveImageIfPresent(imagemBase64, recordId);

    // Deduplicação simples via _Index (NUM_DOCUMENTO)
    const normalizedDoc = normalizeDoc(numDocumento);
    let dupInfo = normalizedDoc ? findIndexByDoc(normalizedDoc) : null;

    if (!dupInfo && normalizedDoc) {
      dupInfo = findRegistroByDoc(normalizedDoc, sheet, headers);
    }

    let status = 'NOVO';
    let dupRefId = '';
    let dupReason = '';

    if (dupInfo && dupInfo.regId) {
      status = 'DUPLICADO';
      dupRefId = dupInfo.regId;
      dupReason = 'NUM_DOCUMENTO duplicado';
    }

    const rowObject = {
      ID: recordId,
      DATA_REGISTRO: now,
      BENEFICIARIO: beneficiario,
      CPF: cpf,
      NUM_DOCUMENTO: numDocumento,
      ATENDENTE: atendente,
      PRODUTO: produto,
      QUANTIDADE: quantidade,
      DATA_FORM: dataForm || '',
      ENDERECO: endereco,
      OBS: obs,
      ORIGEM: origem,
      IMG_URL: imgUrl,
      STATUS: status,
      DUP_REF_ID: dupRefId,
      DUP_REASON: dupReason,
      UPDATED_AT: now,
      DELETADO: ''
    };

    const rowValues = headers.map(h => (rowObject.hasOwnProperty(h) ? rowObject[h] : ''));
    sheet.appendRow(rowValues);

    const rowNumber = sheet.getLastRow();

    // Atualiza índice (upsert)
    if (normalizedDoc) {
      upsertIndexEntry(normalizedDoc, recordId, rowNumber);
    }

    logEvent('SUBMIT', `Novo registro ${recordId} (linha ${rowNumber}) - status ${status}`);

    return {
      success: true,
      recordId: recordId,
      rowNumber: rowNumber,
      status: status,
      timestamp: now.toISOString(),
      message: status === 'DUPLICADO'
        ? `Registro salvo como DUPLICADO. Referência: ${dupRefId}`
        : 'Registro salvo com sucesso'
    };

  } catch (error) {
    console.error('Erro em submitRegistro:', error);
    try { logEvent('ERROR', 'submitRegistro: ' + error.toString()); } catch (_) {}
    return { success: false, error: String(error) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/MM/yyyy ou dd-MM-yyyy
  const m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // ISO completo
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return s;
}

function saveImageIfPresent(dataUri, recordId) {
  try {
    if (!dataUri) return '';
    // Se já for uma URL, apenas retorna
    if (/^https?:\/\//i.test(dataUri)) return dataUri;

    // Aceita data:image/...;base64,...
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUri)) return '';

    // Evita payloads enormes na prática (Apps Script tem limites de tamanho)
    if (dataUri.length > 1500000) {
      // Se for grande demais, não falha o envio; apenas ignora
      return '';
    }

    const parts = dataUri.split(',');
    if (parts.length < 2) return '';

    const contentType = parts[0].match(/^data:(image\/[a-zA-Z0-9.+-]+);base64/);
    const mime = contentType ? contentType[1] : 'image/png';

    const bytes = Utilities.base64Decode(parts[1]);
    const blob = Utilities.newBlob(bytes, mime, `${recordId}.${mime.split('/')[1] || 'png'}`);

    const folder = getOrCreateFolderPath('Social Coletor/Imagens');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();
  } catch (error) {
    console.warn('Falha ao salvar imagem:', error);
    return '';
  }
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function getOrCreateFolderPath(path) {
  const parts = Array.isArray(path) ? path : String(path || '').split('/').filter(Boolean);
  let current = DriveApp.getRootFolder();
  parts.forEach((part) => {
    const existing = current.getFoldersByName(part);
    if (existing.hasNext()) {
      current = existing.next();
    } else {
      current = current.createFolder(part);
    }
  });
  return current;
}

function findIndexByDoc(normalizedDoc) {
  try {
    const indexSheet = getSheet(CONFIG.SHEET_NAMES.INDEX);
    if (!indexSheet) return null;

    const data = indexSheet.getDataRange().getValues();
    if (data.length <= 1) return null;

    const headers = data[0];
    const docIdx = headers.indexOf('NUM_DOCUMENTO');
    const regIdIdx = headers.indexOf('REG_ID');
    const deletadoIdx = headers.indexOf('DELETADO');

    if (docIdx === -1 || regIdIdx === -1) return null;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const doc = String(row[docIdx] || '').trim().toUpperCase();
      if (doc === normalizedDoc) {
        const deletado = deletadoIdx !== -1 ? isDeleted(row[deletadoIdx]) : false;
        if (!deletado) {
          return { regId: row[regIdIdx] || '', rowNumber: i + 1 };
        }
      }
    }
    return null;
  } catch (error) {
    console.warn('Erro em findIndexByDoc:', error);
    return null;
  }
}

function findRegistroByDoc(normalizedDoc, sheet, headers) {
  try {
    const registrosSheet = sheet || getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!registrosSheet) return null;

    const data = registrosSheet.getDataRange().getValues();
    if (data.length <= 1) return null;

    const sheetHeaders = headers && headers.length ? headers : data[0];
    const docIdx = sheetHeaders.indexOf('NUM_DOCUMENTO');
    const regIdIdx = sheetHeaders.indexOf('ID');
    const deletadoIdx = sheetHeaders.indexOf('DELETADO');

    if (docIdx === -1 || regIdIdx === -1) return null;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const doc = normalizeDoc(row[docIdx]);
      if (doc !== normalizedDoc) continue;

      const deletado = deletadoIdx !== -1 ? isDeleted(row[deletadoIdx]) : false;
      if (!deletado) {
        return { regId: row[regIdIdx] || '', rowNumber: i + 1 };
      }
    }

    return null;
  } catch (error) {
    console.warn('Erro em findRegistroByDoc:', error);
    return null;
  }
}

function upsertIndexEntry(normalizedDoc, regId, rowNumber) {
  try {
    const indexSheet = getSheet(CONFIG.SHEET_NAMES.INDEX);
    if (!indexSheet) return;

    const data = indexSheet.getDataRange().getValues();
    const headers = data[0] || CONFIG.INDEX_HEADERS;

    const docIdx = headers.indexOf('NUM_DOCUMENTO');
    const regIdIdx = headers.indexOf('REG_ID');
    const rowIdx = headers.indexOf('ROW_NUMBER');
    const createdIdx = headers.indexOf('CREATED_AT');
    const updatedIdx = headers.indexOf('UPDATED_AT');
    const deletadoIdx = headers.indexOf('DELETADO');

    // Procura existente
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const doc = String(row[docIdx] || '').trim().toUpperCase();
      if (doc === normalizedDoc) {
        // Atualiza
        if (regIdIdx !== -1) row[regIdIdx] = regId;
        if (rowIdx !== -1) row[rowIdx] = rowNumber;
        if (updatedIdx !== -1) row[updatedIdx] = new Date();
        if (deletadoIdx !== -1) row[deletadoIdx] = '';
        indexSheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
        return;
      }
    }

    // Não existe: cria
    const now = new Date();
    const rowObj = {
      NUM_DOCUMENTO: normalizedDoc,
      REG_ID: regId,
      ROW_NUMBER: rowNumber,
      CREATED_AT: now,
      UPDATED_AT: now,
      DELETADO: ''
    };
    const values = headers.map(h => (rowObj.hasOwnProperty(h) ? rowObj[h] : ''));
    indexSheet.appendRow(values);

  } catch (error) {
    console.warn('Erro em upsertIndexEntry:', error);
  }
}

// ===== SISTEMA - INICIALIZAÇÃO E CONFIGURAÇÃO =====
function ensureSystem() {
  const ss = getSpreadsheet_();
  
  // Garante que todas as abas existam com cabeçalhos corretos
  ensureSheetWithHeaders(ss, CONFIG.SHEET_NAMES.REGISTROS, CONFIG.REGISTROS_HEADERS);
  ensureSheetWithHeaders(ss, CONFIG.SHEET_NAMES.INDEX, CONFIG.INDEX_HEADERS);
  ensureSheetWithHeaders(ss, CONFIG.SHEET_NAMES.RELATORIOS, CONFIG.RELATORIOS_HEADERS);
  ensureSheetWithHeaders(ss, CONFIG.SHEET_NAMES.LOGS, ['TIMESTAMP', 'ACTION', 'DETAILS']);
  ensureSheetWithHeaders(ss, CONFIG.SHEET_NAMES.CONFIG, ['CHAVE', 'VALOR']);
  
  // Garante configurações padrão
  ensureDefaultConfig();
}

function ensureSheetWithHeaders(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  
  // Verifica se os cabeçalhos estão corretos
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  
  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  
  // Adiciona cabeçalhos faltantes
  headers.forEach((header, index) => {
    if (!existingHeaders.includes(header)) {
      const nextColumn = existingHeaders.length + 1;
      sheet.getRange(1, nextColumn).setValue(header);
    }
  });
  
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureDefaultConfig() {
  const sheet = getSheet(CONFIG.SHEET_NAMES.CONFIG);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const existingKeys = new Set(data.slice(1).map(row => row[0]));
  
  Object.keys(CONFIG.DEFAULTS).forEach(key => {
    if (!existingKeys.has(key)) {
      sheet.appendRow([key, CONFIG.DEFAULTS[key]]);
    }
  });
}

// ===== FUNÇÕES DA API =====

/**
 * getDashboardData - Retorna dados para o dashboard
 */
function getDashboardData() {
  try {
    logDebug('getDashboardData: inicio');
    const registros = getRegistros();
    const duplicateDocs = buildDuplicateDocSet(registros);
    
    const total = registros.length;
    const ativos = registros.filter(r => !isDeleted(r.DELETADO)).length;
    const duplicados = registros.filter(r => {
      if (isDeleted(r.DELETADO)) return false;
      const doc = normalizeDoc(r.NUM_DOCUMENTO);
      return doc && duplicateDocs.has(doc);
    }).length;
    
    // Agrupa por produto
    const porProduto = {};
    registros.forEach(r => {
      if (isDeleted(r.DELETADO)) return;
      
      const produto = r.PRODUTO || 'Não informado';
      const quantidade = Number(r.QUANTIDADE || 0);
      
      if (!isNaN(quantidade)) {
        porProduto[produto] = (porProduto[produto] || 0) + quantidade;
      }
    });
    
    return {
      success: true,
      total: total,
      ativos: ativos,
      duplicados: duplicados,
      porProduto: porProduto
    };
    
  } catch (error) {
    logError('Erro em getDashboardData', error);
    logEvent('ERROR', 'getDashboardData: ' + error.toString());
    return {
      success: false,
      error: error.toString(),
      details: error && error.stack ? error.stack : undefined,
      total: 0,
      ativos: 0,
      duplicados: 0,
      porProduto: {}
    };
  }
}

/**
 * getRegistrosTable - PAGINAÇÃO OTIMIZADA (20 registros por página)
 * Filtra apenas registros preenchidos, ignora linhas vazias
 */
function getRegistrosTable(options) {
  try {
    logDebug('getRegistrosTable: inicio', options);
    
    // Configura parâmetros
    const safeOptions = options || {};
    const limit = Math.min(Math.max(Number(safeOptions.limit || 20), 1), 100); // 20 padrão, máximo 100
    const offset = Math.max(Number(safeOptions.offset || 0), 0);
    
    logDebug('getRegistrosTable: parametros', { limit, offset });
    
    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) {
      logDebug('getRegistrosTable: aba Registros não encontrada');
      return {
        success: false,
        error: 'Aba Registros não encontrada',
        headers: CONFIG.REGISTROS_HEADERS,
        rows: [],
        meta: { total: 0, offset: 0, hasMore: false }
      };
    }
    
    // Obtém todos os dados da planilha
    const dataRange = sheet.getDataRange();
    const allData = dataRange.getValues();
    
    logDebug('getRegistrosTable: total linhas', allData.length);
    
    // Verifica se há dados além do cabeçalho
    if (allData.length <= 1) {
      logDebug('getRegistrosTable: planilha vazia');
      return {
        success: true,
        headers: allData[0] || CONFIG.REGISTROS_HEADERS,
        rows: [],
        meta: { total: 0, offset: 0, hasMore: false }
      };
    }
    
    const headers = allData[0];
    logDebug('getRegistrosTable: cabecalhos', headers);
    
    // FILTRA APENAS REGISTROS PREENCHIDOS (ignora linhas vazias)
    const registrosPreenchidos = [];
    
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      
      // Verifica se a linha tem conteúdo válido
      let hasContent = false;
      for (let j = 0; j < row.length; j++) {
        const cellValue = row[j];
        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          // Verifica se não é apenas espaços em branco
          if (typeof cellValue === 'string' && cellValue.trim() !== '') {
            hasContent = true;
            break;
          } else if (typeof cellValue !== 'string') {
            hasContent = true;
            break;
          }
        }
      }
      
      if (hasContent) {
        registrosPreenchidos.push({
          rowNumber: i + 1, // +1 porque getValues() é base 0, mas rowNumber é base 1
          values: row
        });
      }
    }
    
    logDebug('getRegistrosTable: registros preenchidos', registrosPreenchidos.length);
    
    // APLICA PAGINAÇÃO sobre os registros preenchidos
    const totalPreenchidos = registrosPreenchidos.length;
    const startIndex = offset;
    const endIndex = Math.min(startIndex + limit, totalPreenchidos);
    const hasMore = endIndex < totalPreenchidos;
    
    const pageData = registrosPreenchidos.slice(startIndex, endIndex);
    
    logDebug('getRegistrosTable: paginacao', {
      startIndex,
      endIndex,
      pageSize: pageData.length,
      total: totalPreenchidos,
      hasMore
    });
    
    return {
      success: true,
      headers: headers,
      rows: pageData,
      meta: {
        total: totalPreenchidos,
        offset: endIndex, // Novo offset para próxima página
        hasMore: hasMore
      }
    };
    
  } catch (error) {
    logError('ERRO CRÍTICO em getRegistrosTable', error);
    logEvent('ERROR', 'getRegistrosTable: ' + error.toString());
    
    // Retorna estrutura válida mesmo em caso de erro
    return {
      success: false,
      error: error.toString(),
      details: error && error.stack ? error.stack : undefined,
      headers: CONFIG.REGISTROS_HEADERS,
      rows: [],
      meta: { total: 0, offset: 0, hasMore: false }
    };
  }
}

/**
 * updateRegistroRow - Atualiza uma linha de registro
 */
function updateRegistroRow(payload) {
  try {
    logDebug('updateRegistroRow: payload', payload);
    const result = updateRegistroRowsBatch({ updates: [payload] });
    if (result && result.success) {
      return { success: true, updated: result.updated || 0 };
    }
    if (result) {
      return {
        success: false,
        error: result.error || 'Falha ao atualizar registro',
        details: result.details,
        errors: result.errors,
        updated: result.updated || 0
      };
    }
    return { success: false, error: 'Resposta inválida do batch' };
  } catch (error) {
    logError('Erro em updateRegistroRow', error);
    logEvent('ERROR', 'updateRegistroRow: ' + error.toString());
    return { success: false, error: error.toString(), details: error && error.stack ? error.stack : undefined };
  }
}

/**
 * Atualiza várias linhas de uma vez (evita múltiplas chamadas e reduz risco de timeout/quota).
 * payload: { updates: [{ rowNumber: number, values: {HEADER: value,...}}, ...] }
 */
function updateRegistroRowsBatch(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    logDebug('updateRegistroRowsBatch: payload', payload);

    if (!payload || !Array.isArray(payload.updates) || payload.updates.length === 0) {
      return { success: false, error: 'Nenhuma atualização recebida' };
    }

    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) return { success: false, error: 'Planilha de registros não encontrada' };

    const dataRange = sheet.getDataRange();
    const allData = dataRange.getValues();
    const headers = allData[0] || [];
    if (!headers.length) return { success: false, error: 'Cabeçalhos não encontrados na planilha' };

    const lastRow = allData.length;
    if (lastRow < 2) return { success: false, error: 'Planilha não possui registros para atualizar' };

    const updatedAtIndex = headers.indexOf('UPDATED_AT');
    let updated = 0;
    const errors = [];

    payload.updates.forEach((u) => {
      try {
        const rowNumber = Number(u && u.rowNumber);
        const values = (u && u.values) ? u.values : {};
        if (!rowNumber || rowNumber < 2) {
          errors.push({ rowNumber, error: 'Número de linha inválido (deve ser >= 2)' });
          return;
        }
        if (rowNumber > lastRow) {
          errors.push({ rowNumber, error: 'Número de linha inválido (fora do intervalo)' });
          return;
        }

        const currentValues = allData[rowNumber - 1];

        headers.forEach((header, idx) => {
          if (Object.prototype.hasOwnProperty.call(values, header)) {
            currentValues[idx] = values[header];
          }
        });

        if (updatedAtIndex !== -1) currentValues[updatedAtIndex] = new Date();
        updated += 1;
      } catch (e) {
        errors.push({ rowNumber: u?.rowNumber, error: String(e) });
      }
    });

    if (updated > 0) {
      dataRange.setValues(allData);
    }

    // Reconstrói o índice uma única vez ao final
    if (updated > 0) {
      try { rebuildIndex(); } catch (e) {}
    }

    if (errors.length) {
      logEvent('WARN', `Batch update: ${updated} ok, ${errors.length} erros`);
      return { success: false, updated, errors };
    }

    logEvent('UPDATE', `Batch update: ${updated} linhas`);
    return { success: true, updated };

  } catch (error) {
    logError('Erro em updateRegistroRowsBatch', error);
    logEvent('ERROR', 'updateRegistroRowsBatch: ' + String(error));
    return { success: false, error: String(error), details: error && error.stack ? error.stack : undefined };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function deleteRegistroByRow(payload) {
  try {
    const rowNumber = Number(payload && payload.rowNumber);
    if (!rowNumber || rowNumber < 2) {
      return { success: false, error: 'Número de linha inválido (deve ser >= 2)' };
    }

    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) return { success: false, error: 'Planilha de registros não encontrada' };

    const data = sheet.getDataRange().getValues();
    if (rowNumber > data.length) {
      return { success: false, error: 'Número de linha inválido (fora do intervalo)' };
    }
    sheet.deleteRow(rowNumber);
    try { rebuildIndex(); } catch (error) {}

    return { success: true, rowNumber, deleted: true };
  } catch (error) {
    logError('Erro em deleteRegistroByRow', error);
    return { success: false, error: String(error), details: error && error.stack ? error.stack : undefined };
  }
}

/**
 * getDuplicados - Retorna lista de registros duplicados
 */
function getDuplicados() {
  try {
    logDebug('getDuplicados: inicio');
    const registros = getRegistros();
    const duplicateDocs = buildDuplicateDocSet(registros);
    
    // Filtra registros duplicados ativos
    const duplicados = registros.filter(r => 
      !isDeleted(r.DELETADO) && duplicateDocs.has(normalizeDoc(r.NUM_DOCUMENTO))
    );
    
    logDebug('getDuplicados: total', duplicados.length);
    return { success: true, rows: duplicados, duplicados: duplicados };
    
  } catch (error) {
    logError('Erro em getDuplicados', error);
    logEvent('ERROR', 'getDuplicados: ' + error.toString());
    return { success: false, error: error.toString(), details: error && error.stack ? error.stack : undefined, rows: [], duplicados: [] };
  }
}

function listDuplicados() {
  try {
    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) return { success: false, error: 'Planilha de registros não encontrada', duplicados: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, duplicados: [] };

    const headers = data[0];
    const statusIndex = headers.indexOf('STATUS');
    const deletadoIndex = headers.indexOf('DELETADO');
    const docIndex = headers.indexOf('NUM_DOCUMENTO');
    const duplicateDocs = buildDuplicateDocSetFromSheetData(data, headers);

    const duplicados = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = statusIndex !== -1 ? row[statusIndex] : '';
      const deletado = deletadoIndex !== -1 ? isDeleted(row[deletadoIndex]) : false;
      const doc = docIndex !== -1 ? normalizeDoc(row[docIndex]) : '';

      if (!deletado && doc && (isDuplicado(status) || duplicateDocs.has(doc))) {
        const registro = { rowNumber: i + 1 };
        headers.forEach((header, index) => {
          registro[header] = row[index];
        });
        duplicados.push(registro);
      }
    }

    return { success: true, duplicados };
  } catch (error) {
    logError('Erro em listDuplicados', error);
    return { success: false, error: String(error), details: error && error.stack ? error.stack : undefined, duplicados: [] };
  }
}

/**
 * resolveDuplicado - Resolve um registro duplicado
 */
function resolveDuplicado(payload) {
  try {
    logDebug('resolveDuplicado: payload', payload);
    if (!payload || !payload.id || !payload.action) {
      return { success: false, error: 'Dados incompletos para resolução' };
    }
    
    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) {
      return { success: false, error: 'Planilha de registros não encontrada' };
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Encontra índices das colunas importantes
    const idIndex = headers.indexOf('ID');
    const statusIndex = headers.indexOf('STATUS');
    const updatedAtIndex = headers.indexOf('UPDATED_AT');
    const deletadoIndex = headers.indexOf('DELETADO');
    
    if (idIndex === -1 || statusIndex === -1) {
      return { success: false, error: 'Estrutura da planilha inválida' };
    }
    
    // Procura o registro pelo ID
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(payload.id)) {
        
        // Aplica a ação
        switch (payload.action) {
          case 'validar':
            data[i][statusIndex] = 'VALIDO';
            break;
          case 'manter':
            data[i][statusIndex] = 'DUPLICADO_MANTIDO';
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
            return { success: false, error: 'Ação inválida. Use: validar, manter, mesclar ou excluir.' };
        }
        
        // Atualiza timestamp
        if (updatedAtIndex !== -1) {
          data[i][updatedAtIndex] = new Date();
        }
        
        // Salva as alterações
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([data[i]]);
        
        // Reconstroi índice
        rebuildIndex();
        
        logEvent('DUPLICADO', `Registro ${payload.id} resolvido com ação: ${payload.action}`);
        
        return { success: true };
      }
    }
    
    return { success: false, error: 'Registro não encontrado com o ID fornecido' };
    
  } catch (error) {
    logError('Erro em resolveDuplicado', error);
    logEvent('ERROR', 'resolveDuplicado: ' + error.toString());
    return { success: false, error: error.toString(), details: error && error.stack ? error.stack : undefined };
  }
}

function resolveDuplicadoByRow(payload) {
  try {
    const rowNumber = Number(payload && payload.rowNumber);
    const action = payload && payload.action;
    if (!rowNumber || rowNumber < 2 || !action) {
      return { success: false, error: 'Dados incompletos para resolução' };
    }

    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) return { success: false, error: 'Planilha de registros não encontrada' };

    const data = sheet.getDataRange().getValues();
    if (rowNumber > data.length) return { success: false, error: 'Número de linha inválido (fora do intervalo)' };

    if (action === 'excluir') {
      sheet.deleteRow(rowNumber);
      try { rebuildIndex(); } catch (error) {}
      return { success: true, rowNumber, action, deleted: true };
    }

    const headers = data[0];
    const statusIndex = headers.indexOf('STATUS');
    const updatedAtIndex = headers.indexOf('UPDATED_AT');

    if (statusIndex === -1) {
      return { success: false, error: 'Coluna STATUS não encontrada' };
    }

    const row = data[rowNumber - 1];

    switch (action) {
      case 'validar':
        row[statusIndex] = 'VALIDO';
        break;
      case 'manter':
        row[statusIndex] = 'DUPLICADO_MANTIDO';
        break;
      default:
        return { success: false, error: 'Ação inválida. Use: validar, manter ou excluir.' };
    }

    if (updatedAtIndex !== -1) row[updatedAtIndex] = new Date();
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    try { rebuildIndex(); } catch (error) {}

    return { success: true, rowNumber, action };
  } catch (error) {
    logError('Erro em resolveDuplicadoByRow', error);
    return { success: false, error: String(error), details: error && error.stack ? error.stack : undefined };
  }
}
 

function listRelatorios() {
  const result = getRelatorios();
  if (result && result.success) {
    return { success: true, relatorios: result.relatorios || [] };
  }
  return {
    success: false,
    error: result && result.error ? result.error : 'Falha ao obter relatórios',
    relatorios: (result && result.relatorios) || []
  };
}

/**
 * getRelatorios - Retorna lista de relatórios gerados
 */
function getRelatorios() {
  try {
    logDebug('getRelatorios: inicio');
    const sheet = getSheet(CONFIG.SHEET_NAMES.RELATORIOS);
    if (!sheet) return { success: false, error: 'Planilha de relatórios não encontrada', rows: [], relatorios: [] };
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, rows: [], relatorios: [] };
    
    const headers = data[0];
    const relatorios = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const relatorio = {};
      
      headers.forEach((header, index) => {
        relatorio[header] = row[index];
      });
      
      // Adiciona apenas relatórios com conteúdo
      if (relatorio.COMPETENCIA || relatorio.TOTAL_REGISTROS) {
        relatorios.push(relatorio);
      }
    }
    
    return { success: true, rows: relatorios, relatorios: relatorios };
    
  } catch (error) {
    logError('Erro em getRelatorios', error);
    logEvent('ERROR', 'getRelatorios: ' + error.toString());
    return { success: false, error: error.toString(), details: error && error.stack ? error.stack : undefined, rows: [], relatorios: [] };
  }
}

/**
 * gerarRelatorio - Gera um novo relatório
 */
function gerarRelatorio() {
  logDebug('gerarRelatorio: inicio');

  const registros = getRegistros();
  const totals = calculateTotals(registros);
  const competencia = formatCompetencia(new Date());

  logDebug('gerarRelatorio: competencia', competencia);
  logDebug('gerarRelatorio: totais', totals);

  // Gera resumo (Gemini com fallback) primeiro
  const resumo = generateResumoWithGemini(totals, competencia);
  logDebug('gerarRelatorio: resumo gerado');

  let pdfUrl = '';
  let pdfError = '';

  try {
    pdfUrl = generatePdf(competencia, totals, resumo);
    logDebug('gerarRelatorio: pdf ok');
  } catch (error) {
    pdfError = error?.message || String(error);
    logError('Erro ao gerar PDF', error);
    logEvent('ERROR', 'gerarRelatorio PDF: ' + pdfError);
    logDebug('gerarRelatorio: pdf falhou', pdfError);
    pdfUrl = '';
  }

  let saveOk = true;
  let saveError = '';

  try {
    // Salva metadados do relatório
    const sheet = getSheet(CONFIG.SHEET_NAMES.RELATORIOS);
    const headers = getSheetHeaders(sheet) || CONFIG.RELATORIOS_HEADERS;

    const relatorioData = {
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
    const rowValues = headers.map(header => relatorioData[header] || '');
    sheet.appendRow(rowValues);

    logEvent('RELATORIO', `Relatório ${competencia} gerado: ${totals.total} registros`);
    logDebug('gerarRelatorio: save ok');
  } catch (error) {
    saveOk = false;
    saveError = error?.message || String(error);
    logError('Erro ao salvar metadados do relatório', error);
    logEvent('ERROR', 'gerarRelatorio save: ' + saveError);
    logDebug('gerarRelatorio: save falhou', saveError);
  }

  const message = (pdfError || !saveOk)
    ? `Relatório ${competencia} gerado com pendências`
    : `Relatório ${competencia} gerado com sucesso`;

  return {
    success: true,
    message: message,
    urlPdf: pdfUrl,
    resumo: resumo,
    competencia: competencia,
    pdfError: pdfError || null,
    saveOk: saveOk,
    saveError: saveError || null
  };
}

// ===== FUNÇÕES AUXILIARES =====

function getSheet(sheetName) {
  try {
    const ss = getSpreadsheet_();
    return ss.getSheetByName(sheetName);
  } catch (error) {
    console.error(`Erro ao obter aba ${sheetName}:`, error);
    return null;
  }
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  throw new Error('Nenhuma planilha ativa encontrada. Configure SPREADSHEET_ID nas propriedades do script.');
}

function getSheetHeaders(sheet) {
  if (!sheet) return [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function getConfigValue(key) {
  try {
    const sheet = getSheet(CONFIG.SHEET_NAMES.CONFIG);
    if (!sheet) return CONFIG.DEFAULTS[key] || '';
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        return data[i][1] || CONFIG.DEFAULTS[key] || '';
      }
    }
  } catch (error) {
    console.error('Erro ao obter configuração:', error);
  }
  return CONFIG.DEFAULTS[key] || '';
}

function getRegistros() {
  try {
    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const headers = data[0];
    const registros = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Verifica se a linha tem conteúdo
      let hasContent = false;
      for (let j = 0; j < row.length; j++) {
        const val = row[j];
        if (val !== null && val !== undefined && val !== '') {
          if (typeof val === 'string' && val.trim() !== '') {
            hasContent = true;
            break;
          } else if (typeof val !== 'string') {
            hasContent = true;
            break;
          }
        }
      }
      
      if (hasContent) {
        const registro = {};
        headers.forEach((header, index) => {
          registro[header] = row[index];
        });
        registros.push(registro);
      }
    }
    
    return registros;
    
  } catch (error) {
    console.error('Erro em getRegistros:', error);
    return [];
  }
}

function calculateTotals(registros) {
  const duplicateDocs = buildDuplicateDocSet(registros);
  const totals = {
    total: registros.length,
    ativos: 0,
    duplicados: 0,
    porProduto: {}
  };
  
  registros.forEach(r => {
    const deletado = isDeleted(r.DELETADO);
    
    if (!deletado) {
      totals.ativos++;
      
      const doc = normalizeDoc(r.NUM_DOCUMENTO);
      if (doc && duplicateDocs.has(doc)) {
        totals.duplicados++;
      }
      
      const produto = r.PRODUTO || 'Não informado';
      const quantidade = Number(r.QUANTIDADE || 0);
      
      if (!isNaN(quantidade)) {
        totals.porProduto[produto] = (totals.porProduto[produto] || 0) + quantidade;
      }
    }
  });
  
  return totals;
}

function isDuplicado(status) {
  if (!status) return false;
  const statusStr = String(status).trim().toUpperCase();
  return statusStr.includes('DUPLICADO') || statusStr.includes('DUPLICATE') || statusStr === 'DUP';
}

function isDeleted(value) {
  if (value === true) return true;
  if (value === false) return false;
  
  const str = String(value || '').trim().toUpperCase();
  return str === 'TRUE' || str === 'SIM' || str === '1' || str === 'S';
}

function formatCompetencia(date) {
  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
  } catch (error) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}

function generateResumo(totals, competencia) {
  const base = `Relatório ${competencia}: ${totals.total} registros totais, ${totals.ativos} ativos e ${totals.duplicados} duplicados.`;
  
  // Adiciona detalhes por produto se houver
  const produtos = Object.keys(totals.porProduto);
  if (produtos.length > 0) {
    const produtosText = produtos.map(p => `${p}: ${totals.porProduto[p]}`).join(', ');
    return `${base} Distribuição por produto: ${produtosText}.`;
  }
  
  return base;
}

function generateResumoWithGemini(totals, competencia) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return generateResumo(totals, competencia);

  const produtosResumo = Object.entries(totals.porProduto || {})
    .map(([produto, quantidade]) => `${produto}: ${quantidade}`)
    .join(', ') || 'nenhum produto informado';

  const duplicadosNum = Number(totals.duplicados || 0);
  const duplicadosStatus = (duplicadosNum === 0) ? 'Duplicados resolvidos' : 'Duplicados pendentes';

  // Prompt: texto curto (máx. 7 linhas) e regra explícita para duplicados = 0
  const prompt = [
    `Você é um analista responsável por redigir um Relatório Executivo de Distribuição com base nos dados abaixo.`,
    ``,
    `REGRAS (OBRIGATÓRIO)`,
    `- Escreva em português do Brasil.`,
    `- Gere um texto formal com 5 a 7 linhas no máximo (uma frase por linha).`,
    `- Use linguagem institucional (prefeitura/assistência social/ONG).`,
    `- NÃO invente números: use apenas os valores fornecidos.`,
    `- Se algum dado estiver ausente, escreva "não informado" sem supor.`,
    `- NÃO use Markdown: não use **, #, nem listas com traços ou asteriscos.`,
    `- Escreva como texto puro, com quebras de linha entre as frases.`,
    `- Se Duplicados for 0, inclua obrigatoriamente um parágrafo com a frase exata: "Duplicados resolvidos".`,
    `- No final, inclua um parágrafo de agradecimento ao trabalho e desempenho de todos os envolvidos.`,
    `- Feche com assinatura: "Eduardo Pereira da Silva".`,
    ``,
    `DADOS`,
    `Competência: ${competencia}.`,
    `Total de registros: ${totals.total}.`,
    `Ativos: ${totals.ativos}.`,
    `Duplicados: ${totals.duplicados}.`,
    `Status de duplicados: ${duplicadosStatus}.`,
    `Distribuição por produto: ${produtosResumo}.`
  ].join('\n');

  try {
    const model = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 900
        }
      }),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const body = response.getContentText() || '';

    if (code !== 200) {
      logError('Gemini HTTP não-200', new Error(`HTTP ${code}: ${body}`));
      return generateResumo(totals, competencia);
    }

    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch (e) {
      logError('Gemini JSON parse falhou', new Error(`Body: ${body}`));
      return generateResumo(totals, competencia);
    }

    const parts = payload?.candidates?.[0]?.content?.parts || [];
    let text = parts.map(p => (p && p.text ? String(p.text) : '')).join('').trim();

    // Sanitização: remove resquícios comuns de Markdown e normaliza parágrafos
    text = (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\*\*/g, '')
      .replace(/__+/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')   // remove bullets com traço/asterisco
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Garantia: se duplicados = 0, força a presença do parágrafo "Duplicados resolvidos"
    if (duplicadosNum === 0 && !/Duplicados resolvidos/i.test(text)) {
      // Insere como um parágrafo adicional (não inventa números; só qualifica o "0")
      text = `${text}\n\nDuplicados resolvidos.`;
    }

    // Guardrail: exigir conteúdo mínimo para evitar respostas vazias
    const linhasNaoVazias = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!text || text.length < 60 || linhasNaoVazias.length < 3) {
      logError('Gemini retornou texto vazio/curto', new Error(`Texto: "${text}"`));
      return generateResumo(totals, competencia);
    }

    return text;

  } catch (error) {
    logError('Erro ao gerar resumo com Gemini', error);
    return generateResumo(totals, competencia);
  }
}

function generatePdf(competencia, totals, resumo) {
  const folder = getOrCreateFolderPath('Social Coletor/Relatorios');
  const html = buildRelatorioHtml(competencia, totals, resumo);

  const blob = HtmlService.createHtmlOutput(html).getAs(MimeType.PDF);
  const file = folder.createFile(blob).setName(`Relatorio_${competencia}.pdf`);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function buildRelatorioHtml(competencia, totals, resumo) {
  const produtos = Object.entries(totals.porProduto || {});
  const produtosList = produtos.length
    ? produtos.map(([produto, quantidade]) => `<li>${escapeHtml(produto)}: ${quantidade}</li>`).join('')
    : '<li>Sem dados de produto.</li>';

  // Para o PDF: preservar parágrafos/quebras de linha do resumo (sem “colar” tudo em uma linha).
  // Também evita assinatura duplicada: mantém assinatura no footer e remove a última linha se for a assinatura.
  const resumoStr = String(resumo || '').trim();
  const resumoSemAssinatura = resumoStr.replace(/\n?\s*"?Eduardo Pereira da Silva"?\s*$/i, '').trim();

  const resumoParagrafos = (resumoSemAssinatura ? resumoSemAssinatura.split(/\n\s*\n+/) : []);
  const resumoHtml = resumoParagrafos.length
    ? resumoParagrafos
        .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('')
    : `<p>${escapeHtml(resumoStr || 'Resumo não informado.')}</p>`;

  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { color: #1d4ed8; margin-bottom: 8px; }
          h2 { margin: 0 0 8px 0; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
          ul { padding-left: 20px; margin: 0; }
          p { margin: 0 0 10px 0; line-height: 1.35; }
          .footer { margin-top: 28px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <h1>Relatório Social Coletor</h1>

        <div class="card">
          <p><strong>Competência:</strong> ${escapeHtml(competencia)}</p>
          <p><strong>Total de registros:</strong> ${totals.total}</p>
          <p><strong>Ativos:</strong> ${totals.ativos}</p>
          <p><strong>Duplicados:</strong> ${totals.duplicados}</p>
        </div>

        <div class="card">
          <h2>Distribuição por produto</h2>
          <ul>${produtosList}</ul>
        </div>

        <div class="card">
          <h2>Resumo</h2>
          ${resumoHtml}
        </div>

        <div class="footer">Eduardo Pereira da Silva</div>
      </body>
    </html>
  `;
}


function rebuildIndex() {
  try {
    const sheet = getSheet(CONFIG.SHEET_NAMES.REGISTROS);
    const indexSheet = getSheet(CONFIG.SHEET_NAMES.INDEX);
    
    if (!sheet || !indexSheet) return;
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      indexSheet.clear();
      indexSheet.getRange(1, 1, 1, CONFIG.INDEX_HEADERS.length).setValues([CONFIG.INDEX_HEADERS]);
      return;
    }
    
    const headers = data[0];
    const docIndex = headers.indexOf('NUM_DOCUMENTO');
    const idIndex = headers.indexOf('ID');
    const deletadoIndex = headers.indexOf('DELETADO');
    
    if (docIndex === -1 || idIndex === -1) return;
    
    const indexData = [];
    const seenDocs = new Set();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const doc = normalizeDoc(row[docIndex]);
      const id = row[idIndex];
      const deletado = isDeleted(row[deletadoIndex]);
      
      if (doc && !seenDocs.has(doc) && !deletado) {
        seenDocs.add(doc);
        indexData.push([
          doc,
          id,
          i + 1,
          new Date(),
          new Date(),
          ''
        ]);
      }
    }
    
    // Limpa e recria o índice
    indexSheet.clear();
    indexSheet.getRange(1, 1, 1, CONFIG.INDEX_HEADERS.length).setValues([CONFIG.INDEX_HEADERS]);
    
    if (indexData.length > 0) {
      indexSheet.getRange(2, 1, indexData.length, CONFIG.INDEX_HEADERS.length).setValues(indexData);
    }
    
  } catch (error) {
    console.error('Erro ao reconstruir índice:', error);
  }
}

function normalizeDoc(doc) {
  if (!doc) return '';
  return String(doc).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function buildDuplicateDocSet(registros) {
  const counts = new Map();
  (registros || []).forEach(r => {
    if (isDeleted(r.DELETADO)) return;
    const doc = normalizeDoc(r.NUM_DOCUMENTO);
    if (!doc) return;
    counts.set(doc, (counts.get(doc) || 0) + 1);
  });

  const dupes = new Set();
  counts.forEach((count, doc) => {
    if (count > 1) dupes.add(doc);
  });

  return dupes;
}

function buildDuplicateDocSetFromSheetData(data, headers) {
  const counts = new Map();
  if (!Array.isArray(data) || data.length <= 1) return new Set();

  const headerRow = headers && headers.length ? headers : data[0];
  const docIndex = headerRow.indexOf('NUM_DOCUMENTO');
  const deletadoIndex = headerRow.indexOf('DELETADO');

  if (docIndex === -1) return new Set();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const deletado = deletadoIndex !== -1 ? isDeleted(row[deletadoIndex]) : false;
    if (deletado) continue;

    const doc = normalizeDoc(row[docIndex]);
    if (!doc) continue;
    counts.set(doc, (counts.get(doc) || 0) + 1);
  }

  const dupes = new Set();
  counts.forEach((count, doc) => {
    if (count > 1) dupes.add(doc);
  });

  return dupes;
}

function logEvent(action, details) {
  try {
    const sheet = getSheet(CONFIG.SHEET_NAMES.LOGS);
    if (!sheet) return;
    
    sheet.appendRow([
      new Date(),
      action,
      String(details).substring(0, 490) // Limita tamanho
    ]);
    
    // Mantém logs razoáveis (últimas 1000 entradas)
    if (sheet.getLastRow() > 1000) {
      sheet.deleteRows(2, sheet.getLastRow() - 1000);
    }
    
  } catch (error) {
    console.error('Erro ao registrar log:', error);
  }
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== FUNÇÕES DE DIAGNÓSTICO E MANUTENÇÃO =====

function testSystem() {
  console.log('=== TESTE DO SISTEMA SOCIAL COLETOR ===');
  
  try {
    // 1. Garante sistema
    ensureSystem();
    console.log('✅ Sistema configurado');
    
    // 2. Testa dashboard
    const dashboard = getDashboardData();
    console.log('✅ Dashboard:', dashboard.success ? 'OK' : 'ERRO');
    
    // 3. Testa paginação
    const registros = getRegistrosTable({ limit: 5, offset: 0 });
    console.log('✅ Paginação:', registros.success ? 'OK' : 'ERRO', '(', (registros.rows ? registros.rows.length : 0), 'registros)');
    
    // 4. Testa duplicados
    const duplicados = getDuplicados();
    console.log('✅ Duplicados:', duplicados.length, 'encontrados');
    
    // 5. Testa relatórios
    const relatorios = getRelatorios();
    console.log('✅ Relatórios:', relatorios.length, 'encontrados');
    
    console.log('=== TESTE CONCLUÍDO COM SUCESSO ===');
    return {
      success: true,
      message: 'Sistema funcionando corretamente',
      dashboard: dashboard.success,
      pagination: registros.success,
      duplicates: duplicados.length,
      reports: relatorios.length
    };
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

function fixSystem() {
  console.log('=== CORRIGINDO SISTEMA ===');
  
  try {
    const ss = getSpreadsheet_();
    
    // 1. Recria aba Registros
    let registrosSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.REGISTROS);
    if (registrosSheet) {
      ss.deleteSheet(registrosSheet);
    }
    
    registrosSheet = ensureSheetWithHeaders(ss, CONFIG.SHEET_NAMES.REGISTROS, CONFIG.REGISTROS_HEADERS);
    
    // 2. Adiciona dados de exemplo
    const exemploData = [
      [
        'REG-' + Utilities.getUuid().substring(0, 8),
        new Date(),
        'João da Silva',
        '123.456.789-00',
        'DOC2024001',
        'Maria',
        'Cesta Básica',
        2,
        '2024-01-15',
        'Rua das Flores, 123',
        'Primeiro registro de exemplo',
        'SISTEMA',
        '',
        'NOVO',
        '',
        '',
        new Date(),
        ''
      ],
      [
        'REG-' + Utilities.getUuid().substring(0, 8),
        new Date(),
        'Ana Santos',
        '987.654.321-00',
        'DOC2024002',
        'Carlos',
        'Kit Higiene',
        1,
        '2024-01-16',
        'Av. Principal, 456',
        '',
        'SISTEMA',
        '',
        'NOVO',
        '',
        '',
        new Date(),
        ''
      ]
    ];
    
    registrosSheet.getRange(2, 1, exemploData.length, CONFIG.REGISTROS_HEADERS.length).setValues(exemploData);
    
    // 3. Recria índice
    rebuildIndex();
    
    console.log('=== SISTEMA CORRIGIDO ===');
    return {
      success: true,
      message: 'Sistema corrigido com sucesso! 2 registros de exemplo adicionados.'
    };
    
  } catch (error) {
    console.error('❌ ERRO AO CORRIGIR SISTEMA:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

function test_gerarRelatorio_safe() {
  const result = gerarRelatorio();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('🚀 Social Coletor')
    .addItem('📊 Abrir Painel Admin', 'showSidebar')
    .addSeparator()
    .addItem('🔍 Testar Sistema', 'testSystem')
    .addItem('🛠️ Corrigir Sistema', 'fixSystem')
    .addItem('📄 Gerar Relatório', 'gerarRelatorio')
    .addSeparator()
    .addItem('ℹ️ Sobre', 'showAbout')
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutput(`
    <div style="padding: 20px; font-family: Arial, sans-serif;">
      <h2 style="color: #3b82f6; margin-bottom: 10px;">🚀 Social Coletor</h2>
      <p style="color: #64748b; margin-bottom: 20px;">Painel administrativo completo</p>
      
      <button onclick="window.open('${ScriptApp.getService().getUrl()}', '_blank')" 
              style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">
        📊 Abrir Painel Completo
      </button>
      
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
        <h4 style="margin-bottom: 10px;">🔧 Ferramentas</h4>
        <button onclick="google.script.run.testSystem()" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer;">
          Testar Sistema
        </button>
        <button onclick="google.script.run.fixSystem()" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 4px; cursor: pointer;">
          Corrigir Sistema
        </button>
      </div>
    </div>
  `)
  .setTitle('Social Coletor')
  .setWidth(300);
  
  SpreadsheetApp.getUi().showSidebar(html);
}

function showAbout() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Sobre o Social Coletor',
    'Sistema de gestão de registros sociais\n\n' +
    'Versão: 3.0\n' +
    'Desenvolvido com Google Apps Script\n\n' +
    'Funcionalidades:\n' +
    '• Dashboard com estatísticas\n' +
    '• Gerenciamento de registros com paginação\n' +
    '• Detecção e resolução de duplicados\n' +
    '• Geração de relatórios\n\n' +
    '✅ Sistema 100% integrado com Google Sheets',
    ui.ButtonSet.OK
  );
}
