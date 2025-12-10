/**
 * SOCIAL COLETOR - GOOGLE APPS SCRIPT
 * Processa dados do aplicativo web e salva no Google Sheets e Drive
 */

// ============================================
// CONFIGURAÇÕES
// ============================================

// ID da planilha do Google Sheets (substitua pelo seu)
const SHEET_ID = 'SUA_PLANILHA_ID_AQUI';

// Nome da aba na planilha
const SHEET_NAME = 'Coletas';

// Pasta no Google Drive para salvar as imagens
const DRIVE_FOLDER_NAME = 'Social Coletor - Imagens';

// ============================================
// FUNÇÃO PRINCIPAL - doPost
// ============================================

/**
 * Recebe dados POST do aplicativo web
 * @param {Object} e - Evento de requisição
 * @returns {ContentService.TextOutput} Resposta JSON
 */
function doPost(e) {
  try {
    console.log('📥 Recebendo dados do aplicativo...');
    
    // Parse dos dados recebidos
    const jsonData = JSON.parse(e.postData.contents);
    console.log('Dados recebidos:', jsonData);
    
    // Validar dados obrigatórios
    if (!validateData(jsonData)) {
      return createResponse(400, 'Dados incompletos ou inválidos');
    }
    
    // Salvar imagem no Google Drive (se houver)
    let driveUrl = '';
    if (jsonData.imagemBase64 && jsonData.imagemBase64.trim() !== '') {
      driveUrl = saveImageToDrive(jsonData.imagemBase64, jsonData);
      console.log('Imagem salva no Drive:', driveUrl);
    }
    
    // Preparar dados para a planilha
    const rowData = prepareRowData(jsonData, driveUrl);
    
    // Salvar dados na planilha
    saveToSpreadsheet(rowData);
    
    console.log('✅ Dados processados com sucesso!');
    
    // Retornar sucesso
    return createResponse(200, {
      success: true,
      message: 'Dados salvos com sucesso',
      driveUrl: driveUrl,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao processar dados:', error);
    return createResponse(500, 'Erro interno: ' + error.toString());
  }
}

// ============================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================

/**
 * Valida os dados recebidos
 * @param {Object} data - Dados do formulário
 * @returns {boolean} Verdadeiro se válido
 */
function validateData(data) {
  const requiredFields = [
    'beneficiario',
    'cpf',
    'atendente',
    'produto',
    'quantidade',
    'endereco',
    'data',
    'numeroDocumento'
  ];
  
  // Verificar campos obrigatórios
  for (const field of requiredFields) {
    if (!data[field] || data[field].toString().trim() === '') {
      console.error('Campo obrigatório faltando:', field);
      return false;
    }
  }
  
  // Validar CPF
  if (!validateCPF(data.cpf)) {
    console.error('CPF inválido:', data.cpf);
    return false;
  }
  
  // Validar data
  if (!isValidDate(data.data)) {
    console.error('Data inválida:', data.data);
    return false;
  }
  
  // Validar quantidade
  if (isNaN(parseFloat(data.quantidade)) || parseFloat(data.quantidade) <= 0) {
    console.error('Quantidade inválida:', data.quantidade);
    return false;
  }
  
  return true;
}

/**
 * Valida CPF
 * @param {string} cpf - CPF a validar
 * @returns {boolean} Verdadeiro se válido
 */
function validateCPF(cpf) {
  // Remover caracteres não numéricos
  const numbers = cpf.replace(/\D/g, '');
  
  // Verificar se tem 11 dígitos
  if (numbers.length !== 11) return false;
  
  // Verificar se não é uma sequência repetida
  if (/^(\d)\1+$/.test(numbers)) return false;
  
  // Algoritmo de validação
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(numbers.charAt(i)) * (10 - i);
  }
  
  let remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(numbers.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(numbers.charAt(i)) * (11 - i);
  }
  
  remainder = 11 - (sum % 11);
  if (remainder === 10 || remainder === 11) remainder = 0;
  
  return remainder === parseInt(numbers.charAt(10));
}

/**
 * Valida data
 * @param {string} dateString - Data no formato YYYY-MM-DD
 * @returns {boolean} Verdadeiro se válida
 */
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// ============================================
// FUNÇÕES DO GOOGLE DRIVE
// ============================================

/**
 * Salva imagem base64 no Google Drive
 * @param {string} base64Image - Imagem em base64
 * @param {Object} data - Dados do formulário
 * @returns {string} URL do arquivo no Drive
 */
function saveImageToDrive(base64Image, data) {
  try {
    // Decodificar base64
    const imageBlob = Utilities.newBlob(
      Utilities.base64Decode(base64Image.split(',')[1]),
      'image/jpeg',
      `documento_${data.cpf}_${new Date().getTime()}.jpg`
    );
    
    // Obter ou criar pasta
    const folder = getOrCreateDriveFolder();
    
    // Nome do arquivo
    const fileName = `Documento_${data.cpf.replace(/\D/g, '')}_${data.numeroDocumento.replace(/\//g, '_')}.jpg`;
    
    // Salvar arquivo
    const file = folder.createFile(imageBlob);
    file.setName(fileName);
    file.setDescription(`Documento de ${data.beneficiario} - CPF: ${data.cpf} - ${data.data}`);
    
    // Tornar acessível publicamente (opcional)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    console.log('📁 Arquivo salvo no Drive:', file.getName());
    return file.getUrl();
    
  } catch (error) {
    console.error('Erro ao salvar imagem no Drive:', error);
    throw error;
  }
}

/**
 * Obtém ou cria pasta no Google Drive
 * @returns {Folder} Pasta do Drive
 */
function getOrCreateDriveFolder() {
  try {
    // Buscar pasta existente
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    
    if (folders.hasNext()) {
      return folders.next();
    }
    
    // Criar nova pasta
    console.log('Criando nova pasta no Drive:', DRIVE_FOLDER_NAME);
    const folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
    
    // Adicionar descrição
    folder.setDescription('Imagens de documentos coletados pelo Social Coletor');
    
    return folder;
    
  } catch (error) {
    console.error('Erro ao acessar/criar pasta no Drive:', error);
    throw error;
  }
}

// ============================================
// FUNÇÕES DO GOOGLE SHEETS
// ============================================

/**
 * Prepara dados para a linha da planilha
 * @param {Object} data - Dados do formulário
 * @param {string} driveUrl - URL da imagem no Drive
 * @returns {Array} Dados da linha
 */
function prepareRowData(data, driveUrl) {
  return [
    new Date().toLocaleString('pt-BR'), // Timestamp
    data.beneficiario,
    data.cpf,
    data.atendente,
    data.produto,
    parseFloat(data.quantidade),
    data.endereco,
    data.data,
    data.assinatura || 'N/A',
    data.numeroDocumento,
    driveUrl || 'Sem imagem',
    data.timestamp || new Date().toISOString()
  ];
}

/**
 * Salva dados na planilha do Google Sheets
 * @param {Array} rowData - Dados da linha
 */
function saveToSpreadsheet(rowData) {
  try {
    // Abrir planilha
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Criar aba se não existir
    if (!sheet) {
      console.log('Criando nova aba:', SHEET_NAME);
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      setupSheetHeaders(sheet);
    }
    
    // Adicionar nova linha
    sheet.appendRow(rowData);
    
    // Aplicar formatação
    formatLastRow(sheet);
    
    console.log('📊 Dados salvos na planilha');
    
  } catch (error) {
    console.error('Erro ao salvar na planilha:', error);
    throw error;
  }
}

/**
 * Configura cabeçalhos da planilha
 * @param {Sheet} sheet - Aba da planilha
 */
function setupSheetHeaders(sheet) {
  const headers = [
    'Timestamp',
    'Beneficiário',
    'CPF',
    'Atendente',
    'Produto',
    'Quantidade',
    'Endereço',
    'Data',
    'Assinatura',
    'Número do Documento',
    'Link da Imagem (Drive)',
    'Timestamp ISO'
  ];
  
  // Adicionar cabeçalhos
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Formatar cabeçalhos
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1a237e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // Congelar primeira linha
  sheet.setFrozenRows(1);
  
  // Aplicar filtros
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter();
  
  // Ajustar largura das colunas
  sheet.autoResizeColumns(1, headers.length);
  
  console.log('📋 Cabeçalhos da planilha configurados');
}

/**
 * Formata a última linha adicionada
 * @param {Sheet} sheet - Aba da planilha
 */
function formatLastRow(sheet) {
  const lastRow = sheet.getLastRow();
  const numColumns = 12; // Número de colunas
  
  // Formatar linha
  const rowRange = sheet.getRange(lastRow, 1, 1, numColumns);
  
  // Alternar cores para melhor legibilidade
  if (lastRow % 2 === 0) {
    rowRange.setBackground('#f5f5f5');
  } else {
    rowRange.setBackground('#ffffff');
  }
  
  // Formatar bordas
  rowRange.setBorder(true, true, true, true, true, true);
  
  // Formatar colunas específicas
  sheet.getRange(lastRow, 3).setHorizontalAlignment('center'); // CPF
  sheet.getRange(lastRow, 6).setHorizontalAlignment('center').setNumberFormat('0.00'); // Quantidade
  sheet.getRange(lastRow, 8).setHorizontalAlignment('center'); // Data
  sheet.getRange(lastRow, 10).setHorizontalAlignment('center'); // Número do Documento
  
  // Formatar link da imagem
  const linkCell = sheet.getRange(lastRow, 11);
  if (linkCell.getValue() !== 'Sem imagem') {
    linkCell.setFormula(`=HYPERLINK("${linkCell.getValue()}", "Ver Imagem")`);
  }
  
  // Ajustar altura da linha
  sheet.setRowHeight(lastRow, 30);
}

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

/**
 * Cria resposta HTTP
 * @param {number} statusCode - Código HTTP
 * @param {Object|string} data - Dados da resposta
 * @returns {ContentService.TextOutput} Resposta formatada
 */
function createResponse(statusCode, data) {
  const response = ContentService.createTextOutput();
  response.setMimeType(ContentService.MimeType.JSON);
  response.setContent(JSON.stringify(
    typeof data === 'string' ? { message: data } : data
  ));
  
  return response;
}

/**
 * Função GET para teste
 * @returns {ContentService.TextOutput} Informações do script
 */
function doGet() {
  const info = {
    name: 'Social Coletor - Apps Script',
    version: '1.0',
    description: 'API para receber dados do aplicativo Social Coletor',
    endpoints: {
      POST: '/exec - Recebe dados do formulário',
      GET: '/dev - Esta página de informações'
    },
    sheets: {
      id: SHEET_ID,
      name: SHEET_NAME
    },
    drive: {
      folder: DRIVE_FOLDER_NAME
    },
    timestamp: new Date().toISOString()
  };
  
  return createResponse(200, info);
}

// ============================================
// FUNÇÕES DE MANUTENÇÃO
// ============================================

/**
 * Limpa dados antigos da planilha (manutenção)
 * @param {number} daysToKeep - Número de dias para manter
 */
function cleanupOldData(daysToKeep = 90) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log('Planilha não encontrada');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let rowsToDelete = [];
    
    // Encontrar linhas antigas (começando da linha 2 para pular cabeçalhos)
    for (let i = data.length - 1; i >= 1; i--) {
      const rowDate = new Date(data[i][0]); // Timestamp na coluna A
      
      if (rowDate < cutoffDate) {
        rowsToDelete.push(i + 1); // +1 porque as linhas começam em 1
      }
    }
    
    // Deletar linhas (da mais antiga para a mais nova)
    for (const row of rowsToDelete.sort((a, b) => b - a)) {
      sheet.deleteRow(row);
    }
    
    console.log(`🧹 ${rowsToDelete.length} linhas antigas removidas`);
    
  } catch (error) {
    console.error('Erro ao limpar dados:', error);
  }
}

/**
 * Faz backup da planilha (execução manual)
 */
function createBackup() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const today = new Date().toISOString().split('T')[0];
    const backupName = `Backup ${SHEET_NAME} - ${today}`;
    
    // Criar cópia da planilha
    const backup = spreadsheet.copy(backupName);
    
    // Mover para pasta de backup no Drive
    const backupFolder = getOrCreateBackupFolder();
    const file = DriveApp.getFileById(backup.getId());
    backupFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    
    console.log('💾 Backup criado:', backupName);
    
  } catch (error) {
    console.error('Erro ao criar backup:', error);
  }
}

/**
 * Obtém ou cria pasta de backups
 * @returns {Folder} Pasta de backups
 */
function getOrCreateBackupFolder() {
  const folderName = 'Social Coletor - Backups';
  const folders = DriveApp.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  }
  
  const folder = DriveApp.createFolder(folderName);
  folder.setDescription('Backups automáticos da planilha Social Coletor');
  return folder;
}

console.log('✅ Apps Script do Social Coletor carregado!');
