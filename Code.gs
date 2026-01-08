/**
 * Social Coletor - Apps Script (Backend + DB + Storage + WebApp)
 * -------------------------------------------------------------
 * ✅ Compatível com o payload atual do frontend (send.js).
 * Payload esperado:
 * {
 *   action: 'submit',
 *   data: {
 *     beneficiario, cpf, atendente, produto, quantidade,
 *     endereco, data, assinatura, numeroDocumento, observacoes,
 *     imagemBase64, timestamp, origem, apiKey
 *   }
 * }
 *
 * Configurações (aba _Config):
 * - DRIVE_FOLDER_ID: ID da pasta do Drive para imagens
 * - DRIVE_FOLDER_NAME: nome da pasta caso não exista ID
 * - REPORTS_FOLDER_ID: ID da pasta para relatórios
 * - REPORTS_FOLDER_NAME: nome da pasta caso não exista ID
 * - API_KEY: chave opcional do backend
 * - ADMIN_EMAIL: email para alertas
 * - TIMEZONE: timezone do projeto
 * - GEMINI_API_KEY: chave da IA (Gemini)
 * - WEBAPP_TITLE: título do painel
 * - WEBAPP_URL: URL do WebApp implantado
 * - REPORT_PENDING: TRUE/FALSE (status de relatório pendente)
 */

// ================================
// CONFIGURAÇÕES
// ================================
const SHEETS = {
  REGISTROS: 'Registros',
  CONFIG: '_Config',
  INDEX: '_Index',
  LOGS: 'Logs',
  RELATORIOS: 'Relatorios'
};

const REGISTROS_HEADERS = [
  'ID',
  'DATA_REGISTRO',
  'BENEFICIARIO',
  'CPF',
  'NUM_DOCUMENTO',
  'ATENDENTE',
  'PRODUTO',
  'QUANTIDADE',
  'DATA_FORM',
  'ENDERECO',
  'OBS',
  'ORIGEM',
  'IMG_URL',
  'STATUS',
  'DUP_REF_ID',
  'DUP_REASON',
  'UPDATED_AT',
  'DELETADO'
];

const INDEX_HEADERS = [
  'KEY',
  'REG_ID',
  'ROW_NUMBER',
  'CPF',
  'DOC',
  'UPDATED_AT',
  'DELETADO'
];

const LOG_HEADERS = ['TIMESTAMP', 'ACTION', 'ID', 'ORIGEM', 'ANTES', 'DEPOIS'];
const RELATORIOS_HEADERS = ['ID', 'COMPETENCIA', 'STATUS', 'URL_PDF', 'RESUMO', 'STATS_JSON', 'CREATED_AT'];

// Configurações ajustáveis na aba _Config:
// - DRIVE_FOLDER_ID: ID da pasta do Drive para imagens.
// - REPORTS_FOLDER_ID: ID da pasta do Drive para relatórios.
// - API_KEY: chave opcional para autenticação do doPost.
// - ADMIN_EMAIL: email que recebe alertas de relatório.
// - TIMEZONE: fuso horário utilizado nos relatórios.
// - WEBAPP_URL: URL do WebApp para notificações.
const CONFIG_DEFAULTS = {
  API_KEY: '',
  DRIVE_FOLDER_ID: '',
  DRIVE_FOLDER_NAME: 'SocialColetor_Imagens',
  REPORTS_FOLDER_ID: '',
  REPORTS_FOLDER_NAME: 'SocialColetor_Relatorios',
  ADMIN_EMAIL: '',
  TIMEZONE: Session.getScriptTimeZone(),
  GEMINI_API_KEY: '',
  WEBAPP_TITLE: 'Social Coletor - Admin',
  WEBAPP_URL: '',
  REPORT_PENDING: 'FALSE'
};

// ================================
// ENTRYPOINTS
// ================================
function doGet() {
  ensureSystem_();
  const template = HtmlService.createTemplateFromFile('WebApp');
  template.webAppTitle = getConfigValue_('WEBAPP_TITLE') || CONFIG_DEFAULTS.WEBAPP_TITLE;
  return template.evaluate().setTitle(template.webAppTitle);
}

function doPost(e) {
  ensureSystem_();

  try {
    const payload = parsePayload_(e);
    if (!payload) {
      return jsonOutput_({ success: false, error: 'Payload vazio.' });
    }

    const apiKey = getConfigValue_('API_KEY');
    const providedKey = payload.apiKey || (payload.data && payload.data.apiKey);
    if (apiKey && providedKey !== apiKey) {
      logEvent_('AUTH_FAIL', '', 'API', '', 'API key inválida ou ausente.');
      return jsonOutput_({ success: false, error: 'API key inválida.' });
    }

    if (payload.action === 'submit') {
      const result = handleSubmit_(payload.data || {});
      return jsonOutput_({ success: true, ...result });
    }

    return jsonOutput_({ success: false, error: 'Ação inválida.' });
  } catch (error) {
    logEvent_('ERROR', '', 'API', '', String(error));
    return jsonOutput_({ success: false, error: String(error) });
  }
}

// ================================
// PROCESSAMENTO DE SUBMIT
// ================================
function handleSubmit_(data) {
  return withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);
    const indexSheet = getSheet_(ss, SHEETS.INDEX);

    const cpfRaw = String(data.cpf || '').trim();
    const docRaw = String(data.numeroDocumento || '').trim();
    const cpfNormalized = normalizeDigits_(cpfRaw);
    const docNormalized = normalizeDigits_(docRaw);

    const indexMap = getIndexMap_(indexSheet);
    const duplicate = findDuplicate_(indexMap, cpfNormalized, docNormalized);

    const now = new Date();
    const recordId = Utilities.getUuid();
    const imageUrl = data.imagemBase64 ? saveImageToDrive_(data.imagemBase64, recordId, cpfNormalized) : '';

    const status = duplicate ? 'DUPLICADO' : 'NOVO';
    const dupRefId = duplicate ? duplicate.regId : '';
    const dupReason = duplicate ? duplicate.reason : '';

    const quantidade = normalizeQuantidade_(data.quantidade);
    const origem = String(data.origem || 'SOCIAL_COLETOR').trim();

    const row = buildRegistroRow_({
      id: recordId,
      dataRegistro: now,
      beneficiario: String(data.beneficiario || '').trim(),
      cpf: cpfRaw,
      numeroDocumento: docRaw,
      atendente: String(data.atendente || '').trim(),
      produto: String(data.produto || '').trim(),
      quantidade,
      dataForm: String(data.data || '').trim(),
      endereco: String(data.endereco || '').trim(),
      observacoes: String(data.observacoes || '').trim(),
      origem,
      imgUrl: imageUrl,
      status,
      dupRefId,
      dupReason,
      updatedAt: now,
      deletado: ''
    });

    const newRowNumber = registrosSheet.appendRow(row).getRow();

    setIdIndex_(indexSheet, indexMap, recordId, newRowNumber, cpfNormalized, docNormalized);

    if (!duplicate) {
      upsertIndex_(indexSheet, indexMap, cpfNormalized, docNormalized, recordId, newRowNumber);
    }

    logEvent_('SUBMIT', recordId, 'API', '', buildLogResumo_(row));

    return {
      id: recordId,
      status,
      dupRefId,
      dupReason,
      imgUrl: imageUrl
    };
  });
}

function buildRegistroRow_(data) {
  return [
    data.id,
    data.dataRegistro,
    data.beneficiario,
    data.cpf,
    data.numeroDocumento,
    data.atendente,
    data.produto,
    data.quantidade,
    data.dataForm,
    data.endereco,
    data.observacoes,
    data.origem,
    data.imgUrl,
    data.status,
    data.dupRefId,
    data.dupReason,
    data.updatedAt,
    data.deletado
  ];
}

// ================================
// DUPLICIDADES
// ================================
function getIndexMap_(indexSheet) {
  const values = indexSheet.getDataRange().getValues();
  const byKey = {};
  const byId = {};

  for (let i = 1; i < values.length; i += 1) {
    const [key, regId, rowNumber, cpf, doc, updatedAt, deletado] = values[i];
    if (!key) continue;
    const entry = {
      regId,
      rowNumber: Number(rowNumber),
      cpf: String(cpf || ''),
      doc: String(doc || ''),
      updatedAt,
      deletado: String(deletado || ''),
      indexRow: i + 1
    };

    if (String(key).startsWith('ID:')) {
      byId[String(regId)] = entry;
    } else {
      byKey[String(key)] = entry;
    }
  }

  return { byKey, byId };
}

function findDuplicate_(indexMap, cpf, doc) {
  const keys = buildIndexKeys_(cpf, doc);
  for (const { key, reason } of keys) {
    if (indexMap.byKey[key]) {
      return { regId: indexMap.byKey[key].regId, reason };
    }
  }
  return null;
}

function buildIndexKeys_(cpf, doc) {
  const keys = [];
  if (cpf && doc) {
    keys.push({ key: `BOTH:${cpf}|${doc}`, reason: 'CPF+DOC' });
  }
  if (cpf) {
    keys.push({ key: `CPF:${cpf}`, reason: 'CPF' });
  }
  if (doc) {
    keys.push({ key: `DOC:${doc}`, reason: 'DOC' });
  }
  return keys;
}

function upsertIndex_(indexSheet, indexMap, cpf, doc, regId, rowNumber) {
  const now = new Date();
  const keys = buildIndexKeys_(cpf, doc);
  const rowsToAppend = [];

  keys.forEach(({ key }) => {
    if (indexMap.byKey[key]) return;
    indexMap.byKey[key] = { regId, rowNumber, cpf, doc, updatedAt: now, deletado: '' };
    rowsToAppend.push([key, regId, rowNumber, cpf, doc, now, '']);
  });

  if (rowsToAppend.length > 0) {
    indexSheet.getRange(indexSheet.getLastRow() + 1, 1, rowsToAppend.length, INDEX_HEADERS.length)
      .setValues(rowsToAppend);
  }
}

function setIdIndex_(indexSheet, indexMap, regId, rowNumber, cpf, doc) {
  const now = new Date();
  const key = `ID:${regId}`;
  const existing = indexMap.byId[String(regId)];
  const rowValues = [key, regId, rowNumber, cpf, doc, now, ''];

  if (existing && existing.indexRow) {
    indexSheet.getRange(existing.indexRow, 1, 1, INDEX_HEADERS.length).setValues([rowValues]);
  } else {
    indexSheet.appendRow(rowValues);
  }
  indexMap.byId[String(regId)] = {
    regId,
    rowNumber,
    cpf,
    doc,
    updatedAt: now,
    deletado: '',
    indexRow: existing ? existing.indexRow : indexSheet.getLastRow()
  };
}

function markIndexDeleted_(indexSheet, indexMap, regId, deletado) {
  const entry = indexMap.byId[String(regId)];
  if (!entry || !entry.indexRow) return;
  const rowValues = [
    `ID:${regId}`,
    regId,
    entry.rowNumber,
    entry.cpf,
    entry.doc,
    new Date(),
    deletado ? 'TRUE' : ''
  ];
  indexSheet.getRange(entry.indexRow, 1, 1, INDEX_HEADERS.length).setValues([rowValues]);
  indexMap.byId[String(regId)].deletado = deletado ? 'TRUE' : '';
}

// ================================
// WEBAPP - DADOS
// ================================
function getDashboardData() {
  ensureSystem_();
  const registros = getRegistros_();
  const total = registros.length;
  const duplicados = registros.filter((r) => r.STATUS === 'DUPLICADO').length;
  const ativos = registros.filter((r) => !r.DELETADO).length;
  const reportPending = String(getConfigValue_('REPORT_PENDING') || 'FALSE').toUpperCase() === 'TRUE';

  const porProduto = {};
  registros.forEach((registro) => {
    const produto = registro.PRODUTO || 'Não informado';
    porProduto[produto] = (porProduto[produto] || 0) + 1;
  });

  return { total, duplicados, ativos, porProduto, reportPending };
}

function getRegistros() {
  ensureSystem_();
  return getRegistros_();
}

function getDuplicados() {
  ensureSystem_();
  return getDuplicadosQueue_();
}

function getDuplicadoDetalhe(id) {
  ensureSystem_();
  return getDuplicadoDetalhe_(id);
}

function getLogs(limit) {
  ensureSystem_();
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.LOGS);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1).reverse();
  const safeLimit = Number(limit || 200);
  return rows.slice(0, safeLimit).map((row) => ({
    TIMESTAMP: row[0],
    ACTION: row[1],
    ID: row[2],
    ORIGEM: row[3],
    ANTES: row[4],
    DEPOIS: row[5]
  }));
}

function updateRegistro(payload) {
  ensureSystem_();
  if (!payload || !payload.id) return { success: false, error: 'ID ausente.' };

  return withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getSheet_(ss, SHEETS.REGISTROS);
    const indexSheet = getSheet_(ss, SHEETS.INDEX);
    const indexMap = getIndexMap_(indexSheet);
    const registro = getRegistroById_(sheet, indexMap, payload.id);

    if (!registro) {
      return { success: false, error: 'Registro não encontrado.' };
    }

    const before = JSON.stringify(registro);

    REGISTROS_HEADERS.forEach((header) => {
      if (Object.prototype.hasOwnProperty.call(payload, header)) {
        registro[header] = payload[header];
      }
    });
    registro.UPDATED_AT = new Date();

    writeRegistroById_(sheet, indexMap, payload.id, registro);
    logEvent_('UPDATE', payload.id, 'ADMIN', before, JSON.stringify(registro));
    return { success: true };
  });
}

function softDeleteRegistro(id) {
  ensureSystem_();
  if (!id) return { success: false, error: 'ID ausente.' };

  return withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getSheet_(ss, SHEETS.REGISTROS);
    const indexSheet = getSheet_(ss, SHEETS.INDEX);
    const indexMap = getIndexMap_(indexSheet);
    const registro = getRegistroById_(sheet, indexMap, id);

    if (!registro) return { success: false, error: 'Registro não encontrado.' };

    const before = JSON.stringify(registro);
    registro.DELETADO = 'TRUE';
    registro.STATUS = 'EXCLUIDO';
    registro.UPDATED_AT = new Date();
    writeRegistroById_(sheet, indexMap, id, registro);
    markIndexDeleted_(indexSheet, indexMap, id, true);
    logEvent_('DELETE', id, 'ADMIN', before, JSON.stringify(registro));
    return { success: true };
  });
}

function resolveDuplicado(payload) {
  ensureSystem_();
  if (!payload || !payload.id || !payload.action) {
    return { success: false, error: 'Dados incompletos.' };
  }

  return withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);
    const indexSheet = getSheet_(ss, SHEETS.INDEX);
    const indexMap = getIndexMap_(indexSheet);

    // Usa índice para localizar duplicado e original rapidamente.
    const duplicate = getRegistroById_(registrosSheet, indexMap, payload.id);
    if (!duplicate) return { success: false, error: 'Registro não encontrado.' };

    const before = JSON.stringify(duplicate);
    const now = new Date();

    switch (payload.action) {
      case 'manter':
        duplicate.STATUS = 'DUPLICADO_MANTIDO';
        break;
      case 'validar': {
        duplicate.STATUS = 'VALIDADO';
        duplicate.DUP_REF_ID = '';
        duplicate.DUP_REASON = '';
        const cpfNormalized = normalizeDigits_(duplicate.CPF);
        const docNormalized = normalizeDigits_(duplicate.NUM_DOCUMENTO);
        upsertIndex_(indexSheet, indexMap, cpfNormalized, docNormalized, duplicate.ID, indexMap.byId[duplicate.ID].rowNumber);
        markIndexDeleted_(indexSheet, indexMap, duplicate.ID, false);
        break;
      }
      case 'mesclar': {
        const originalId = duplicate.DUP_REF_ID;
        const original = originalId ? getRegistroById_(registrosSheet, indexMap, originalId) : null;
        if (!original) return { success: false, error: 'Original não encontrado.' };

        const originalBefore = JSON.stringify(original);
        mergeRegistroFields_(original, duplicate);
        original.UPDATED_AT = now;
        writeRegistroById_(registrosSheet, indexMap, originalId, original);
        logEvent_('MERGE_ORIGINAL', originalId, 'ADMIN', originalBefore, JSON.stringify(original));

        duplicate.STATUS = 'MESCLADO';
        duplicate.DELETADO = 'TRUE';
        markIndexDeleted_(indexSheet, indexMap, duplicate.ID, true);
        break;
      }
      case 'excluir':
        duplicate.DELETADO = 'TRUE';
        duplicate.STATUS = 'EXCLUIDO';
        markIndexDeleted_(indexSheet, indexMap, duplicate.ID, true);
        break;
      default:
        return { success: false, error: 'Ação inválida.' };
    }

    duplicate.UPDATED_AT = now;
    writeRegistroById_(registrosSheet, indexMap, duplicate.ID, duplicate);
    logEvent_('DUPLICADO', duplicate.ID, 'ADMIN', before, JSON.stringify(duplicate));

    return { success: true };
  });
}

// ================================
// RELATÓRIOS
// ================================
function getRelatorios() {
  ensureSystem_();
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).map((row) => ({
    ID: row[0],
    COMPETENCIA: row[1],
    STATUS: row[2],
    URL_PDF: row[3],
    RESUMO: row[4],
    STATS_JSON: row[5],
    CREATED_AT: row[6]
  }));
}

function gerarRelatorioMensal(payload) {
  const competencia = payload && payload.competencia ? payload.competencia : formatCompetencia_(new Date());
  const [year, month] = competencia.split('-').map((value) => Number(value));
  return generateMonthlyReport(month, year);
}

function generateMonthlyReport(month, year) {
  ensureSystem_();
  const competencia = formatCompetencia_(new Date(year, month - 1, 1));
  if (hasReportForCompetencia_(competencia)) {
    return { success: true, alreadyExists: true, competencia };
  }
  const registros = getRegistros_();
  const stats = buildMonthlyStats_(registros, month, year);
  const resumo = buildResumoMensal_(stats);
  const insights = getGeminiInsights_(stats);
  const pdfUrl = gerarPdfRelatorio_(competencia, resumo, stats, insights);

  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
  sheet.appendRow([
    Utilities.getUuid(),
    competencia,
    'GERADO',
    pdfUrl,
    resumo,
    JSON.stringify(stats),
    new Date()
  ]);

  setConfigValue_('REPORT_PENDING', 'FALSE');
  logEvent_('RELATORIO', competencia, 'SYSTEM', '', JSON.stringify({ resumo, stats }));
  return { success: true, url: pdfUrl, resumo, stats };
}

// ================================
// UTILITÁRIOS
// ================================
function ensureSystem_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.REGISTROS, REGISTROS_HEADERS);
  ensureSheet_(ss, SHEETS.CONFIG, ['CHAVE', 'VALOR']);
  ensureSheet_(ss, SHEETS.INDEX, INDEX_HEADERS);
  ensureSheet_(ss, SHEETS.LOGS, LOG_HEADERS);
  ensureSheet_(ss, SHEETS.RELATORIOS, RELATORIOS_HEADERS);
  ensureDefaults_();
}

function ensureDefaults_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();
  const existing = new Set(values.slice(1).map((row) => row[0]));

  Object.keys(CONFIG_DEFAULTS).forEach((key) => {
    if (!existing.has(key)) {
      sheet.appendRow([key, CONFIG_DEFAULTS[key]]);
    }
  });
}

function getSheet_(ss, name) {
  return ss.getSheetByName(name);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = firstRow.some((value, index) => value !== headers[index]);
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function getConfigValue_(key) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i += 1) {
    if (values[i][0] === key) return values[i][1];
  }

  return '';
}

function parsePayload_(e) {
  if (!e) return null;

  // Suporte a payload JSON (padrão atual) e form-encoded (fallback)
  const body = e.postData && e.postData.contents ? String(e.postData.contents) : '';
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        // Aceita { action, data } ou payload direto
        if (parsed.data && typeof parsed.data === 'object') {
          return parsed;
        }
        return { action: parsed.action || 'submit', data: parsed };
      }
    } catch (error) {
      // Se não for JSON válido, tenta form-encoded abaixo.
    }
  }

  const params = e.parameter ? e.parameter : null;
  if (params) {
    return { action: params.action || 'submit', data: params };
  }

  return null;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeDigits_(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeQuantidade_(value) {
  if (value === null || value === undefined) return '';
  const cleaned = String(value).trim();
  if (!cleaned) return '';
  const normalized = cleaned.replace(',', '.');
  const numberValue = Number(normalized);
  if (Number.isFinite(numberValue)) return numberValue;
  return cleaned;
}

function saveImageToDrive_(base64, recordId, cpf) {
  const folder = getDriveFolder_();
  const cleaned = String(base64).replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(cleaned));
  blob.setName(`REG_${recordId}_${cpf || 'SEMCPF'}_${Date.now()}.jpg`);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getDriveFolder_() {
  const folderId = getConfigValue_('DRIVE_FOLDER_ID');

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      logEvent_('DRIVE', '', 'SYSTEM', '', 'Folder ID inválido. Criando nova pasta.');
    }
  }

  const folderName = getConfigValue_('DRIVE_FOLDER_NAME') || CONFIG_DEFAULTS.DRIVE_FOLDER_NAME;
  const folder = DriveApp.createFolder(folderName);
  setConfigValue_('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function getReportsFolder_() {
  const folderId = getConfigValue_('REPORTS_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      logEvent_('DRIVE', '', 'SYSTEM', '', 'REPORTS_FOLDER_ID inválido. Criando nova pasta.');
    }
  }

  const folderName = getConfigValue_('REPORTS_FOLDER_NAME') || CONFIG_DEFAULTS.REPORTS_FOLDER_NAME;
  const folder = DriveApp.createFolder(folderName);
  setConfigValue_('REPORTS_FOLDER_ID', folder.getId());
  return folder;
}

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

function getRegistros_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const values = sheet.getDataRange().getValues();

  return values.slice(1).map((row) => {
    const obj = {};
    REGISTROS_HEADERS.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function getRegistroByRowNumber_(sheet, rowNumber) {
  if (!rowNumber) return null;
  const row = sheet.getRange(rowNumber, 1, 1, REGISTROS_HEADERS.length).getValues()[0];
  if (!row || !row[0]) return null;
  const obj = {};
  REGISTROS_HEADERS.forEach((header, index) => {
    obj[header] = row[index];
  });
  return obj;
}

function getDuplicadosQueue_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);
  const lastRow = registrosSheet.getLastRow();
  if (lastRow < 2) return [];

  const statusCol = REGISTROS_HEADERS.indexOf('STATUS') + 1;
  const statusValues = registrosSheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
  const duplicados = [];

  statusValues.forEach((row, index) => {
    if (String(row[0]) === 'DUPLICADO') {
      const rowNumber = index + 2;
      const registro = getRegistroByRowNumber_(registrosSheet, rowNumber);
      if (registro && !registro.DELETADO) {
        duplicados.push({
          ID: registro.ID,
          BENEFICIARIO: registro.BENEFICIARIO,
          PRODUTO: registro.PRODUTO,
          STATUS: registro.STATUS,
          DUP_REASON: registro.DUP_REASON,
          DUP_REF_ID: registro.DUP_REF_ID,
          IMG_URL: registro.IMG_URL
        });
      }
    }
  });

  return duplicados.reverse();
}

function getDuplicadoDetalhe_(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);
  const indexSheet = getSheet_(ss, SHEETS.INDEX);
  const indexMap = getIndexMap_(indexSheet);

  const duplicado = getRegistroById_(registrosSheet, indexMap, id);
  if (!duplicado) return { success: false, error: 'Duplicado não encontrado.' };

  const originalId = duplicado.DUP_REF_ID;
  const original = originalId ? getRegistroById_(registrosSheet, indexMap, originalId) : null;

  return {
    success: true,
    duplicado,
    original
  };
}

function getRegistroById_(sheet, indexMap, id) {
  const entry = indexMap.byId[String(id)];
  if (entry && entry.rowNumber) {
    const row = sheet.getRange(entry.rowNumber, 1, 1, REGISTROS_HEADERS.length).getValues()[0];
    if (!row || !row[0]) return null;
    const obj = {};
    REGISTROS_HEADERS.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  }

  // Fallback: busca direta (apenas se o índice estiver inconsistente)
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === String(id)) {
      const obj = {};
      REGISTROS_HEADERS.forEach((header, index) => {
        obj[header] = values[i][index];
      });
      return obj;
    }
  }
  return null;
}

function writeRegistroById_(sheet, indexMap, id, registro) {
  const entry = indexMap.byId[String(id)];
  if (!entry || !entry.rowNumber) return;
  const rowValues = REGISTROS_HEADERS.map((header) => registro[header] || '');
  sheet.getRange(entry.rowNumber, 1, 1, REGISTROS_HEADERS.length).setValues([rowValues]);
}

function mergeRegistroFields_(original, duplicate) {
  const campos = [
    'BENEFICIARIO',
    'CPF',
    'NUM_DOCUMENTO',
    'ATENDENTE',
    'PRODUTO',
    'QUANTIDADE',
    'DATA_FORM',
    'ENDERECO',
    'OBS',
    'IMG_URL'
  ];

  campos.forEach((campo) => {
    if (!original[campo] && duplicate[campo]) {
      original[campo] = duplicate[campo];
    }
  });
}

function buildLogResumo_(rowValues) {
  if (!rowValues) return '';
  if (Array.isArray(rowValues)) {
    return JSON.stringify({
      id: rowValues[0],
      beneficiario: rowValues[2],
      cpf: rowValues[3],
      produto: rowValues[6]
    });
  }
  return JSON.stringify({
    id: rowValues.ID || rowValues.id,
    beneficiario: rowValues.BENEFICIARIO || rowValues.beneficiario,
    cpf: rowValues.CPF || rowValues.cpf,
    produto: rowValues.PRODUTO || rowValues.produto
  });
}

function truncateLog_(value) {
  const text = value ? String(value) : '';
  if (text.length <= 800) return text;
  return `${text.slice(0, 800)}...`;
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function buildResumoMensal_(stats) {
  const linhas = Object.keys(stats.porProduto).map((produto) => `${produto}: ${stats.porProduto[produto]}`);
  return `Relatório ${stats.competencia}. Total de registros: ${stats.total}. Duplicados: ${stats.duplicados}. Beneficiários únicos: ${stats.beneficiariosUnicos}. Detalhes: ${linhas.join(', ')}`;
}

function formatCompetencia_(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}`;
}

function buildMonthlyStats_(registros, month, year) {
  const competencia = formatCompetencia_(new Date(year, month - 1, 1));
  const porProduto = {};
  const atendentes = {};
  const beneficiarios = new Set();
  let duplicados = 0;
  let total = 0;

  registros.forEach((registro) => {
    if (registro.DELETADO) return;
    const dataRegistro = registro.DATA_REGISTRO ? new Date(registro.DATA_REGISTRO) : null;
    if (!dataRegistro || dataRegistro.getMonth() + 1 !== month || dataRegistro.getFullYear() !== year) {
      return;
    }

    total += 1;
    if (registro.STATUS === 'DUPLICADO') duplicados += 1;
    if (registro.CPF) {
      beneficiarios.add(normalizeDigits_(registro.CPF));
    } else if (registro.BENEFICIARIO) {
      beneficiarios.add(registro.BENEFICIARIO);
    }

    const produto = registro.PRODUTO || 'Não informado';
    porProduto[produto] = (porProduto[produto] || 0) + 1;

    const atendente = registro.ATENDENTE || 'Não informado';
    atendentes[atendente] = (atendentes[atendente] || 0) + 1;
  });

  const topAtendentes = Object.keys(atendentes)
    .map((nome) => ({ nome, total: atendentes[nome] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    competencia,
    total,
    duplicados,
    beneficiariosUnicos: beneficiarios.size,
    porProduto,
    topAtendentes
  };
}

function getGeminiInsights_(stats) {
  const apiKey = getConfigValue_('GEMINI_API_KEY');
  if (!apiKey) return '';

  // Integração opcional com Gemini (apenas se houver chave configurada).
  const prompt = `Você é um analista do Social Coletor. Gere insights curtos para o relatório mensal.\n\nDados:\n${JSON.stringify(stats, null, 2)}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  try {
    const response = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText() || '{}');
    return result.candidates && result.candidates[0] && result.candidates[0].content
      ? result.candidates[0].content.parts.map((part) => part.text).join(' ')
      : '';
  } catch (error) {
    logEvent_('GEMINI_FAIL', '', 'SYSTEM', '', String(error));
    return '';
  }
}

function getReportStatus() {
  ensureSystem_();
  return {
    pending: getConfigValue_('REPORT_PENDING') === 'TRUE'
  };
}

function hasReportForCompetencia_(competencia) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).some((row) => String(row[1]) === String(competencia));
}

function checkMonthlyReport_() {
  ensureSystem_();
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (now.getDate() !== lastDay.getDate()) return;

  const competencia = formatCompetencia_(now);
  if (hasReportForCompetencia_(competencia)) return;

  setConfigValue_('REPORT_PENDING', 'TRUE');
  logEvent_('REPORT_PENDING', competencia, 'SYSTEM', '', 'Relatório pendente marcado.');

  const adminEmail = getConfigValue_('ADMIN_EMAIL');
  if (adminEmail) {
    const subject = 'Relatório mensal pendente - Social Coletor';
    const webAppUrl = getConfigValue_('WEBAPP_URL');
    const body = webAppUrl
      ? `O relatório mensal (${competencia}) está pendente. Acesse o painel: ${webAppUrl}`
      : `O relatório mensal (${competencia}) está pendente. Acesse o painel para gerar.`;
    MailApp.sendEmail(adminEmail, subject, body);
  }
}

function createDailyTrigger_() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'checkMonthlyReport_') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkMonthlyReport_')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();
}

function gerarPdfRelatorio_(competencia, resumo, stats, insights) {
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h1>Relatório ${competencia}</h1>
      <p>${resumo}</p>
      <h2>Estatísticas</h2>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;">${JSON.stringify(stats, null, 2)}</pre>
      <h2>Insights (Gemini)</h2>
      <p>${insights || 'Sem insights configurados.'}</p>
    </div>
  `;
  const blob = HtmlService.createHtmlOutput(html).getBlob().setName(`Relatorio_${competencia}.pdf`);
  const folder = getReportsFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function logEvent_(action, id, origem, antes, depois) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.LOGS);
  sheet.appendRow([
    new Date(),
    action,
    id || '',
    origem || 'SYSTEM',
    truncateLog_(antes),
    truncateLog_(depois)
  ]);
}
