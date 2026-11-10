'use strict';

// 学科登记表：新增题库时在这里加一行即可，构建、服务端与前端目录共用这份配置。
// source 为 sources/ 下的 Excel 文件名，guide 为根目录的知识点总结（没有则为 null）。
const SUBJECTS = [
  { id: 'java', label: 'Java', source: 'java题目.xls', guide: 'Java-tag知识点总结.md' },
  { id: 'linux', label: 'Linux', source: 'Linux题目..xls', guide: 'Linux-tag知识点总结.md' },
  { id: 'sql', label: 'SQL', source: 'sql题目..xls', guide: 'SQL-tag知识点总结.md' },
  { id: 'ai', label: 'AI', source: 'ai.xls', guide: null },

  { id: 'html', label: 'HTML', source: 'html.xls', guide: null },
  { id: 'vue', label: 'Vue', source: 'vue.xls', guide: null },
  { id: 'ux', label: 'UX', source: 'UX.xls', guide: null },
  { id: 'shell', label: 'Shell', source: 'shell.xls', guide: null },

  { id: 'network', label: '网络', source: '网络.xls', guide: null },
  { id: 'security', label: '安全技术', source: '安全技术.xls', guide: null },
  { id: 'server', label: '服务器管理', source: '服务器管理.xls', guide: null },
  { id: 'datacenter', label: '机房管理', source: '机房管理.xls', guide: null },
  { id: 'database', label: '数据库管理', source: '数据库管理.xls', guide: null },
  { id: 'vcs', label: '版本控制', source: '版本控制.xls', guide: null },
  { id: 'scm', label: '软件配置管理', source: '软件配置管理.xls', guide: null },

  { id: 'testing', label: '软件测评', source: '软件测评.xls', guide: null },
  { id: 'business', label: '业务测试', source: '业务测试.xls', guide: null },

  { id: 'product', label: '产品经理', source: '产品经理.xls', guide: null },
  { id: 'requirement', label: '需求管理', source: '需求管理.xls', guide: null },
  { id: 'project', label: '项目与质量管理', source: '项目与质量管理.xls', guide: null },
  { id: 'risk', label: '风险传导', source: '风险传导.xls', guide: null },
];

const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));

module.exports = { SUBJECTS, SUBJECT_IDS };
