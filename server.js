const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3456;
const DATA_FILE = path.join(__dirname, 'data', 'questions.json');

let questions = [];
let stats = { total: 0, java: 0, linux: 0, sql: 0 };

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('未找到 data/questions.json，请先运行: npm run build');
    process.exit(1);
  }
  questions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
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
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stats', (_req, res) => {
  res.json(stats);
});

app.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  const category = req.query.category || 'all';
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  res.json(searchQuestions({ q, category, page, limit }));
});

app.get('/api/question/:id', (req, res) => {
  const item = questions.find((q) => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: '未找到题目' });
  res.json(item);
});

loadData();

app.listen(PORT, () => {
  console.log(`题库服务已启动: http://localhost:${PORT}`);
});
