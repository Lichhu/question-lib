const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { parseOptions, answerKeys, profileQuestion, gradeQuestion } = require('../lib/study');
const S = require('../public/study-state');
const C = require('../public/study-content');
const { app, study } = require('../server');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
const filters = { category: 'java', topic: '', tag: '', order: 'sequential' };
const fixture = { id: '1', category: 'java', tag: '基础', options: 'A. 一\nB. 二\nC. 三', answer: 'A,C', analysis: '解析', questionType: '2' };
async function get(url) { const r = await fetch(base + url); return { status: r.status, body: await r.json(), headers: r.headers }; }
async function post(url, body) {
  const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

test('选项解析保留代码、换行和超过四个选项', () => {
  const options = parseOptions('A.```java\nA.run();\nB.run();\n```\nB 第二项\nC、第三项\nD. 第四项\nE. 第五项\nF. 第六项');
  assert.equal(options.length, 6);
  assert.equal(options[0].text, '```java\nA.run();\nB.run();\n```');
  assert.equal(options[5].key, 'F');
});
test('含重复、缺号或无法识别的选项不猜测', () => {
  for (const raw of ['A. a\nA. b', 'A. a\nC. c', '没有选项', '标题\nA. a\nB. b', 'A. ```\nB. b']) assert.deepEqual(parseOptions(raw), []);
});
test('答案严格解析并去除顺序影响', () => {
  assert.deepEqual(answerKeys('C，A'), ['A', 'C']);
  for (const bad of ['', '答案 A', 'A,A', 'Z', 'ABC']) assert.deepEqual(answerKeys(bad), []);
});
test('多选全对才给分，少选、多选均错误', () => {
  const p = profileQuestion(fixture);
  assert.equal(gradeQuestion(fixture, p, ['C', 'A']).correct, true);
  assert.equal(gradeQuestion(fixture, p, ['A']).correct, false);
  assert.equal(gradeQuestion(fixture, p, ['A', 'B', 'C']).correct, false);
  for (const bad of [[], ['Z'], ['A', 'A'], 'A', [1], null]) assert.throws(() => gradeQuestion(fixture, p, bad));
});
test('单选、判断和缺失题型可用，题型矛盾及疑题仅供核对', () => {
  for (const type of ['1', '3', '']) {
    const q = { ...fixture, answer: 'B', questionType: type };
    const p = profileQuestion(q);
    assert.equal(gradeQuestion(q, p, ['B']).correct, true);
    assert.throws(() => gradeQuestion(q, p, ['A', 'B']));
  }
  assert.equal(profileQuestion({ ...fixture, questionType: '1' }).kind, 'review');
  assert.equal(profileQuestion({ ...fixture, answer: 'F' }).kind, 'review');
  const p = profileQuestion(fixture, { problem: '题目有误', correction: '核对规则' });
  assert.equal(gradeQuestion(fixture, p, []).correct, null);
  assert.throws(() => gradeQuestion(fixture, p, ['A']));
});
test('全部题目都有专题入口，91 个专题及三科题量完整', () => {
  assert.equal(study.topics.size, 91);
  const entries = [...study.entries.values()];
  assert.equal(entries.length, 13347);
  assert.equal(new Set(entries.map(e => e.question.id)).size, entries.length);
  for (const e of entries) {
    // AI 暂无知识点总结文件，按设计没有专题入口，只核对判分。
    if (e.question.category !== 'ai') assert.ok(e.topics.length, e.question.id);
    if (e.profile.kind !== 'review') assert.equal(gradeQuestion(e.question, e.profile, e.profile.expected).correct, true);
  }
  for (const [category, count, tags] of [['java', 7584, 2733], ['linux', 2008, 690], ['sql', 3338, 1072]]) {
    const c = study.catalog(category);
    assert.equal(c.tags.length, tags);
    assert.equal(c.tags.reduce((sum, t) => sum + t.count, 0), count);
    for (const t of c.topics) assert.equal(study.filter({ category, topic: t.id }).length, t.count);
  }
});
test('摘要纠偏题不自动判分，正文不会包含附录', () => {
  for (const id of ['124864', '126090', '10263', '116535', '117026']) {
    assert.equal(study.entries.get(id).profile.kind, 'review');
    assert.ok(study.entries.get(id).profile.issue.correction);
  }
  for (const topic of study.topics.values()) {
    assert.ok(topic.markdown.length > 50);
    assert.ok(!topic.markdown.includes('## 附录'));
    assert.ok(!topic.markdown.includes('<a id='));
  }
});
test('重复提交和刷新恢复不会重复计数，错题重练正确后移出', () => {
  const data = S.defaults();
  S.start(data, ['1', '2'], 'revision', filters);
  data.session.drafts['1'] = ['B'];
  let restored = S.restore(JSON.stringify(data));
  assert.deepEqual(restored.session.drafts['1'], ['B']);
  const wrong = { selected: ['B'], correct: false };
  assert.equal(S.record(restored, fixture, wrong, 123), true);
  assert.equal(S.record(restored, fixture, wrong, 124), false);
  restored = S.restore(JSON.stringify(restored));
  assert.equal(S.record(restored, fixture, wrong), false);
  assert.equal(S.metrics(restored).mistakes, 1);
  S.start(restored, ['1'], 'revision', filters, 'mistakes');
  assert.equal(S.record(restored, fixture, { selected: ['C', 'A'], correct: true }), true);
  assert.deepEqual(S.metrics(restored), { practiced: 1, attempts: 2, correct: 1, accuracy: 50, mistakes: 0 });
});
test('核对题不污染统计，非当前题的迟到响应不记录', () => {
  const data = S.defaults();
  S.start(data, ['1', '2'], 'r', filters);
  assert.equal(S.record(data, { ...fixture, id: '2' }, { correct: false, selected: ['B'] }), false);
  S.record(data, fixture, { correct: null, selected: [] });
  assert.equal(S.metrics(data).attempts, 0);
  assert.equal(Object.keys(data.session.responses).length, 1);
});
test('随机顺序、位置和已答状态可序列化恢复', () => {
  const data = S.defaults();
  S.start(data, ['3', '1', '2'], 'r', { ...filters, order: 'random' });
  data.session.index = 1;
  data.session.finished = true;
  const restored = S.restore(JSON.stringify(data));
  assert.deepEqual(restored.session.ids, ['3', '1', '2']);
  assert.equal(restored.session.index, 1);
  assert.equal(restored.session.finished, true);
});
test('损坏或未知版本的本地记录被拒绝', () => {
  for (const value of ['{', '{}', '{"version":2}', '{"version":1,"records":[]}']) assert.throws(() => S.restore(value));
  const data = S.defaults();
  S.start(data, ['1'], 'r', filters);
  data.session.index = 50;
  assert.throws(() => S.restore(JSON.stringify(data)));
});
test('错题按当前学科、专题及精确 tag 过滤', () => {
  const data = S.defaults();
  S.start(data, ['1'], 'r', filters);
  S.record(data, fixture, { selected: ['B'], correct: false });
  const catalog = { tags: [{ tag: '基础', topics: ['J01'] }] };
  assert.deepEqual(S.mistakes(data, { ...filters, topic: 'J01' }, catalog), ['1']);
  assert.deepEqual(S.mistakes(data, { ...filters, topic: 'J02' }, catalog), []);
  assert.deepEqual(S.mistakes(data, { ...filters, category: 'sql' }, catalog), []);
});
test('Markdown 输出转义原始 HTML，代码原样保留，表格可横向滚动', () => {
  const html = C.markdown('<img src=x onerror=alert(1)>\n\n```java\nString x = "`a`";\n<script>alert(1)</script>\n```\n\n| 名称 | 说明 |\n|---|---|\n| `a|b` | **加粗** |');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('String x = &quot;`a`&quot;;'));
  assert.ok(html.includes('class="table-scroll"'));
  assert.ok(html.includes('<strong>加粗</strong>'));
  assert.deepEqual(C.cells('| `a|b` | c\\|d |'), ['`a|b`', 'c|d']);
});
test('刷题接口提交前不返回答案、解析和纠偏内容', async () => {
  const { status, body, headers } = await get('/api/practice/question/124864');
  assert.equal(status, 200);
  assert.equal(body.kind, 'review');
  for (const key of ['answer', 'analysis', 'expected', 'issue']) assert.ok(!(key in body));
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal((await get('/api/practice/question/not-found')).status, 404);
});
test('接口判分及非法请求、过期版本保护', async () => {
  const entry = [...study.entries.values()].find(e => e.profile.kind === 'multiple');
  const url = `/api/practice/grade/${entry.question.id}`;
  assert.equal((await post(url, { selected: entry.profile.expected, revision: study.revision })).body.correct, true);
  assert.equal((await post(url, { selected: [], revision: study.revision })).status, 400);
  assert.equal((await post(url, { selected: entry.profile.expected, revision: 'stale' })).status, 409);
  const review = await post('/api/practice/grade/124864', { selected: [], revision: study.revision });
  assert.equal(review.body.correct, null);
  assert.ok(review.body.issue);
  assert.equal((await post('/api/practice/items', { ids: Array(101).fill('1') })).status, 400);
  const bad = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
});
test('顺序、随机队列不重复、不遗漏，范围正确且没有答案', async () => {
  const one = (await get('/api/practice/queue?category=linux')).body;
  const two = (await get('/api/practice/queue?category=linux&order=random')).body;
  assert.equal(one.total, 2008);
  assert.equal(new Set(two.ids).size, one.total);
  assert.deepEqual([...two.ids].sort(), [...one.ids].sort());
  const c = study.catalog('sql');
  const tag = c.tags[0].tag;
  const specific = (await get(`/api/practice/queue?${new URLSearchParams({ category: 'sql', tag })}`)).body;
  assert.ok(specific.ids.every(id => study.entries.get(id).question.tag === tag));
  assert.equal((await get('/api/practice/queue?category=java&topic=S01')).status, 400);
  assert.equal((await get('/api/practice/queue?category=java&tag=不存在')).body.total, 0);
});
test('原有搜索、分类、分页和健康检查继续可用', async () => {
  const s = (await get('/api/stats')).body;
  assert.equal(s.total, 13347);
  assert.equal((await get('/api/health')).body.status, 'ok');
  const list = (await get('/api/search?category=sql&q=SELECT&page=1&limit=5')).body;
  assert.equal(list.items.length, 5);
  assert.ok(list.items.every(q => q.category === 'sql'));
  const safe = (await get('/api/search?limit=-3&page=-1&q[]=x')).body;
  assert.equal(safe.limit, 20);
  assert.equal(safe.page, 1);
  assert.equal((await get('/api/question/10386')).body.answer, 'B');
});
test('页面与本地资源可访问，H5 有视口设置且不依赖外部 CDN', async () => {
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('viewport-fit=cover'));
  assert.ok(!html.includes('页面初版'));
  assert.ok(!html.includes('https://'));
  for (const file of ['/app.js', '/style.css', '/study.js', '/study-state.js', '/study-content.js']) assert.equal((await fetch(base + file)).status, 200);
  assert.equal((await fetch(base + '/data/questions.json')).status, 404);
});
