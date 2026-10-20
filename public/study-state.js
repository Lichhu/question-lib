(function (root) {
  'use strict';
  const KEY = 'question-lib.study.v1';
  const idValid = id => typeof id === 'string' && /^\d+$/.test(id);
  const selectionValid = a => Array.isArray(a) && a.length <= 8 && a.every(k => /^[A-H]$/.test(k));
  const filtersValid = f => f && ['java', 'linux', 'sql', 'ai'].includes(f.category) && typeof f.topic === 'string' && typeof f.tag === 'string' && ['sequential', 'random'].includes(f.order);
  const defaults = () => ({ version: 1, records: {}, session: null, filters: { category: 'java', topic: '', tag: '', order: 'sequential' } });

  function restore(raw) {
    if (!raw) return defaults();
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !value.records || typeof value.records !== 'object' || Array.isArray(value.records)) throw new Error('学习记录格式无效');
    const data = defaults();
    for (const [id, r] of Object.entries(value.records)) {
      if (!idValid(id) || !r || !Number.isSafeInteger(r.attempts) || r.attempts < 1 || !Number.isSafeInteger(r.correctAttempts) || r.correctAttempts < 0 || r.correctAttempts > r.attempts || typeof r.lastCorrect !== 'boolean' || !selectionValid(r.selected) || !['java', 'linux', 'sql', 'ai'].includes(r.category) || typeof r.tag !== 'string' || typeof r.lastAt !== 'number') throw new Error('作答记录损坏');
      data.records[id] = r;
    }
    if (filtersValid(value.filters)) data.filters = value.filters;
    const s = value.session;
    if (s) {
      if (!Array.isArray(s.ids) || !s.ids.length || s.ids.length > 20000 || !s.ids.every(idValid) || new Set(s.ids).size !== s.ids.length || !Number.isInteger(s.index) || s.index < 0 || s.index >= s.ids.length || typeof s.revision !== 'string' || !filtersValid(s.filters) || !s.responses || !s.drafts || typeof s.responses !== 'object' || typeof s.drafts !== 'object' || Array.isArray(s.responses) || Array.isArray(s.drafts) || (s.finished !== undefined && typeof s.finished !== 'boolean')) throw new Error('练习进度损坏');
      const ids = new Set(s.ids);
      for (const [id, r] of Object.entries(s.responses)) {
        if (!ids.has(id) || !r || !selectionValid(r.selected) || ![true, false, null].includes(r.correct)) throw new Error('答题进度无效');
      }
      for (const [id, draft] of Object.entries(s.drafts)) {
        if (!ids.has(id) || !selectionValid(draft)) throw new Error('待提交答案无效');
      }
      data.session = s;
    }
    return data;
  }

  function start(data, ids, revision, filters, mode = 'practice') {
    if (!ids.length) throw new Error('没有符合条件的题目');
    data.session = { ids: [...ids], index: 0, revision, filters: { ...filters }, mode, responses: {}, drafts: {} };
    data.filters = { ...filters };
  }

  function record(data, question, result, now = Date.now()) {
    const s = data.session;
    if (!s || s.ids[s.index] !== question.id || s.responses[question.id]) return false;
    s.responses[question.id] = { selected: [...result.selected], correct: result.correct };
    delete s.drafts[question.id];
    if (result.correct !== null) {
      const old = data.records[question.id];
      data.records[question.id] = {
        category: question.category, tag: question.tag, attempts: (old?.attempts || 0) + 1,
        correctAttempts: (old?.correctAttempts || 0) + Number(result.correct),
        lastCorrect: result.correct, selected: [...result.selected], lastAt: now,
      };
    }
    return true;
  }

  function metrics(data) {
    const records = Object.values(data.records);
    const attempts = records.reduce((sum, r) => sum + r.attempts, 0);
    const correct = records.reduce((sum, r) => sum + r.correctAttempts, 0);
    return { practiced: records.length, attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : null,
      mistakes: records.filter(r => !r.lastCorrect).length };
  }

  function mistakes(data, filters, catalog) {
    const allowed = new Set(catalog.tags.filter(t => (!filters.topic || t.topics.includes(filters.topic)) && (!filters.tag || t.tag === filters.tag)).map(t => t.tag));
    return Object.entries(data.records).filter(([, r]) => !r.lastCorrect && r.category === filters.category && allowed.has(r.tag))
      .sort((a, b) => b[1].lastAt - a[1].lastAt).map(([id]) => id);
  }

  const api = { KEY, defaults, restore, start, record, metrics, mistakes };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudyState = api;
})(typeof window === 'undefined' ? globalThis : window);
