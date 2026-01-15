const API_ENDPOINT = '/.netlify/functions/sc-api';

const AUTH_REMEMBER_KEY = 'social_coletor_remember';
const AUTH_SESSION_KEY = 'social_coletor_session';
const AUTH_TOKEN_KEY = 'social_coletor_token';

const appState = {
  registros: {
    headers: [],
    data: [],
    pageSize: 20,
    offset: 0,
    totalCount: 0,
    hasMore: false,
    dirtyCells: new Map(),
    loading: false,
    saving: false
  },
  currentTab: 'dashboard'
};

function isAuthenticated() {
  return Boolean(getAuthToken());
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
}

function showStatus(message, type = 'info', duration = 3000) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = type;
  statusEl.style.display = 'flex';

  if (duration > 0) {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.style.display = 'none';
      }
    }, duration);
  }
}

function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR').substring(0, 5)}`;
  } catch {
    return String(date);
  }
}

async function apiRequest(action, data = {}, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = getAuthToken();
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ action, data }),
      signal: controller.signal
    });

    const text = await response.text();
    let parsed = null;

    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (error) {
      return { success: false, error: 'Resposta inválida do servidor', details: error?.message || String(error) };
    }

    if (!parsed || typeof parsed.success !== 'boolean') {
      return { success: false, error: 'Resposta inesperada do servidor', details: parsed };
    }

    return parsed;
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { success: false, error: 'Tempo limite excedido. Tente novamente.' };
    }
    return { success: false, error: 'Falha ao conectar com o servidor', details: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const tabElement = document.getElementById(tabId);
  if (tabElement) tabElement.classList.remove('hidden');

  const button = document.querySelector(`[data-tab="${tabId}"]`);
  if (button) button.classList.add('active');

  appState.currentTab = tabId;

  if (tabId === 'dashboard') loadDashboard();

  if (tabId === 'registros') {
    if (!appState.registros.data.length) {
      loadRegistros(true);
    }
  }

  if (tabId === 'duplicados') loadDuplicados();
  if (tabId === 'relatorios') loadRelatorios();
}

function normalizeProdutoLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function aggregateProdutos(porProduto = {}) {
  const map = new Map();
  let totalQuantidade = 0;

  Object.entries(porProduto || {}).forEach(([produto, quantidade]) => {
    const normalized = normalizeProdutoLabel(produto);
    if (!normalized) return;

    const qty = Number(quantidade || 0);
    if (Number.isNaN(qty)) return;

    totalQuantidade += qty;

    if (!map.has(normalized)) {
      map.set(normalized, { label: String(produto || '').trim(), quantidade: 0 });
    }

    const entry = map.get(normalized);
    entry.quantidade += qty;
  });

  return {
    totalQuantidade,
    produtos: Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade)
  };
}

async function loadDashboard() {
  showStatus('Carregando dados do dashboard...', 'info');

  const result = await apiRequest('getDashboardData', {});
  if (!result.success) {
    showStatus(`Erro ao carregar dashboard: ${result.error}`, 'error');
    return;
  }

  try {
    document.getElementById('totalRegistros').textContent = result.total || 0;
    document.getElementById('ativosRegistros').textContent = result.ativos || 0;
    document.getElementById('duplicadosRegistros').textContent = result.duplicados || 0;

    const produtosDiv = document.getElementById('produtosChart');
    const aggregated = aggregateProdutos(result.porProduto || {});

    if (aggregated.produtos.length > 0) {
      let html = '<div style="max-width: 500px; margin: 0 auto;">';

      aggregated.produtos.forEach(({ label, quantidade }) => {
        const percent = aggregated.totalQuantidade > 0
          ? ((quantidade / aggregated.totalQuantidade) * 100).toFixed(1)
          : 0;

        html += `
          <div style="margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
              <span><strong>${escapeHtml(label)}</strong></span>
              <span>${quantidade} (${percent}%)</span>
            </div>
            <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${percent}%; background: var(--primary);"></div>
            </div>
          </div>
        `;
      });

      html += '</div>';
      produtosDiv.innerHTML = html;
    } else {
      produtosDiv.innerHTML = '<p class="text-muted text-center">Nenhum dado disponível</p>';
    }
  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);
    showStatus('Erro ao processar dados do dashboard', 'error');
  }
}

function resetRegistros() {
  appState.registros = {
    headers: [],
    data: [],
    pageSize: 20,
    offset: 0,
    totalCount: 0,
    hasMore: false,
    dirtyCells: new Map(),
    loading: false,
    saving: false
  };

  loadRegistros(true);
}

async function loadRegistros(reset = false) {
  if (appState.registros.loading) return;
  appState.registros.loading = true;

  const registrosInfo = document.getElementById('registrosInfo');
  if (registrosInfo) {
    registrosInfo.innerHTML = '<i class="fas fa-spinner spinner"></i> Carregando registros...';
  }

  const { pageSize, offset } = appState.registros;
  const result = await apiRequest('listRegistros', { limit: pageSize, offset: offset || 0 });

  appState.registros.loading = false;

  if (!result.success) {
    showStatus(`Erro ao carregar registros: ${result.error}`, 'error');
    if (registrosInfo) registrosInfo.textContent = 'Erro ao carregar registros.';
    return;
  }

  if (reset) {
    appState.registros.data = [];
    appState.registros.headers = [];
  }

  renderRegistros(result);
}

function loadMoreRegistros() {
  if (appState.registros.hasMore) {
    loadRegistros();
  }
}

function renderRegistros(result) {
  const { headers, rows, meta } = result;

  if (!appState.registros.headers.length) {
    appState.registros.headers = headers || [];
    renderHeaders(headers || []);
  }

  (rows || []).forEach(row => appState.registros.data.push(row));

  renderRegistrosRows();

  const total = meta?.total || 0;
  const loaded = appState.registros.data.length;

  appState.registros.totalCount = total;
  appState.registros.hasMore = Boolean(meta?.hasMore);
  appState.registros.offset = meta?.offset ?? appState.registros.offset;

  const infoEl = document.getElementById('registrosInfo');
  if (infoEl) infoEl.textContent = `Mostrando ${loaded} de ${total} registros`;

  const btnMore = document.getElementById('btnMaisRegistros');
  if (btnMore) btnMore.style.display = appState.registros.hasMore ? 'inline-flex' : 'none';

  const btnSave = document.getElementById('btnSalvarRegistros');
  if (btnSave) btnSave.style.display = appState.registros.dirtyCells.size > 0 ? 'inline-flex' : 'none';
}

function renderHeaders(headers) {
  const headersRow = document.getElementById('registrosHeaders');
  if (!headersRow) return;

  headersRow.innerHTML = '';

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headersRow.appendChild(th);
  });
}

function buildEditableCell(value, rowNumber, header) {
  const container = document.createElement('div');
  container.className = 'editable-cell';
  container.contentEditable = true;
  container.dataset.originalValue = value ?? '';
  container.textContent = value ?? '';

  const handleChange = () => {
    const newValue = container.textContent;
    const original = container.dataset.originalValue || '';

    if (newValue !== original) {
      markCellDirty(rowNumber, header, newValue, container);
    } else {
      clearCellDirty(rowNumber, header, container);
    }
  };

  container.addEventListener('input', handleChange);
  container.addEventListener('blur', handleChange);

  return container;
}

function renderRegistrosRows() {
  const tbody = document.getElementById('registrosBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  appState.registros.data.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.rowNumber = row.rowNumber;

    (row.values || []).forEach((value, colIndex) => {
      const td = document.createElement('td');
      const header = appState.registros.headers[colIndex] || '';

      if (header === 'IMG_URL') {
        if (value) {
          const linkWrapper = document.createElement('div');
          linkWrapper.className = 'mt-1';
          linkWrapper.innerHTML = `
            <a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer" class="btn btn-small btn-secondary btn-image">Ver imagem</a>
          `;

          const thumb = document.createElement('img');
          thumb.src = value;
          thumb.alt = 'Imagem do registro';
          thumb.style.maxWidth = '60px';
          thumb.style.display = 'block';
          thumb.style.marginTop = '0.5rem';
          thumb.loading = 'lazy';
          thumb.referrerPolicy = 'no-referrer';
          thumb.onerror = () => thumb.remove();

          linkWrapper.appendChild(thumb);
          td.appendChild(linkWrapper);
        } else {
          td.textContent = '—';
        }

        tr.appendChild(td);
        return;
      }

      const editable = buildEditableCell(value, row.rowNumber, header);
      td.appendChild(editable);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function markCellDirty(rowNumber, column, value, cellElement) {
  let rowMap = appState.registros.dirtyCells.get(rowNumber);
  if (!rowMap) {
    rowMap = new Map();
    appState.registros.dirtyCells.set(rowNumber, rowMap);
  }

  rowMap.set(column, value);

  if (cellElement) cellElement.classList.add('dirty');

  const btnSave = document.getElementById('btnSalvarRegistros');
  if (btnSave) btnSave.style.display = 'inline-flex';
}

function clearCellDirty(rowNumber, column, cellElement) {
  const rowMap = appState.registros.dirtyCells.get(rowNumber);
  if (rowMap) {
    rowMap.delete(column);
    if (rowMap.size === 0) {
      appState.registros.dirtyCells.delete(rowNumber);
    }
  }

  if (cellElement) cellElement.classList.remove('dirty');

  const btnSave = document.getElementById('btnSalvarRegistros');
  if (btnSave) btnSave.style.display = appState.registros.dirtyCells.size > 0 ? 'inline-flex' : 'none';
}

async function saveRegistros() {
  if (appState.registros.saving) return;

  const updates = [];

  appState.registros.dirtyCells.forEach((cols, rowNumber) => {
    const values = {};
    cols.forEach((value, col) => { values[col] = value; });
    updates.push({ rowNumber, values });
  });

  if (updates.length === 0) {
    showStatus('Nenhuma alteração para salvar', 'warning');
    return;
  }

  appState.registros.saving = true;
  showStatus('Salvando alterações...', 'info');

  const result = await apiRequest('updateRegistrosBatch', { updates });
  appState.registros.saving = false;

  if (result.success) {
    showStatus(`Alterações salvas (${result.updated || 0} linhas)`, 'success');
    appState.registros.dirtyCells.clear();

    const btnSave = document.getElementById('btnSalvarRegistros');
    if (btnSave) btnSave.style.display = 'none';

    resetRegistros();
  } else {
    showStatus(`Erro ao salvar: ${result.error}`, 'error');
  }
}

async function loadDuplicados() {
  const result = await apiRequest('listDuplicados', {});
  if (!result.success) {
    showStatus(`Erro ao carregar duplicados: ${result.error}`, 'error');
    return;
  }

  renderDuplicados(result.duplicados || []);
}

function renderDuplicados(duplicados) {
  const tbody = document.getElementById('duplicadosBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!duplicados.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum duplicado encontrado</td></tr>';
    return;
  }

  duplicados.forEach(dup => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(dup.ID || '')}</td>
      <td>${escapeHtml(dup.BENEFICIARIO || '')}</td>
      <td>${escapeHtml(dup.NUM_DOCUMENTO || '')}</td>
      <td>${escapeHtml(dup.PRODUTO || '')}</td>
      <td>${escapeHtml(dup.STATUS || '')}</td>
      <td>${escapeHtml(dup.DUP_REASON || '')}</td>
      <td>
        <button class="btn btn-small btn-success" onclick="resolverDuplicado(${dup.rowNumber}, 'validar')">
          <i class="fas fa-check"></i> Validar
        </button>
        <button class="btn btn-small btn-warning" onclick="resolverDuplicado(${dup.rowNumber}, 'manter')">
          <i class="fas fa-flag"></i> Manter
        </button>
        <button class="btn btn-small btn-danger" onclick="resolverDuplicado(${dup.rowNumber}, 'excluir')">
          <i class="fas fa-trash"></i> Excluir
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function resolverDuplicado(rowNumber, action) {
  const result = await apiRequest('resolveDuplicado', { rowNumber, action });

  if (result.success) {
    showStatus('Duplicado resolvido', 'success');
    loadDuplicados();
    resetRegistros();
  } else {
    showStatus(`Erro ao resolver duplicado: ${result.error}`, 'error');
  }
}

async function loadRelatorios() {
  const result = await apiRequest('listRelatorios', {});
  if (!result.success) {
    showStatus(`Erro ao carregar relatórios: ${result.error}`, 'error');
    return;
  }

  renderRelatorios(result.relatorios || []);
}

function renderRelatorios(relatorios) {
  const tbody = document.getElementById('relatoriosBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!relatorios.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum relatório encontrado</td></tr>';
    return;
  }

  relatorios.forEach(rel => {
    const resumo = rel.RESUMO || '';
    const resumoShort = resumo.length > 100 ? `${resumo.substring(0, 100)}...` : resumo;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(rel.COMPETENCIA || '')}</td>
      <td>${rel.TOTAL_REGISTROS || 0}</td>
      <td>${rel.TOTAL_ATIVOS || 0}</td>
      <td>${rel.TOTAL_DUPLICADOS || 0}</td>
      <td>${formatDate(rel.CREATED_AT)}</td>
      <td>${rel.URL_PDF ? `<a href="${rel.URL_PDF}" target="_blank" class="btn btn-small btn-secondary">Abrir PDF</a>` : 'N/A'}</td>
      <td title="${escapeHtml(resumo)}">${escapeHtml(resumoShort)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function gerarRelatorio() {
  showStatus('Gerando relatório, aguarde...', 'info');

  const result = await apiRequest('gerarRelatorio', {}, { timeoutMs: 30000 });

  if (result.success) {
    showStatus('Relatório gerado com sucesso', 'success');
    loadRelatorios();
  } else {
    showStatus(`Erro ao gerar relatório: ${result.error}`, 'error');
  }
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => showTab(button.getAttribute('data-tab')));
  });
}

window.resetRegistros = resetRegistros;
window.loadMoreRegistros = loadMoreRegistros;
window.saveRegistros = saveRegistros;
window.loadDuplicados = loadDuplicados;
window.resolverDuplicado = resolverDuplicado;
window.loadRelatorios = loadRelatorios;
window.gerarRelatorio = gerarRelatorio;

window.addEventListener('DOMContentLoaded', () => {
  if (!isAuthenticated()) {
    window.location.href = 'index.html';
    return;
  }

  setupTabs();
  showTab('dashboard');
});
