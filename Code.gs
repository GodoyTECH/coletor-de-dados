/**
 * Social Coletor - Apps Script (Backend + DB + Storage + WebApp)
 * -------------------------------------------------------------
 * Este arquivo mantém o payload atual do frontend.
 * Payload esperado (send.js):
 * {
 *   action: 'submit',
 *   data: {
 *     beneficiario, cpf, atendente, produto, quantidade,
 *     endereco, data, assinatura, numeroDocumento, observacoes,
 *     imagemBase64, timestamp
 *   }
 * }
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

const LOG_HEADERS = ['TIMESTAMP', 'ACTION', 'DETAILS'];
const RELATORIOS_HEADERS = ['ID', 'COMPETENCIA', 'STATUS', 'URL_PDF', 'RESUMO', 'CREATED_AT'];

const CONFIG_DEFAULTS = {
  API_KEY: '',
  DRIVE_FOLDER_ID: '',
  DRIVE_FOLDER_NAME: 'SocialColetor_Imagens',
  WEBAPP_TITLE: 'Social Coletor - Admin'
};

// ================================
// ENTRYPOINTS
// ================================
function doGet(e) {
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
    if (apiKey && payload.apiKey !== apiKey) {
      logEvent_('AUTH_FAIL', 'API key inválida ou ausente.');
      return jsonOutput_({ success: false, error: 'API key inválida.' });
    }

    if (payload.action === 'submit') {
      const result = handleSubmit_(payload.data || {});
      return jsonOutput_({ success: true, ...result });
    }

    return jsonOutput_({ success: false, error: 'Ação inválida.' });
  } catch (error) {
    logEvent_('ERROR', String(error));
    return jsonOutput_({ success: false, error: String(error) });
  }
}

// ================================
// PROCESSAMENTO DE SUBMIT
// ================================
function handleSubmit_(data) {
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

  const row = buildRegistroRow_({
    id: recordId,
    dataRegistro: now,
    beneficiario: String(data.beneficiario || '').trim(),
    cpf: cpfRaw,
    numeroDocumento: docRaw,
    atendente: String(data.atendente || '').trim(),
    produto: String(data.produto || '').trim(),
    quantidade: Number(data.quantidade || 0),
    dataForm: String(data.data || '').trim(),
    endereco: String(data.endereco || '').trim(),
    observacoes: String(data.observacoes || '').trim(),
    origem: 'SOCIAL_COLETOR',
    imgUrl: imageUrl,
    status,
    dupRefId,
    dupReason,
    updatedAt: now,
    deletado: ''
  });

  const newRowNumber = registrosSheet.appendRow(row).getRow();

  if (!duplicate) {
    upsertIndex_(indexSheet, indexMap, cpfNormalized, docNormalized, recordId, newRowNumber);
  }

  logEvent_('SUBMIT', `Registro ${recordId} inserido. Status=${status}`);

  return {
    id: recordId,
    status,
    dupRefId,
    dupReason,
    imgUrl: imageUrl
  };
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
  const map = {};

  for (let i = 1; i < values.length; i += 1) {
    const [key, regId, rowNumber, cpf, doc, updatedAt, deletado] = values[i];
    if (!key) continue;
    map[String(key)] = {
      regId,
      rowNumber: Number(rowNumber),
      cpf: String(cpf || ''),
      doc: String(doc || ''),
      updatedAt,
      deletado: String(deletado || '')
    };
  }

  return map;
}

function findDuplicate_(indexMap, cpf, doc) {
  const keys = buildIndexKeys_(cpf, doc);
  for (const { key, reason } of keys) {
    if (indexMap[key]) {
      return { regId: indexMap[key].regId, reason };
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
    if (indexMap[key]) return;
    indexMap[key] = { regId, rowNumber, cpf, doc, updatedAt: now, deletado: '' };
    rowsToAppend.push([key, regId, rowNumber, cpf, doc, now, '']);
  });

  if (rowsToAppend.length > 0) {
    indexSheet.getRange(indexSheet.getLastRow() + 1, 1, rowsToAppend.length, INDEX_HEADERS.length)
      .setValues(rowsToAppend);
  }
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

  const porProduto = {};
  registros.forEach((registro) => {
    const produto = registro.PRODUTO || 'Não informado';
    porProduto[produto] = (porProduto[produto] || 0) + 1;
  });

  return { total, duplicados, ativos, porProduto };
}

function getRegistros() {
  ensureSystem_();
  return getRegistros_();
}

function getDuplicados() {
  ensureSystem_();
  return getRegistros_().filter((registro) => registro.STATUS === 'DUPLICADO');
}

function updateRegistro(payload) {
  ensureSystem_();
  if (!payload || !payload.id) return { success: false, error: 'ID ausente.' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet_(ss, SHEETS.REGISTROS);
  const dataRange = sheet.getDataRange().getValues();

  for (let i = 1; i < dataRange.length; i += 1) {
    if (String(dataRange[i][0]) === String(payload.id)) {
      const row = dataRange[i];
      REGISTROS_HEADERS.forEach((header, index) => {
        if (Object.prototype.hasOwnProperty.call(payload, header)) {
          row[index] = payload[header];
        }
      });
      row[REGISTROS_HEADERS.indexOf('UPDATED_AT')] = new Date();
      sheet.getRange(i + 1, 1, 1, REGISTROS_HEADERS.length).setValues([row]);
      logEvent_('UPDATE', `Registro ${payload.id} atualizado.`);
      return { success: true };
    }
  }

  return { success: false, error: 'Registro não encontrado.' };
}

function softDeleteRegistro(id) {
  ensureSystem_();
  if (!id) return { success: false, error: 'ID ausente.' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet_(ss, SHEETS.REGISTROS);
  const dataRange = sheet.getDataRange().getValues();

  for (let i = 1; i < dataRange.length; i += 1) {
    if (String(dataRange[i][0]) === String(id)) {
      dataRange[i][REGISTROS_HEADERS.indexOf('DELETADO')] = 'TRUE';
      dataRange[i][REGISTROS_HEADERS.indexOf('UPDATED_AT')] = new Date();
      sheet.getRange(i + 1, 1, 1, REGISTROS_HEADERS.length).setValues([dataRange[i]]);
      logEvent_('DELETE', `Registro ${id} marcado como deletado.`);
      return { success: true };
    }
  }

  return { success: false, error: 'Registro não encontrado.' };
}

function resolveDuplicado(payload) {
  ensureSystem_();
  if (!payload || !payload.id || !payload.action) {
    return { success: false, error: 'Dados incompletos.' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet_(ss, SHEETS.REGISTROS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i += 1) {
    if (String(rows[i][0]) === String(payload.id)) {
      const statusIndex = REGISTROS_HEADERS.indexOf('STATUS');
      const updatedIndex = REGISTROS_HEADERS.indexOf('UPDATED_AT');
      const deletadoIndex = REGISTROS_HEADERS.indexOf('DELETADO');

      switch (payload.action) {
        case 'manter':
          rows[i][statusIndex] = 'DUPLICADO_MANTIDO';
          break;
        case 'validar':
          rows[i][statusIndex] = 'VALIDO';
          break;
        case 'mesclar':
          rows[i][statusIndex] = 'MESCLADO';
          break;
        case 'excluir':
          rows[i][deletadoIndex] = 'TRUE';
          rows[i][statusIndex] = 'EXCLUIDO';
          break;
        default:
          return { success: false, error: 'Ação inválida.' };
      }

      rows[i][updatedIndex] = new Date();
      sheet.getRange(i + 1, 1, 1, REGISTROS_HEADERS.length).setValues([rows[i]]);
      logEvent_('DUPLICADO', `Registro ${payload.id} => ${payload.action}`);
      return { success: true };
    }
  }

  return { success: false, error: 'Registro não encontrado.' };
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
    CREATED_AT: row[5]
  }));
}

function gerarRelatorioMensal(payload) {
  ensureSystem_();
  const competencia = payload && payload.competencia ? payload.competencia : formatCompetencia_(new Date());
  const registros = getRegistros_();
  const resumo = buildResumoMensal_(registros, competencia);
  const pdfUrl = gerarPdfSimples_(competencia, resumo);

  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
  sheet.appendRow([
    Utilities.getUuid(),
    competencia,
    'GERADO',
    pdfUrl,
    resumo,
    new Date()
  ]);

  logEvent_('RELATORIO', `Relatório ${competencia} gerado.`);
  return { success: true, url: pdfUrl };
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
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeDigits_(value) {
  return String(value || '').replace(/\D/g, '');
}

function saveImageToDrive_(base64, recordId, cpf) {
  const folder = getDriveFolder_();
  const cleaned = String(base64).replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(cleaned));
  blob.setName(`REG_${recordId}_${cpf || 'SEMCPF'}_${Date.now()}.jpg`);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function getDriveFolder_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const folderId = getConfigValue_('DRIVE_FOLDER_ID');

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      logEvent_('DRIVE', 'Folder ID inválido. Criando nova pasta.');
    }
  }

  const folderName = getConfigValue_('DRIVE_FOLDER_NAME') || CONFIG_DEFAULTS.DRIVE_FOLDER_NAME;
  const folder = DriveApp.createFolder(folderName);
  setConfigValue_('DRIVE_FOLDER_ID', folder.getId());
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

function buildResumoMensal_(registros, competencia) {
  const totais = {};
  registros.forEach((registro) => {
    const produto = registro.PRODUTO || 'Não informado';
    totais[produto] = (totais[produto] || 0) + 1;
  });

  const linhas = Object.keys(totais).map((produto) => `${produto}: ${totais[produto]}`);
  return `Relatório ${competencia}. Total de registros: ${registros.length}. Detalhes: ${linhas.join(', ')}`;
}

function formatCompetencia_(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}`;
}

function gerarPdfSimples_(competencia, resumo) {
  const html = `<h1>Relatório ${competencia}</h1><p>${resumo}</p>`;
  const blob = HtmlService.createHtmlOutput(html).getBlob().setName(`Relatorio_${competencia}.pdf`);
  const folder = getDriveFolder_();
  const file = folder.createFile(blob);
  return file.getUrl();
}

function logEvent_(action, details) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.LOGS);
  sheet.appendRow([new Date(), action, details]);
}

