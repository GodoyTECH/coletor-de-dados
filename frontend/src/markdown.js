function escapeHtml(raw = '') {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(text = '') {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderTable(lines, startIndex) {
  const header = lines[startIndex];
  const divider = lines[startIndex + 1];
  if (!header || !divider || !/^\s*\|?\s*[-:| ]+\s*\|?\s*$/.test(divider)) {
    return null;
  }

  const parseCells = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => inlineMarkdown(c.trim()));
  const headers = parseCells(header);

  let i = startIndex + 2;
  const rows = [];
  while (i < lines.length && lines[i].includes('|')) {
    rows.push(parseCells(lines[i]));
    i += 1;
  }

  const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;

  return {
    html: `<div class="markdown-table-wrap"><table>${thead}${tbody}</table></div>`,
    nextIndex: i
  };
}

export function renderMarkdownToHtml(raw = '') {
  const escaped = escapeHtml(raw);
  const lines = escaped.split(/\r?\n/);

  let i = 0;
  let html = '';
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const table = renderTable(lines, i);
    if (table) {
      closeList();
      html += table.html;
      i = table.nextIndex;
      continue;
    }

    if (!trimmed) {
      closeList();
      html += '<br />';
      i += 1;
      continue;
    }

    if (/^#{1,3}\s/.test(trimmed)) {
      closeList();
      const level = trimmed.match(/^#+/)[0].length;
      const content = inlineMarkdown(trimmed.replace(/^#{1,3}\s+/, ''));
      html += `<h${level}>${content}</h${level}>`;
      i += 1;
      continue;
    }

    if (/^[*-]\s+/.test(trimmed)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineMarkdown(trimmed.replace(/^[*-]\s+/, ''))}</li>`;
      i += 1;
      continue;
    }

    closeList();
    html += `<p>${inlineMarkdown(trimmed)}</p>`;
    i += 1;
  }

  closeList();
  return html;
}
