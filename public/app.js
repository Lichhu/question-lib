const state = {
  q: '',
  category: 'all',
  page: 1,
  limit: 20,
  total: 0,
  expanded: new Set(),
  items: [],
  request: 0,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(text) {
  return window.StudyContent.escape(text);
}

function renderMarkdownLite(text) {
  return window.StudyContent.markdown(text);
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error();
    const stats = await res.json();
    $('#stats').textContent = `共 ${stats.total} 题 · Java ${stats.java} · Linux ${stats.linux} · SQL ${stats.sql} · AI ${stats.ai}`;
  } catch (_) { $('#stats').textContent = '统计暂不可用，请确认服务已启动。'; }
}

async function doSearch() {
  const params = new URLSearchParams({
    q: state.q,
    category: state.category,
    page: state.page,
    limit: state.limit,
  });

  const request = ++state.request;
  $('#results').innerHTML = '<p class="muted" role="status">正在搜索…</p>';
  $('#pagination').innerHTML = '';
  try {
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (request !== state.request) return;
    state.total = data.total;
    state.items = data.items;
    renderResults(state.items);
    renderPagination();
  } catch (_) {
    if (request !== state.request) return;
    $('#results').innerHTML = '<div class="empty" role="alert">搜索失败，请检查网络。<br><button type="button" class="study-secondary" id="retrySearch">重新搜索</button></div>';
    $('#retrySearch').addEventListener('click', doSearch);
  }
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
        <article class="card" data-id="${escapeHtml(item.id)}">
          <div class="card-header">
            <span class="badge ${escapeHtml(item.category)}">${escapeHtml(item.categoryLabel)}</span>
            <div class="question-text">${renderMarkdownLite(item.question)}</div>
          </div>
          ${item.tag ? `<span class="tag">${escapeHtml(item.tag)}</span>` : ''}
          <button type="button" class="toggle-btn" data-id="${escapeHtml(item.id)}" aria-expanded="${expanded}">
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
      renderResults(state.items);
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

function setWorkspaceView(view) {
  const headings = {
    learn: ['先理解知识点，再开始练习', '按专题阅读已有总结，把规则、示例与练习放在同一条学习路径里。'],
    practice: ['专注做好每一道题', '先选范围，再作答。提交后查看解析，错题留给下一轮复习。'],
    mistakes: ['回到还没掌握的知识点', '把答错的题目集中复习，重答后更新掌握状态。'],
  };
  $('#searchView').hidden = view !== 'search';
  $('#studyView').hidden = view === 'search';
  if (view === 'search' && state.request === 0) doSearch();
  $$('.workspace-tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  if (headings[view]) {
    $('#studyTitle').textContent = headings[view][0];
    $('#studyDescription').textContent = headings[view][1];
    $('#learnPane').hidden = view !== 'learn';
    $('#practicePane').hidden = view !== 'practice';
    $('#mistakesPane').hidden = view !== 'mistakes';
  }
  document.dispatchEvent(new CustomEvent('workspacechange', { detail: view }));
}

function init() {
  loadStats();
  $$('.workspace-tab').forEach((tab) => {
    tab.addEventListener('click', () => setWorkspaceView(tab.dataset.view));
  });

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
