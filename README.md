# 题库查询

基于 Excel 题库的本地搜索工具，无需数据库，仅需 Node.js。

## 数据源

- `java题目.xls` — Java 题目
- `Linux题目..xls` — Linux 题目
- `sql题目..xls` — SQL 题目

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 将 Excel 转为 JSON（首次或更新题目后执行）
npm run build

# 3. 启动服务
npm start
```

浏览器打开 **http://localhost:3456**

## 部署到其他电脑

1. 复制整个项目文件夹（含 `.xls` 文件和 `data/questions.json`）
2. 确保目标电脑已安装 Node.js（v16+）
3. 执行：

```bash
npm install
npm start
```

若只带了 `data/questions.json` 而没有 `.xls`，可直接 `npm start`，无需再 build。

## 功能

- 关键词搜索（题目、选项、答案、解析、标签）
- 按 Java / Linux / SQL 分类筛选
- 点击「查看答案」展开正确答案与解析
- 分页浏览

## 自定义端口

```bash
PORT=8080 npm start
```
