const fs = require('fs');
const path = require('path');
const express = require('express');
const { createStudy, gradeQuestion } = require('./lib/study');

const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data', 'questions.json');

let questions = [];
let study;
let stats = { total: 0, java: 0, linux: 0, sql: 0 };

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('未找到 data/questions.json，请先运行: npm run build');
    process.exit(1);
  }
  questions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  study = createStudy(questions, __dirname);
  stats = {
    total: questions.length,
    java: questions.filter((q) => q.category === 'java').length,
    linux: questions.filter((q) => q.category === 'linux').length,
    sql: questions.filter((q) => q.category === 'sql').length,
  };
  console.log(`已加载 ${stats.total} 题 (Java ${stats.java} / Linux ${stats.linux} / SQL ${stats.sql})`);
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchText(q) {
  return normalize([q.question, q.options, q.answer, q.analysis, q.tag].join(' '));
}

function searchQuestions({ q = '', category = 'all', page = 1, limit = 20 }) {
  const keywords = normalize(q)
    .split(' ')
    .filter(Boolean);

  let filtered = questions;

  if (category && category !== 'all') {
    filtered = filtered.filter((item) => item.category === category);
  }

  if (keywords.length > 0) {
    filtered = filtered.filter((item) => {
      const text = buildSearchText(item);
      return keywords.every((kw) => text.includes(kw));
    });
  }

  const total = filtered.length;
  const start = (Math.max(1, page) - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return { total, page: Math.max(1, page), limit, items };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function scalar(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberParam(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

app.get('/api/stats', (_req, res) => {
  res.json(stats);
});

app.get('/api/search', (req, res) => {
  const q = scalar(req.query.q);
  const category = scalar(req.query.category, 'all');
  const page = numberParam(req.query.page, 1);
  const limit = numberParam(req.query.limit, 20, 100);

  res.json(searchQuestions({ q, category, page, limit }));
});

app.get('/api/question/:id', (req, res) => {
  const item = questions.find((q) => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: '未找到题目' });
  res.json(item);
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', total: stats.total }));

app.get('/api/study/catalog', (req, res) => {
  res.json(study.catalog(scalar(req.query.category, 'java')));
});

app.get('/api/study/topic/:id', (req, res) => {
  const topic = study.topics.get(req.params.id);
  if (!topic) return res.status(404).json({ error: '未找到专题。' });
  res.json(topic);
});

app.get('/api/practice/queue', (req, res) => {
  const filters = { category: scalar(req.query.category, 'java'), topic: scalar(req.query.topic), tag: scalar(req.query.tag) };
  const order = scalar(req.query.order, 'sequential');
  if (!['sequential', 'random'].includes(order)) return res.status(400).json({ error: '出题顺序无效。' });
  const entries = study.filter(filters);
  const ids = entries.map(e => e.question.id);
  if (order === 'random') {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  res.json({ ids, total: ids.length, revision: study.revision,
    reviewOnly: entries.filter(e => e.profile.kind === 'review').length });
});

app.get('/api/practice/question/:id', (req, res) => {
  const entry = study.entries.get(req.params.id);
  if (!entry) return res.status(404).json({ error: '未找到题目，请重新开始练习。' });
  res.json(study.publicQuestion(entry));
});

app.post('/api/practice/grade/:id', (req, res) => {
  const entry = study.entries.get(req.params.id);
  if (!entry) return res.status(404).json({ error: '未找到题目。' });
  if (req.body?.revision !== study.revision) return res.status(409).json({ error: '题库已更新，请重新开始练习。' });
  res.json(gradeQuestion(entry.question, entry.profile, req.body?.selected));
});

app.post('/api/practice/items', (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: '每次最多读取 100 道题。' });
  }
  res.json({ items: [...new Set(ids)].flatMap(id => {
    const e = study.entries.get(id);
    return e ? [{ id, category: e.question.category, tag: e.question.tag, question: e.question.question, kind: e.profile.kind }] : [];
  }) });
});

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? '服务暂不可用，请稍后重试。' : error.type === 'entity.parse.failed' ? '请求内容不是有效 JSON。' : error.message });
});

loadData();

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`题库服务已启动: http://localhost:${PORT}（监听 ${HOST}）`);
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}

module.exports = { app, study, searchQuestions };
