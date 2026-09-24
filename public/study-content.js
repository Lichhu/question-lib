(function (root) {
  'use strict';
  function escape(text) {
    return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function inline(text) {
    return String(text).split(/(`+[^`]+`+)/g).map(part => {
      if (/^`/.test(part)) return `<code>${escape(part.replace(/^`+|`+$/g, ''))}</code>`;
      return escape(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }).join('');
  }
  function cells(line) {
    // 忽略行内代码中的竖线及转义竖线，保留 SQL、Shell 表达式。
    const result = [];
    let cell = '', code = false;
    const text = line.trim().replace(/^\||\|$/g, '');
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\' && text[i + 1] === '|') { cell += '|'; i++; continue; }
      if (text[i] === '`') code = !code;
      if (text[i] === '|' && !code) { result.push(cell.trim()); cell = ''; }
      else cell += text[i];
    }
    result.push(cell.trim());
    return result;
  }
  function markdown(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let paragraph = [], list = [], listType = '';
    const flush = () => {
      if (paragraph.length) output.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      if (list.length) output.push(`<${listType}>${list.map(x => `<li>${inline(x)}</li>`).join('')}</${listType}>`);
      paragraph = []; list = []; listType = '';
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        flush();
        const code = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
        output.push(`<pre tabindex="0"><code>${escape(code.join('\n'))}</code></pre>`);
      } else if (/^\s*\|/.test(line) && /^\s*\|[\s:|\-]+\|\s*$/.test(lines[i + 1] || '')) {
        flush();
        const header = cells(line);
        const rows = [];
        i++;
        while (/^\s*\|/.test(lines[i + 1] || '')) rows.push(cells(lines[++i]));
        output.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="知识点对比表"><table><thead><tr>${header.map(c => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      } else if (/^#{1,6}\s/.test(line)) {
        flush();
        const [, marks, title] = line.match(/^(#{1,6})\s+(.*)$/);
        const level = Math.min(marks.length + 1, 6);
        output.push(`<h${level}>${inline(title)}</h${level}>`);
      } else if (/^\s*(?:[-*] |\d+\. )/.test(line)) {
        const type = /^\s*\d/.test(line) ? 'ol' : 'ul';
        if (paragraph.length || listType && listType !== type) flush();
        listType = type;
        list.push(line.replace(/^\s*(?:[-*] |\d+\. )/, ''));
      } else if (!line.trim()) flush();
      else { if (list.length) flush(); paragraph.push(line); }
    }
    flush();
    return output.join('\n');
  }
  const api = { escape, inline, markdown, cells };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudyContent = api;
})(typeof window === 'undefined' ? globalThis : window);
