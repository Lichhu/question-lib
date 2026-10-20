const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOURCES = [
  { file: 'java题目.xls', category: 'java', label: 'Java' },
  { file: 'Linux题目..xls', category: 'linux', label: 'Linux' },
  { file: 'sql题目..xls', category: 'sql', label: 'SQL' },
  { file: 'ai.xls', category: 'ai', label: 'AI' },
];

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

  for (const src of SOURCES) {
    const filePath = path.join(__dirname, '..', src.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`跳过缺失文件: ${src.file}`);
      continue;
    }
    const items = parseSheet(filePath);
    for (const item of items) {
      all.push({ ...item, category: src.category, categoryLabel: src.label });
    }
    console.log(`${src.label}: ${items.length} 题`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all), 'utf8');
  console.log(`\n共 ${all.length} 题，已写入 ${OUT_FILE}`);
}

main();
