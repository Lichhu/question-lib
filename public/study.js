(function () {
  'use strict';
  const $ = sel => document.querySelector(sel);
  const S = window.StudyState;
  const { escape: esc, markdown: md } = window.StudyContent;
  const names = { java: 'Java', linux: 'Linux', sql: 'SQL' };
  const kinds = { single: '单选题', multiple: '多选题', boolean: '判断题', review: '核对题 · 不计分' };
  const mobile = window.matchMedia('(max-width: 700px)');
  let data = S.defaults(), catalog = null, view = 'practice';
  let current = null, result = null, busy = false, loadingCatalog = false;
  let catalogSerial = 0, questionSerial = 0, readerSerial = 0, mistakeSerial = 0, mistakePage = 0;
  let storageBlocked = false;

  function notice(text, target = '#studyAlert') {
    $(target).textContent = text;
    $(target).hidden = !text;
  }
  try { data = S.restore(localStorage.getItem(S.KEY)); }
  catch (_) {
    storageBlocked = true;
    notice('无法读取本地记录（可能被浏览器禁用或数据损坏）。本次可临时练习，原记录不会被覆盖。', '#storageStatus');
  }
  function save() {
    if (storageBlocked) return;
    try { localStorage.setItem(S.KEY, JSON.stringify(data)); }
    catch (_) { notice('本地保存失败，可能空间不足或浏览器禁用了存储。本次仍可练习，刷新可能丢失最新进度。', '#storageStatus'); }
  }
  window.addEventListener('storage', e => {
    if (e.key === S.KEY || e.key === null) {
      storageBlocked = true;
      notice('其他标签页更改了学习记录。为避免覆盖，已暂停本页保存；请刷新后继续。', '#storageStatus');
    }
  });

  async function api(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store',
        ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || '请求失败，请重试。');
      return json;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('请求超时，请检查网络后重试。');
      if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('无法连接题库服务，请检查网络及服务是否已启动。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function button(text, action, secondary = false, disabled = false) {
    return `<button type="button" class="${secondary ? 'study-secondary' : 'study-primary'}" data-action="${action}" ${disabled ? 'disabled data-fixed-disabled' : ''}>${text}</button>`;
  }
  function panelError(selector, error, action) {
    $(selector).setAttribute('aria-busy', 'false');
    $(selector).innerHTML = `<p role="alert">${esc(error.message)}</p>${button('重试', action, true)}`;
  }
  function stats() {
    const m = S.metrics(data);
    $('#practicedCount').textContent = m.practiced;
    $('#accuracyCount').textContent = m.accuracy === null ? '—' : `${m.accuracy}%`;
    $('#mistakeCount').textContent = m.mistakes;
    $('#accuracyCount').title = `${m.correct} 次正确 / ${m.attempts} 次提交；核对题不计入`;
    $('#continueSession').hidden = !data.session;
  }
  function controls() {
    const blocked = busy || loadingCatalog || !catalog;
    document.querySelectorAll('.filter-fields input, .filter-fields select, .filter-fields button').forEach(el => { el.disabled = blocked; });
    document.querySelectorAll('#learnPane button, #mistakesPane button').forEach(el => { el.disabled = blocked || el.hasAttribute('data-fixed-disabled'); });
  }
  function scopedTags() { return catalog?.tags.filter(t => !data.filters.topic || t.topics.includes(data.filters.topic)) || []; }
  function renderTags() {
    const search = $('#tagSearch').value.trim().toLowerCase();
    const tags = scopedTags().filter(t => !search || t.tag.toLowerCase().includes(search) || t.tag === data.filters.tag);
    $('#studyTag').innerHTML = `<option value="">全部 tag</option>${tags.map(t => `<option value="${esc(t.tag)}">${esc(t.tag || '未标注')}（${t.count}）</option>`).join('')}`;
    $('#studyTag').value = data.filters.tag;
  }
  function scope() {
    const f = data.filters;
    const topic = catalog?.topics.find(t => t.id === f.topic);
    $('#filterSummary').textContent = `${names[f.category]} · ${topic ? topic.id : '全部专题'}`;
    const count = scopedTags().filter(t => !f.tag || t.tag === f.tag).reduce((n, t) => n + t.count, 0);
    $('#scopeCount').textContent = `当前范围 ${count} 道题${f.tag ? ` · ${f.tag}` : ''}`;
  }
  async function loadCatalog() {
    const serial = ++catalogSerial;
    loadingCatalog = true; controls(); notice('');
    $('#reloadStudy').hidden = true;
    try {
      const next = await api(`/api/study/catalog?category=${encodeURIComponent(data.filters.category)}`);
      if (serial !== catalogSerial) return;
      catalog = next;
      if (!catalog.topics.some(t => t.id === data.filters.topic)) data.filters.topic = '';
      if (!scopedTags().some(t => t.tag === data.filters.tag)) data.filters.tag = '';
      $('#studyCategory').value = data.filters.category;
      $('#studyOrder').value = data.filters.order;
      $('#studyTopic').innerHTML = `<option value="">全部专题</option>${catalog.topics.map(t => `<option value="${t.id}">${esc(t.id + ' ' + t.title)}（${t.count}）</option>`).join('')}`;
      $('#studyTopic').value = data.filters.topic;
      renderTags(); scope();
      if (data.session && data.session.revision !== catalog.revision) {
        data.session = null; current = null; result = null; questionSerial++;
        notice('题库或知识点已更新，旧练习队列已失效。历史统计保留，请开始新一轮。');
      }
      save(); stats();
      if (view === 'learn') renderReader();
      if (view === 'mistakes') renderMistakes();
      if (!current) loadQuestion();
    } catch (error) {
      if (serial !== catalogSerial) return;
      catalog = null; notice(error.message); $('#reloadStudy').hidden = false;
      $('#scopeCount').textContent = '学习数据加载失败，请重试。';
      if (!current) idle();
    } finally {
      if (serial === catalogSerial) { loadingCatalog = false; controls(); }
    }
  }
  function idle() {
    $('#practicePane').setAttribute('aria-busy', 'false');
    $('#practicePane').innerHTML = `<p class="eyebrow">从一道题开始</p><h3>准备好开始练习了吗？</h3><p class="muted">展开「练习范围」选择学科、专题或 tag。也可以直接开始当前范围的顺序练习。</p><div class="inline-actions">${button('开始当前范围', 'start', false, !catalog)}${button('选择范围', 'filters', true)}</div><p class="filter-note">单选、多选和判断题支持自动判分；格式异常或已有纠偏的题只作核对。</p>`;
  }
  function focusQuestion() {
    if (view !== 'practice') return;
    const pane = $('#practicePane');
    pane.tabIndex = -1;
    pane.focus({ preventScroll: true });
    if (mobile.matches) window.scrollTo({ top: window.scrollY + pane.getBoundingClientRect().top - 12, behavior: 'auto' });
  }
  async function start(mode = 'practice', onlyId = '') {
    if (busy || loadingCatalog || !catalog) return;
    if (data.session && !window.confirm('开始新一轮会替换当前练习队列，累计统计和错题记录保留。继续吗？')) return;
    busy = true; controls(); notice('');
    const filters = { ...data.filters };
    try {
      const queue = await api(`/api/practice/queue?${new URLSearchParams(filters)}`);
      let ids = queue.ids;
      if (mode === 'mistakes') {
        const wrong = new Set(S.mistakes(data, filters, catalog));
        ids = ids.filter(id => wrong.has(id));
      }
      if (onlyId) ids = ids.filter(id => id === onlyId);
      if (!ids.length) { notice(mode === 'mistakes' ? '当前范围没有可重练的错题。' : '当前范围没有题目，请更换筛选。'); return; }
      S.start(data, ids, queue.revision, filters, mode);
      current = null; result = null; save(); stats();
      if (mobile.matches) $('#studyFilters').open = false;
      setWorkspaceView('practice');
      await loadQuestion(); focusQuestion();
    } catch (error) { notice(error.message); }
    finally { busy = false; controls(); }
  }
  async function loadQuestion() {
    const serial = ++questionSerial;
    const s = data.session;
    current = null; result = null;
    if (!s) { idle(); return; }
    if (s.finished) { summary(); return; }
    const id = s.ids[s.index];
    $('#practicePane').setAttribute('aria-busy', 'true');
    $('#practicePane').innerHTML = '<p class="muted" role="status">正在加载题目…</p>';
    try {
      const question = await api(`/api/practice/question/${encodeURIComponent(id)}`);
      if (serial !== questionSerial || data.session !== s) return;
      if (question.revision !== s.revision) throw new Error('题库已更新，请重新开始练习。历史记录仍然保留。');
      let feedback = null;
      if (s.responses[id]) feedback = await api(`/api/practice/grade/${encodeURIComponent(id)}`, { selected: s.responses[id].selected, revision: s.revision });
      if (serial !== questionSerial || data.session !== s) return;
      current = question; result = feedback;
      renderQuestion();
    } catch (error) { if (serial === questionSerial) panelError('#practicePane', error, 'retry-question'); }
  }
  function renderQuestion() {
    const q = current, s = data.session;
    if (!q || !s) return;
    const selected = result?.selected || s.drafts[q.id] || [];
    const locked = Boolean(result) || q.kind === 'review';
    const answered = Object.keys(s.responses).length;
    const choiceHtml = q.choices.map(c => {
      const checked = selected.includes(c.key);
      const status = result && result.correct !== null ? result.expected.includes(c.key) ? 'correct-option' : checked ? 'wrong-option' : '' : '';
      const mark = result && result.correct !== null ? result.expected.includes(c.key) ? '<span class="choice-verdict">正确选项</span>' : checked ? '<span class="choice-verdict">你的选择</span>' : '' : '';
      return `<label class="practice-option ${status} ${checked ? 'selected' : ''}"><input type="${q.kind === 'multiple' ? 'checkbox' : 'radio'}" name="practiceAnswer" value="${c.key}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}><span class="option-key">${c.key}</span><span class="option-body rich-text">${md(c.text)}${mark}</span></label>`;
    }).join('');
    const feedback = result ? `<section id="gradeFeedback" class="grade-feedback ${result.correct === true ? 'is-correct' : result.correct === false ? 'is-wrong' : 'is-review'}" tabindex="-1">
      <h3>${result.correct === true ? '回答正确' : result.correct === false ? '回答错误 · 已加入错题本' : '参考核对 · 不计入正确率'}</h3>
      ${result.correct !== null ? `<p>你的答案：<strong>${esc(result.selected.join('、'))}</strong>　题库答案：<strong>${esc(result.answer)}</strong></p>` : `<p>题库原答案（仅供核对）：${esc(result.answer)}</p>`}
      ${result.issue ? `<div class="notice"><strong>已知疑点</strong><div class="rich-text">${md(result.issue.problem)}${md(result.issue.correction)}</div></div>` : ''}
      <h4>题库解析${result.issue ? '（可能有误，请对照纠偏）' : ''}</h4><div class="rich-text">${md(result.analysis || '暂无解析。')}</div>
      ${q.topics.length ? `<div class="inline-actions">${q.topics.map(id => `<button type="button" class="study-secondary" data-topic="${id}" data-category="${q.category}">复习 ${id}</button>`).join('')}</div>` : ''}
    </section>` : '';
    $('#practicePane').setAttribute('aria-busy', 'false');
    $('#practicePane').innerHTML = `<div class="practice-topline"><span class="badge ${esc(q.category)}">${esc(q.categoryLabel)} · ${kinds[q.kind]}</span><span>第 ${s.index + 1} / ${s.ids.length} 题</span></div>
      <div class="session-caption">${s.mode === 'mistakes' ? '错题重练' : s.filters.order === 'random' ? '随机练习' : '顺序练习'} · ${esc(s.filters.topic || '全部专题')}${s.filters.tag ? ' · ' + esc(s.filters.tag) : ''} · 已处理 ${answered} 题</div>
      <progress class="study-progress" value="${answered}" max="${s.ids.length}" aria-label="本轮完成进度"></progress>
      <p class="question-id">题号 ${esc(q.id)} · ${esc(q.tag || '未标注 tag')}</p>
      <div class="rich-text practice-question">${md(q.question)}</div>
      ${q.warning ? `<p class="notice">${esc(q.warning)}</p>` : `<p class="answer-hint">${q.kind === 'multiple' ? '可选择多项；全部选对且不多选才计为正确。' : '请选择一项，然后提交答案。'}</p>`}
      <fieldset class="practice-options" ${locked ? 'disabled' : ''}><legend class="sr-only">${kinds[q.kind]}选项</legend>${choiceHtml}</fieldset>
      ${q.rawOptions ? `<div class="rich-text raw-options">${md(q.rawOptions)}</div>` : ''}
      <p id="answerStatus" class="answer-status" aria-live="polite">${result ? '已提交，结果已记录。' : selected.length ? '已选：' + esc(selected.join('、')) : '尚未提交'}</p>
      <div class="practice-actions">${button('上一题', 'previous', true, s.index === 0)}${result ? '' : button(q.kind === 'review' ? '查看参考与纠偏' : '提交答案', 'submit', false, q.kind !== 'review' && !selected.length)}${button(s.index === s.ids.length - 1 ? '本轮总结' : result ? '下一题' : '暂跳此题', 'next', true)}</div>
      <div id="submissionError" role="alert"></div>${feedback}`;
  }
  async function submit() {
    if (busy || !current || result || !data.session) return;
    const q = current, s = data.session;
    const selected = q.kind === 'review' ? [] : s.drafts[q.id] || [];
    if (q.kind !== 'review' && !selected.length) return;
    busy = true; controls();
    $('#practicePane').querySelectorAll('button, input').forEach(el => { el.disabled = true; });
    $('#answerStatus').textContent = '正在提交…';
    try {
      const feedback = await api(`/api/practice/grade/${encodeURIComponent(q.id)}`, { selected, revision: s.revision });
      if (data.session !== s || current !== q) return;
      S.record(data, q, feedback); result = feedback; save(); stats(); renderQuestion();
      if (view === 'practice') $('#gradeFeedback')?.focus({ preventScroll: true });
      if (view === 'mistakes') renderMistakes();
    } catch (error) {
      if (current === q) { renderQuestion(); $('#submissionError').textContent = error.message; }
    } finally { busy = false; controls(); }
  }
  function navigate(delta) {
    if (busy || !data.session || !current) return;
    const s = data.session;
    if (delta > 0 && s.index === s.ids.length - 1) { s.finished = true; save(); summary(); return; }
    s.index = Math.max(0, Math.min(s.ids.length - 1, s.index + delta));
    save(); loadQuestion(); focusQuestion();
  }
  function summary() {
    const s = data.session;
    if (!s) return idle();
    const responses = Object.values(s.responses);
    const scored = responses.filter(r => r.correct !== null);
    const right = scored.filter(r => r.correct).length;
    const pending = s.ids.length - responses.length;
    current = null;
    $('#practicePane').setAttribute('aria-busy', 'false');
    $('#practicePane').innerHTML = `<p class="eyebrow">本轮学习小结</p><h3>${pending ? '还有题目等你完成' : '本轮练习已完成'}</h3><p>已处理 ${responses.length} / ${s.ids.length} 题，其中 ${responses.length - scored.length} 题仅作核对。</p><p>本轮正确率：<strong>${scored.length ? Math.round(right / scored.length * 100) + '%' : '—'}</strong>（${right} / ${scored.length}）</p><div class="inline-actions">${button(pending ? `继续未答 ${pending} 题` : '查看本轮答案', 'resume-pending')}${button('复习错题', 'show-mistakes', true)}</div>`;
  }
  async function renderReader() {
    const serial = ++readerSerial;
    if (!catalog) return;
    const topic = data.filters.topic;
    const subject = catalog;
    if (subject.category !== data.filters.category) return;
    $('#learnPane').innerHTML = '<p class="muted" role="status">正在加载知识点…</p>';
    try {
      if (!topic) {
        $('#learnPane').innerHTML = `<h3>${names[subject.category]} 专题目录</h3><p class="filter-note">${esc(subject.mappingNote)}</p><div class="topic-list">${subject.topics.map(t => `<button type="button" class="topic-link" data-topic="${t.id}" data-category="${t.category}"><span><strong>${t.id}</strong> ${esc(t.title)}</span><small>${t.count} 道关联题</small></button>`).join('')}</div>${!subject.guideAvailable ? '<p>未找到该学科总结文件，可继续按 tag 刷题。</p>' : `<details class="reading-scope"><summary>数据范围与复习方法</summary><div class="rich-text">${md(subject.introduction)}</div></details>`}`;
      } else {
        const t = await api(`/api/study/topic/${topic}`);
        if (serial !== readerSerial) return;
        $('#learnPane').innerHTML = `<p class="eyebrow">${names[t.category]} · ${t.id} · ${t.count} 道关联题</p><h3>${esc(t.title)}</h3><div class="inline-actions">${button('练习当前范围', 'start')}${button('返回专题目录', 'topic-list', true)}</div><p class="filter-note">${esc(subject.mappingNote)}</p><div class="rich-text lesson-body">${md(t.markdown)}</div>${button('开始练习', 'start')}`;
      }
      controls();
    } catch (error) { if (serial === readerSerial) panelError('#learnPane', error, 'retry-reader'); }
  }
  async function openTopic(id, category) {
    if (busy || loadingCatalog) return;
    data.filters = { ...data.filters, category, topic: id, tag: '' };
    $('#tagSearch').value = '';
    setWorkspaceView('learn');
    if (catalog?.category !== category) await loadCatalog();
    else { $('#studyTopic').value = id; renderTags(); scope(); save(); renderReader(); }
    if (mobile.matches) $('#studyFilters').open = false;
  }
  async function renderMistakes() {
    const serial = ++mistakeSerial;
    if (!catalog || catalog.category !== data.filters.category) return;
    const ids = S.mistakes(data, data.filters, catalog);
    mistakePage = Math.max(0, Math.min(mistakePage, Math.ceil(ids.length / 20) - 1));
    $('#mistakesPane').innerHTML = '<p class="muted" role="status">正在加载错题…</p>';
    try {
      const response = ids.length ? await api('/api/practice/items', { ids: ids.slice(mistakePage * 20, mistakePage * 20 + 20) }) : { items: [] };
      if (serial !== mistakeSerial) return;
      $('#mistakesPane').innerHTML = `<h3>当前范围 · ${ids.length} 道待复习错题</h3><p class="filter-note">最后一次作答错误的题会留在这里；重答正确后自动移出。累计作答记录仍保留。</p>
        ${ids.length ? button('重练当前范围错题', 'retry-mistakes') : `<div class="empty">当前范围暂无错题。${button('去练习', 'show-practice', true)}</div>`}
        <div class="mistake-list">${response.items.map(q => `<article class="mistake-item"><p class="question-id">${esc(q.id)} · ${esc(q.tag)}</p><div class="rich-text mistake-preview">${md(q.question)}</div><p class="filter-note">最近选择：${esc(data.records[q.id].selected.join('、'))} · 累计作答 ${data.records[q.id].attempts} 次${q.kind === 'review' ? ' · 当前已标记为核对题' : ''}</p><button type="button" class="study-secondary" data-retry-id="${q.id}">重新作答</button></article>`).join('')}</div>
        ${ids.length && !response.items.length ? '<p>本页题目可能已从题库移除。</p>' : ''}
        ${ids.length > 20 ? `<div class="inline-actions">${button('上一页', 'mistakes-prev', true, mistakePage === 0)}<span>${mistakePage + 1} / ${Math.ceil(ids.length / 20)}</span>${button('下一页', 'mistakes-next', true, (mistakePage + 1) * 20 >= ids.length)}</div>` : ''}`;
      // 不覆盖分页边界的禁用状态。
      if (busy || loadingCatalog) $('#mistakesPane').querySelectorAll('button').forEach(el => { el.disabled = true; });
    } catch (error) { if (serial === mistakeSerial) panelError('#mistakesPane', error, 'retry-mistake-list'); }
  }
  function changedFilters() {
    mistakePage = 0; renderTags(); scope(); save();
    if (view === 'learn') renderReader();
    if (view === 'mistakes') renderMistakes();
  }

  $('#studyFilters').open = !mobile.matches;
  mobile.addEventListener('change', e => { $('#studyFilters').open = !e.matches; });
  $('#studyCategory').value = data.filters.category;
  $('#studyOrder').value = data.filters.order;
  $('#studyCategory').addEventListener('change', () => {
    data.filters.category = $('#studyCategory').value; data.filters.topic = ''; data.filters.tag = '';
    $('#tagSearch').value = ''; mistakePage = 0; readerSerial++; mistakeSerial++;
    loadCatalog();
  });
  $('#studyTopic').addEventListener('change', () => { data.filters.topic = $('#studyTopic').value; data.filters.tag = ''; $('#tagSearch').value = ''; changedFilters(); });
  $('#studyTag').addEventListener('change', () => { data.filters.tag = $('#studyTag').value; changedFilters(); });
  $('#tagSearch').addEventListener('input', renderTags);
  $('#studyOrder').addEventListener('change', () => { data.filters.order = $('#studyOrder').value; save(); });
  $('#startPractice').addEventListener('click', () => start());
  $('#reloadStudy').addEventListener('click', loadCatalog);
  $('#continueSession').addEventListener('click', () => { setWorkspaceView('practice'); if (mobile.matches) $('#studyFilters').open = false; loadQuestion(); focusQuestion(); });
  document.addEventListener('workspacechange', event => {
    view = event.detail;
    if (view === 'learn' && !loadingCatalog) renderReader();
    if (view === 'mistakes' && !loadingCatalog) renderMistakes();
  });
  $('#practicePane').addEventListener('change', event => {
    if (event.target.name !== 'practiceAnswer' || !current || result || busy) return;
    const selected = [...$('#practicePane').querySelectorAll('input[name="practiceAnswer"]:checked')].map(input => input.value);
    data.session.drafts[current.id] = selected;
    $('#answerStatus').textContent = selected.length ? `已选：${selected.join('、')}` : '尚未选择';
    $('#practicePane').querySelector('[data-action="submit"]').disabled = !selected.length;
    $('#practicePane').querySelectorAll('.practice-option').forEach(label => label.classList.toggle('selected', label.querySelector('input').checked));
    save();
  });
  $('#studyView').addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target || target.disabled || busy) return;
    if (target.dataset.topic) { openTopic(target.dataset.topic, target.dataset.category); return; }
    if (target.dataset.retryId) { start('mistakes', target.dataset.retryId); return; }
    switch (target.dataset.action) {
      case 'start': start(); break;
      case 'filters': $('#studyFilters').open = true; $('#studyCategory').focus(); break;
      case 'submit': submit(); break;
      case 'previous': navigate(-1); break;
      case 'next': navigate(1); break;
      case 'retry-question': loadQuestion(); break;
      case 'retry-reader': renderReader(); break;
      case 'topic-list': data.filters.topic = ''; data.filters.tag = ''; $('#studyTopic').value = ''; changedFilters(); break;
      case 'show-mistakes': setWorkspaceView('mistakes'); break;
      case 'show-practice': setWorkspaceView('practice'); break;
      case 'retry-mistakes': start('mistakes'); break;
      case 'retry-mistake-list': renderMistakes(); break;
      case 'mistakes-prev': mistakePage--; renderMistakes(); break;
      case 'mistakes-next': mistakePage++; renderMistakes(); break;
      case 'resume-pending': {
        const s = data.session;
        s.index = Math.max(0, s.ids.findIndex(id => !s.responses[id])); s.finished = false; save(); loadQuestion(); focusQuestion(); break;
      }
    }
  });
  stats(); loadCatalog();
})();
