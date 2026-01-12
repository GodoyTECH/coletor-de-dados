/**
 * Social Coletor - Apps Script (Backend + WebApp)
 * Compatível com send.js
 */

const SHEETS = {
  REGISTROS: 'Registros',
  INDEX: '_Index',
  RELATORIOS: 'Relatorios',
  LOGS: 'Logs',
  CONFIG: '_Config'
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
  'NUM_DOCUMENTO',
  'REG_ID',
  'ROW_NUMBER',
  'CREATED_AT',
  'UPDATED_AT',
  'DELETADO'
];

const RELATORIOS_HEADERS = [
  'ID',
  'COMPETENCIA',
  'TOTAL_REGISTROS',
  'TOTAL_ATIVOS',
  'TOTAL_DUPLICADOS',
  'URL_PDF',
  'RESUMO',
  'CREATED_AT'
];

const LOG_HEADERS = ['TIMESTAMP', 'ACTION', 'DETAILS'];
const CONFIG_HEADERS = ['CHAVE', 'VALOR'];

const CONFIG_DEFAULTS = {
  WEBAPP_TITLE: 'Social Coletor - Admin',
  DRIVE_FOLDER_NAME_IMAGES: 'SocialColetor_Imagens',
  DRIVE_FOLDER_ID_IMAGES: '',
  DRIVE_FOLDER_NAME_REPORTS: 'SocialColetor_Relatorios',
  DRIVE_FOLDER_ID_REPORTS: ''
};

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

    if (payload.action === 'submit') {
      const result = handleSubmit_(payload.data || {});
      return jsonOutput_(Object.assign({ success: true }, result));
    }

    return jsonOutput_({ success: false, error: 'Ação inválida.' });
  } catch (error) {
    logEvent_('ERROR', String(error));
    return jsonOutput_({ success: false, error: String(error) });
  }
}

function handleSubmit_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registrosSheet = getSheet_(ss, SHEETS.REGISTROS);

  const now = new Date();
  const recordId = Utilities.getUuid();
  const numeroDocumentoRaw = String(data.numeroDocumento || '').trim();
  const numeroDocumentoNormalized = normalizeDoc_(numeroDocumentoRaw);

  const duplicateInfo = numeroDocumentoNormalized
    ? findDuplicateByDoc_(numeroDocumentoNormalized)
    : null;

  const status = duplicateInfo ? 'DUPLICADO' : 'NOVO';
  const dupRefId = duplicateInfo ? duplicateInfo.id : '';
  const dupReason = duplicateInfo ? 'NUM_DOCUMENTO' : '';

  const imageUrl = data.imagemBase64
    ? saveImageToDrive_(data.imagemBase64, recordId, numeroDocumentoNormalized)
    : '';

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

  const headers = getHeaders_(registrosSheet);
  const rowValues = headers.map((header) => (Object.prototype.hasOwnProperty.call(rowData, header) ? rowData[header] : ''));
  registrosSheet.getRange(registrosSheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowValues]);

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

function getDashboardData() {
  ensureSystem_();
  const registros = getRegistros_();
  const total = registros.length;
  const ativos = registros.filter((registro) => !isDeleted_(registro.DELETADO)).length;
  const duplicados = registros.filter((registro) => registro.STATUS === 'DUPLICADO' && !isDeleted_(registro.DELETADO)).length;

  const porProduto = {};
  registros.forEach((registro) => {
    if (isDeleted_(registro.DELETADO)) return;
    const produto = registro.PRODUTO || 'Não informado';
    const quantidade = Number(registro.QUANTIDADE || 0);
    porProduto[produto] = (porProduto[produto] || 0) + (Number.isFinite(quantidade) ? quantidade : 0);
  });

  return { total, ativos, duplicados, porProduto };
}

function getRegistrosTable() {
  ensureSystem_();
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return { headers: REGISTROS_HEADERS, rows: [] };

  const headers = data[0];
  const rows = data.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    values: row
  }));

  return { headers, rows };
}

function updateRegistroRow(payload) {
  ensureSystem_();
  if (!payload || !payload.rowNumber || !payload.values) {
    return { success: false, error: 'Dados incompletos.' };
  }

  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const headers = getHeaders_(sheet);
  const rowNumber = Number(payload.rowNumber);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    return { success: false, error: 'Linha inválida.' };
  }

  const rowRange = sheet.getRange(rowNumber, 1, 1, headers.length);
  const current = rowRange.getValues()[0];
  const incoming = payload.values;

  headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(incoming, header)) {
      current[index] = incoming[header];
    }
  });

  const updatedIndex = headers.indexOf('UPDATED_AT');
  if (updatedIndex !== -1) {
    current[updatedIndex] = new Date();
  }

  rowRange.setValues([current]);
  logEvent_('UPDATE', `Registro linha ${rowNumber} atualizado.`);
  rebuildIndex_();

  return { success: true };
}

function getDuplicados() {
  ensureSystem_();
  const registros = getRegistros_();
  return registros.filter((registro) => registro.STATUS === 'DUPLICADO' && !isDeleted_(registro.DELETADO));
}

function resolveDuplicado(payload) {
  ensureSystem_();
  if (!payload || !payload.id || !payload.action) {
    return { success: false, error: 'Dados incompletos.' };
  }

  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];

  const idIndex = headers.indexOf('ID');
  const statusIndex = headers.indexOf('STATUS');
  const updatedIndex = headers.indexOf('UPDATED_AT');
  const deletadoIndex = headers.indexOf('DELETADO');

  for (let i = 1; i < data.length; i += 1) {
    if (String(data[i][idIndex]) === String(payload.id)) {
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
          return { success: false, error: 'Ação inválida.' };
      }

      if (updatedIndex !== -1) {
        data[i][updatedIndex] = new Date();
      }

      sheet.getRange(i + 1, 1, 1, headers.length).setValues([data[i]]);
      logEvent_('DUPLICADO', `Registro ${payload.id} => ${payload.action}`);
      rebuildIndex_();
      return { success: true };
    }
  }

  return { success: false, error: 'Registro não encontrado.' };
}

function getRelatorios() {
  ensureSystem_();
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.RELATORIOS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];

  return data.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index];
    });
    return item;
  });
}

function gerarRelatorio() {
  ensureSystem_();
  const registros = getRegistros_();
  const totals = buildTotals_(registros);
  const competencia = formatCompetencia_(new Date());
  const resumo = gerarResumoAnalitico_(totals);
  const pdfUrl = gerarPdfRelatorio_(competencia, totals, resumo);

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

  const rowValues = headers.map((header) => (Object.prototype.hasOwnProperty.call(rowData, header) ? rowData[header] : ''));
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowValues]);

  logEvent_('RELATORIO', `Relatório ${competencia} gerado.`);
  return { success: true, url: pdfUrl };
}

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
    if (!deletado && registro.STATUS === 'DUPLICADO') {
      totals.duplicados += 1;
    }
    if (deletado) return;

    const produto = registro.PRODUTO || 'Não informado';
    const quantidade = Number(registro.QUANTIDADE || 0);
    totals.porProduto[produto] = (totals.porProduto[produto] || 0) + (Number.isFinite(quantidade) ? quantidade : 0);
  });

  return totals;
}

function gerarResumoAnalitico_(totals) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const resumoBase = gerarResumoBase_(totals);

  if (!apiKey) {
    return `${resumoBase} Resumo analítico indisponível.`;
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
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
        })
      }
    );

    const data = JSON.parse(response.getContentText() || '{}');
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
      ? data.candidates[0].content.parts.map((part) => part.text).join('')
      : '';

    return text ? `${resumoBase} ${text.trim()}` : `${resumoBase} Resumo analítico indisponível.`;
  } catch (error) {
    logEvent_('GEMINI_ERROR', String(error));
    return `${resumoBase} Resumo analítico indisponível.`;
  }
}

function gerarPdfRelatorio_(competencia, totals, resumo) {
  const linhasProdutos = Object.keys(totals.porProduto).map((produto) => {
    return `<tr><td>${escapeHtml_(produto)}</td><td>${formatNumber_(totals.porProduto[produto])}</td></tr>`;
  }).join('');

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { margin-bottom: 8px; }
          .meta { color: #6b7280; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f3f4f6; }
          .section { margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Relatório ${escapeHtml_(competencia)}</h1>
        <div class="meta">Gerado em ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}</div>

        <div class="section">
          <h2>Totais gerais</h2>
          <p>Total de registros: <strong>${totals.total}</strong></p>
          <p>Registros ativos: <strong>${totals.ativos}</strong></p>
          <p>Registros duplicados: <strong>${totals.duplicados}</strong></p>
        </div>

        <div class="section">
          <h2>Totais por produto</h2>
          <table>
            <thead>
              <tr><th>Produto</th><th>Quantidade</th></tr>
            </thead>
            <tbody>
              ${linhasProdutos || '<tr><td colspan="2">Sem dados</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>Análise</h2>
          <p>${escapeHtml_(resumo)}</p>
        </div>
      </body>
    </html>
  `;

  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF)
    .setName(`Relatorio_${competencia}_${Date.now()}.pdf`);

  const folder = getDriveFolder_('reports');
  const file = folder.createFile(blob);
  return file.getUrl();
}

function ensureSystem_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetWithHeaders_(ss, SHEETS.REGISTROS, REGISTROS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.INDEX, INDEX_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.RELATORIOS, RELATORIOS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.LOGS, LOG_HEADERS);
  ensureSheetWithHeaders_(ss, SHEETS.CONFIG, CONFIG_HEADERS);
  ensureDefaults_();
}

function ensureDefaults_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const data = sheet.getDataRange().getValues();
  const existing = new Set(data.slice(1).map((row) => row[0]));

  Object.keys(CONFIG_DEFAULTS).forEach((key) => {
    if (!existing.has(key)) {
      sheet.appendRow([key, CONFIG_DEFAULTS[key]]);
    }
  });
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

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

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function getSheet_(ss, name) {
  return ss.getSheetByName(name);
}

function getConfigValue_(key) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i += 1) {
    if (values[i][0] === key) return values[i][1];
  }
  return '';
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

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeDoc_(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function findDuplicateByDoc_(docNormalized) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  const headers = data[0];
  const idIndex = headers.indexOf('ID');
  const docIndex = headers.indexOf('NUM_DOCUMENTO');
  const deletadoIndex = headers.indexOf('DELETADO');

  for (let i = 1; i < data.length; i += 1) {
    const rowDoc = normalizeDoc_(data[i][docIndex]);
    if (rowDoc && rowDoc === docNormalized && !isDeleted_(data[i][deletadoIndex])) {
      return { id: data[i][idIndex] };
    }
  }

  return null;
}

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
  const rowValues = headers.map((header) => (Object.prototype.hasOwnProperty.call(rowData, header) ? rowData[header] : ''));
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowValues]);
}

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

  for (let i = 1; i < registrosData.length; i += 1) {
    const docNormalized = normalizeDoc_(registrosData[i][docIndex]);
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

  indexSheet.clearContents();
  indexSheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
  if (rows.length > 0) {
    indexSheet.getRange(2, 1, rows.length, INDEX_HEADERS.length).setValues(rows);
  }
}

function saveImageToDrive_(base64, recordId, docNormalized) {
  const folder = getDriveFolder_('images');
  const cleaned = String(base64).replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(cleaned));
  const fileName = `REG_${recordId}_${docNormalized || 'SEM_DOC'}_${Date.now()}.jpg`;
  blob.setName(fileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function getDriveFolder_(type) {
  const isReports = type === 'reports';
  const idKey = isReports ? 'DRIVE_FOLDER_ID_REPORTS' : 'DRIVE_FOLDER_ID_IMAGES';
  const nameKey = isReports ? 'DRIVE_FOLDER_NAME_REPORTS' : 'DRIVE_FOLDER_NAME_IMAGES';

  const existingId = getConfigValue_(idKey);
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      logEvent_('DRIVE', `Folder ID inválido (${idKey}). Criando novo.`);
    }
  }

  const folderName = getConfigValue_(nameKey) || CONFIG_DEFAULTS[nameKey];
  const folder = DriveApp.createFolder(folderName);
  setConfigValue_(idKey, folder.getId());
  return folder;
}

function getRegistros_() {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.REGISTROS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];

  return data.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function formatCompetencia_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
}

function formatProdutos_(produtos) {
  return Object.keys(produtos).map((produto) => `${produto}: ${formatNumber_(produtos[produto])}`).join(', ');
}

function gerarResumoBase_(totals) {
  return `Resumo geral: ${totals.total} registros no período, ${totals.ativos} ativos e ${totals.duplicados} duplicados.`;
}

function formatNumber_(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR') : '0';
}

function isDeleted_(value) {
  if (value === true) return true;
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'TRUE' || normalized === 'SIM' || normalized === '1';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logEvent_(action, details) {
  const sheet = getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.LOGS);
  if (!sheet) return;
  sheet.appendRow([new Date(), action, details]);
}
