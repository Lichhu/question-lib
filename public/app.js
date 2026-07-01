const state = {
  q: '',
  category: 'all',
  page: 1,
  limit: 20,
  total: 0,
  expanded: new Set(),
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdownLite(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  $('#stats').textContent =
    `共 ${stats.total} 题 · Java ${stats.java} · Linux ${stats.linux} · SQL ${stats.sql}`;
}

async function doSearch() {
  const params = new URLSearchParams({
    q: state.q,
    category: state.category,
    page: state.page,
    limit: state.limit,
  });

  const res = await fetch(`/api/search?${params}`);
  const data = await res.json();
  state.total = data.total;
  renderResults(data.items);
  renderPagination();
}

function renderResults(items) {
  const container = $('#results');

  if (items.length === 0) {
    container.innerHTML = '<div class="empty">没有找到匹配的题目，试试换个关键词</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const expanded = state.expanded.has(item.id);
      return `
        <article class="card" data-id="${item.id}">
          <div class="card-header">
            <span class="badge ${item.category}">${item.categoryLabel}</span>
            <div class="question-text">${renderMarkdownLite(item.question)}</div>
          </div>
          ${item.tag ? `<span class="tag">${escapeHtml(item.tag)}</span>` : ''}
          <button class="toggle-btn" data-id="${item.id}">
            ${expanded ? '收起答案' : '查看答案'}
          </button>
          ${
            expanded
              ? `
            <div class="answer-block">
              <div class="label">正确答案</div>
              <div class="answer">${escapeHtml(item.answer)}</div>
              ${
                item.options
                  ? `<div class="options"><div class="label">选项</div>${renderMarkdownLite(item.options)}</div>`
                  : ''
              }
              ${
                item.analysis
                  ? `<div class="analysis"><div class="label">解析</div>${renderMarkdownLite(item.analysis)}</div>`
                  : ''
              }
            </div>`
              : ''
          }
        </article>`;
    })
    .join('');

  container.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (state.expanded.has(id)) {
        state.expanded.delete(id);
      } else {
        state.expanded.add(id);
      }
      doSearch();
    });
  });
}

function renderPagination() {
  const totalPages = Math.ceil(state.total / state.limit) || 1;
  const container = $('#pagination');

  if (state.total <= state.limit) {
    container.innerHTML = state.total > 0
      ? `<span class="page-info">共 ${state.total} 条结果</span>`
      : '';
    return;
  }

  container.innerHTML = `
    <button id="prevPage" ${state.page <= 1 ? 'disabled' : ''}>上一页</button>
    <span class="page-info">第 ${state.page} / ${totalPages} 页，共 ${state.total} 条</span>
    <button id="nextPage" ${state.page >= totalPages ? 'disabled' : ''}>下一页</button>
  `;

  $('#prevPage')?.addEventListener('click', () => {
    state.page--;
    doSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#nextPage')?.addEventListener('click', () => {
    state.page++;
    doSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function init() {
  loadStats();
  doSearch();

  $('#searchBtn').addEventListener('click', () => {
    state.q = $('#searchInput').value.trim();
    state.page = 1;
    state.expanded.clear();
    doSearch();
  });

  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.q = e.target.value.trim();
      state.page = 1;
      state.expanded.clear();
      doSearch();
    }
  });

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.category = tab.dataset.category;
      state.page = 1;
      state.expanded.clear();
      doSearch();
    });
  });
}

init();
