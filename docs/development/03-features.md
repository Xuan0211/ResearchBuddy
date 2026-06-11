---
title: 功能模块说明
---

# ResearchBuddy 功能模块说明

> 本文档供开发者和 AI Agent 参考，描述每个功能模块的核心机制和设计约定。

---

## 项目与认证

每个 **Project** 是独立的研究工作空间，底层是一个裸 git 仓库（`backend/projects/<uuid>.git`）。

**角色**：`admin`（可删除项目）、`member`（可编辑）、`viewer`（只读）

**认证**：邮箱 + 密码，或 `rb_` 前缀 API Key（可在 Settings 生成）。git clone/push 也用同样的认证。

---

## 📄 Papers（论文管理）

**存储格式**：`papers/notes/<citation-key>.md`，YAML frontmatter 包含所有元数据。

**BibTeX 同步**：
- 每次增加/修改论文后，系统自动调用 `rebuild_papers_bib_files()` 重建 `papers/bib/references.read_only.bib`
- 该文件由 Papers 模块完全托管，**不要手动编辑**
- Papers 页面的 BibTeX Sync 状态栏实时显示条目数，支持 View / Rebuild

**Zotero 集成**：
- 每个项目可绑定不同的 Zotero 个人库或 Group 库
- 同步时写入 `papers/notes/`，并自动重建 bib 文件
- 支持 Better BibTeX citation key（从 `extra` 字段读取 `Citation Key:` 行）

**frontmatter 关键字段**：
```yaml
id: smithetal2023        # citation key，同时是文件名
title: "Paper Title"
authors: ["Smith, John"]
year: 2023
venue: "CHI"
arxiv_id: "2301.00000"
zotero_key: "ABCD1234"
bib_key: "smithetal2023" # Better BibTeX key（若有）
links:
  arxiv: "https://..."
  zotero_local: "zotero://..."
  url: ""
tags: ["hci", "ai"]
```

---

## 📝 Docs（文档）

**存储格式**：`document/docs/<uuid>.md`，YAML frontmatter + Tiptap 导出的 Markdown 内容。

**多标签页**：frontmatter `tabs[]` 数组，每个 tab 有 `id/title/content`。

**引用语法**：`[[paper_id]]` 在编辑器中渲染为可悬停的论文卡片。

**Google Drive 同步**：每个文档可绑定一个 Drive 文档 ID，支持 push/pull/smart-sync。

---

## 📅 Meetings（会议记录）

**存储格式**：`meetings/mygdocs/<uuid>.md`，YAML frontmatter 包含日期、时间、参与者、地点等。

**三栏结构**（frontmatter `tabs[]`）：
- `Pre-meeting` — 议程/准备
- `Transcript / Notes` — 会议记录
- `Post-meeting` — 结论/TODO

**MTG Log**：Drive 上的主索引文档，包含所有会议的日期、标题和链接。

---

## ✍️ Writing（论文写作）

**路径**：`writing/Project/<project-name>/`

**两层引用体系**：
- `bibs/references.read_only.bib` — 从 `papers/bib/references.read_only.bib` 同步，Agent 只读
- `bibs/ai_generated.bib` — Agent 可写入，使用 `\aicite{key}` 引用（PDF 中以彩色渲染）

**Agent 约束**：
- 只能写 `sections/*.tex` 和 `bibs/ai_generated.bib`
- 不能修改 `main.tex` 结构部分、`bibs/references.read_only.bib`
- 添加注释时标注 `> [AI note — YYYY-MM-DD]: ...`

---

## 🧪 Coding（质性编码）

**路径**：`coding/Project/<project-name>/`

**核心实体**：Codebook（编码本）、Code（编码条目）、Excerpt（摘录）、Transcript（逐字稿）

**数据存储**：编码数据存在 SQLite（`CodebookProject`, `Code`, `Excerpt`, `Transcript`），不在 git 仓库。

---

## 💡 Skills（技能库）

**路径**：`skills/` 或 `skills/<subfolder>/`

**格式**：每个技能是一个 `.md` 文件（或包含 `SKILL.md` 的目录），YAML frontmatter 包含 `title/tags/sections`。

**sections**：技能可附加到指定模块（papers/meetings/docs/writing/coding），附加后在对应模块的 ModuleResourcesPanel 中显示。

---

## 🛠 Workspace（工作区）

**目录结构**（v2，由 `ensure_workspace` 初始化）：
```
papers/notes/           论文笔记 (.md)
papers/bib/             BibTeX 文件（系统维护，勿手动编辑）
papers/images/          论文相关图片
document/docs/          文档 (.md)
meetings/mygdocs/       会议记录 (.md)
writing/Project/        写作项目
coding/Project/         编码项目
images/                 设计资产、图片
prototype/              原型代码
skills/                 技能库 (.md)
.researchbuddy/         系统目录（workspace.json, index.json）
project_info/           项目信息（contacts.json）
```

**Agent 接入**：
- Clone: `git clone https://research.arklab-hkustgz.com/git/<project-id>`
- 用邮箱 + 密码，或 API Key 作为密码认证
- Push 后 UI 实时更新
- `papers/bib/references.read_only.bib` 和 `meetings/manifest.read_only.json` 等 `*.read_only.*` 文件由系统维护，Agent 不应修改

---

## 🔗 Google Drive 集成

| 功能 | 说明 |
|---|---|
| 文档同步 | Docs → Google Docs（含多标签页） |
| 会议同步 | Meetings → Google Docs |
| 论文笔记同步 | Paper notes → Drive Markdown 文件 |
| MTG Log | 所有会议的主索引文档 |
| Smart Sync | 自动对比时间戳，智能推送或拉取 |

**注意**：Google Docs 不支持嵌入外部图片，粘贴的截图同步时会替换为 `[📷 alt]` 占位符。

---

## 数据流关系

```
Zotero API
    ↓ sync
papers/notes/*.md  ←→  Papers UI
    ↓ rebuild_papers_bib_files()
papers/bib/references.read_only.bib
    ↓ sync_bibs_from_papers.sh
writing/Project/*/bibs/references.read_only.bib
```
