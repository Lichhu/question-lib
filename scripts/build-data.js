const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { SUBJECTS } = require('../lib/subjects');

const SOURCE_DIR = path.join(__dirname, '..', 'sources');
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'questions.json');

function parseSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => ({
    id: String(row.ID || ''),
    categoryKey: String(row.CATEGORY_KEY || ''),
    question: String(row.QUESTION || ''),
    options: String(row.OPTIONS || ''),
    answer: String(row.ANSWER || ''),
    analysis: String(row.ANALYSIS || ''),
    tag: String(row.TAG || ''),
    questionType: String(row.QUESTION_TYPE || ''),
  }));
}

function main() {
  const all = [];
  const seen = new Map();

  for (const src of SUBJECTS) {
    const filePath = path.join(SOURCE_DIR, src.source);
    if (!fs.existsSync(filePath)) {
      throw new Error(`缺少题库文件: sources/${src.source}（${src.label}）`);
    }
    const items = parseSheet(filePath);
    for (const item of items) {
      if (!item.id) throw new Error(`${src.label} 存在缺少 ID 的题目`);
      const owner = seen.get(item.id);
      if (owner) throw new Error(`题目 ID 重复: ${item.id}（${owner} / ${src.label}）`);
      seen.set(item.id, src.label);
      all.push({ ...item, category: src.id, categoryLabel: src.label });
    }
    console.log(`${src.label}: ${items.length} 题`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all), 'utf8');
  console.log(`\n共 ${all.length} 题，已写入 ${OUT_FILE}`);
}

main();
