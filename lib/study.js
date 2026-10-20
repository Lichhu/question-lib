const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SUBJECTS = [
  { id: 'java', label: 'Java', file: 'Java-tag知识点总结.md' },
  { id: 'linux', label: 'Linux', file: 'Linux-tag知识点总结.md' },
  { id: 'sql', label: 'SQL', file: 'SQL-tag知识点总结.md' },
  { id: 'ai', label: 'AI', file: 'AI-tag知识点总结.md' },
];

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/)
    .map(cell => cell.trim().replace(/\\\|/g, '|'));
}

function parseGuide(markdown, category) {
  const topics = [];
  const markers = [...markdown.matchAll(/^<a id="([JLS]\d{2})"><\/a>\s*\n## \1 ([^\n]+)/gm)];
  const bodyEnd = markdown.indexOf('## 已确认的题库疑点');
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const end = markers[i + 1]?.index ?? (bodyEnd >= 0 ? bodyEnd : markdown.length);
    topics.push({ id: m[1], title: m[2].trim(), category,
      markdown: markdown.slice(m.index + m[0].length, end).trim() });
  }
  const tags = new Map();
  const index = markdown.split('## 附录 B：')[1] || '';
  for (const line of index.split('\n')) {
    if (!line.startsWith('|')) continue;
    const [tag, count, links] = tableCells(line);
    if (!/^\d+$/.test(count || '') || !links) continue;
    tags.set(tag, [...new Set([...links.matchAll(/\(#([JLS]\d{2})\)/g)].map(m => m[1]))]);
  }
  const issues = new Map();
  const issueSection = (markdown.split('## 已确认的题库疑点与纠偏')[1] || '').split('## 考前自测')[0];
  for (const line of issueSection.split('\n')) {
    if (!line.startsWith('|')) continue;
    const [ids, problem, correction] = tableCells(line);
    if (!/^\d/.test(ids || '')) continue;
    for (const id of ids.match(/\d+/g) || []) issues.set(id, { problem, correction });
  }
  return { topics, tags, issues, introduction: markdown.slice(0, markers[0]?.index ?? 0).trim() };
}

function parseOptions(raw) {
  const choices = [];
  let fenced = false;
  let prefix = '';
  for (const line of String(raw || '').replace(/\r\n?/g, '\n').split('\n')) {
    const match = !fenced && line.match(/^\s*([A-H])(?:[.．、:：)）]\s*|[ \t]+)(.*)$/);
    if (match) choices.push({ key: match[1], text: match[2] });
    else if (choices.length) choices[choices.length - 1].text += `\n${line}`;
    else prefix += line.trim();
    if (/^\s*```/.test(match ? match[2] : line)) fenced = !fenced;
  }
  if (prefix || fenced || choices.length < 2 || choices.some((c, i) => c.key !== String.fromCharCode(65 + i))) return [];
  for (const c of choices) c.text = c.text.trim();
  return choices.every(c => c.text) ? choices : [];
}

function answerKeys(answer) {
  const text = String(answer || '').trim().toUpperCase();
  if (!/^[A-H](?:\s*[,，、;；\s]\s*[A-H])*$/.test(text)) return [];
  const keys = text.match(/[A-H]/g);
  return keys.length === new Set(keys).size ? keys.sort() : [];
}

function profileQuestion(question, issue) {
  const choices = parseOptions(question.options);
  const expected = answerKeys(question.answer);
  const type = question.questionType;
  let reason = '';
  if (issue) reason = '该题在知识点总结中有疑点或纠偏，仅供核对，不计入正确率。';
  else if (!choices.length || !expected.length || expected.some(k => !choices.some(c => c.key === k))) reason = '选项或答案格式异常，仅供核对，不自动判分。';
  else if ((type === '1' || type === '3') && expected.length !== 1) reason = '题型与参考答案不一致，仅供核对。';
  else if (type && !['1', '2', '3'].includes(type)) reason = '暂不支持该题型自动判分。';
  const kind = reason ? 'review' : type === '2' || expected.length > 1 ? 'multiple' : type === '3' ? 'boolean' : 'single';
  return { choices, expected, kind, reason, issue };
}

function gradeQuestion(question, profile, selected) {
  if (!Array.isArray(selected) || selected.some(k => typeof k !== 'string') || selected.length > 8 || new Set(selected).size !== selected.length) {
    throw Object.assign(new Error('答案格式无效，请重新选择。'), { status: 400 });
  }
  if (profile.kind !== 'review') {
    if (!selected.length || selected.some(k => !profile.choices.some(c => c.key === k)) || (profile.kind !== 'multiple' && selected.length !== 1)) {
      throw Object.assign(new Error('请选择有效答案；单选题只能选择一项。'), { status: 400 });
    }
  } else if (selected.length) {
    throw Object.assign(new Error('核对题不接受自动判分。'), { status: 400 });
  }
  return {
    correct: profile.kind === 'review' ? null : [...selected].sort().join(',') === profile.expected.join(','),
    selected, expected: profile.expected, answer: question.answer, analysis: question.analysis,
    issue: profile.issue || null, reason: profile.reason,
  };
}

function createStudy(questions, root) {
  const docs = SUBJECTS.map(s => {
    const file = path.join(root, s.file);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return { ...s, source, guide: parseGuide(source, s.id) };
  });
  const revision = createHash('sha256').update(JSON.stringify(questions)).update(docs.map(d => d.source).join('\n')).digest('hex').slice(0, 16);
  const topics = new Map(docs.flatMap(d => d.guide.topics.map(t => [t.id, { ...t, count: 0 }])));
  const entries = new Map();
  for (const q of questions) {
    const doc = docs.find(d => d.id === q.category);
    const topicIds = (doc?.guide.tags.get(q.tag) || []).filter(id => topics.has(id));
    for (const id of topicIds) topics.get(id).count++;
    entries.set(q.id, { question: q, topics: topicIds, profile: profileQuestion(q, doc?.guide.issues.get(q.id)) });
  }
  function publicQuestion(entry) {
    const q = entry.question;
    return { id: q.id, category: q.category, categoryLabel: q.categoryLabel, question: q.question,
      tag: q.tag, topics: entry.topics, choices: entry.profile.choices,
      kind: entry.profile.kind, warning: entry.profile.reason,
      rawOptions: entry.profile.choices.length ? '' : q.options, revision };
  }
  function filter({ category, topic, tag }) {
    if (!SUBJECTS.some(s => s.id === category)) throw Object.assign(new Error('请选择有效学科。'), { status: 400 });
    if (topic && topics.get(topic)?.category !== category) throw Object.assign(new Error('专题不属于当前学科。'), { status: 400 });
    return [...entries.values()].filter(e => e.question.category === category && (!topic || e.topics.includes(topic)) && (!tag || e.question.tag === tag));
  }
  return {
    revision, entries, topics, publicQuestion, filter,
    catalog(category) {
      const doc = docs.find(d => d.id === category);
      if (!doc) throw Object.assign(new Error('学科不存在。'), { status: 400 });
      const counts = new Map();
      for (const e of filter({ category })) {
        const tag = e.question.tag;
        if (!counts.has(tag)) counts.set(tag, { tag, count: 0, topics: e.topics });
        counts.get(tag).count++;
      }
      return { revision, category, subjects: SUBJECTS.map(s => ({ id: s.id, label: s.label, count: questions.filter(q => q.category === s.id).length })),
        topics: [...topics.values()].filter(t => t.category === category).map(({ markdown, ...t }) => t),
        tags: [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'zh-CN')),
        introduction: doc.guide.introduction,
        guideAvailable: Boolean(doc.guide.topics.length),
        mappingNote: '专题依据原始 tag 对照关联，同一 tag 的题目可能属于多个专题；这里展示关联题量，不代表逐题审定。' };
    },
  };
}

module.exports = { createStudy, parseGuide, parseOptions, answerKeys, profileQuestion, gradeQuestion };
