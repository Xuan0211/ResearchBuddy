---
title: 功能介绍
---

# ResearchBuddy 功能介绍

ResearchBuddy 是一个为研究团队设计的协作平台。每个项目是一个真实的 git 仓库，所有内容（论文、文档、会议记录、写作草稿）都以 Markdown 文件存储，对人类和 AI Agent 同样友好。

---

## 项目管理

每个 **Project** 是独立的研究工作空间：

- **创建项目** — 填写项目名即可，自动初始化 git 仓库和标准目录结构
- **团队成员** — 三种角色：`admin`（可删除项目）、`member`（可编辑）、`viewer`（只读）
- **删除项目** — 在项目列表悬停后点击删除图标，需要输入项目名二次确认
- **最后编辑时间** — 项目列表显示 git 最新提交时间（"edited 3h ago"）
- **git 克隆** — 可用 ResearchBuddy 账号密码 clone 项目仓库，push 后内容实时同步到 UI

---

## 🏠 项目主页（Home / 甘特图）

项目时间线和团队全览：

- **甘特图** — 多轨道（Track）时间条，每轨可自定义颜色
- **时间条目** — 设置开始/结束日期、标题、@提及团队成员
- **文档关联** — 每个条目可关联一个文档 ID，点击直接跳转到对应文档
- **今日标记** — 红色竖线标注当前日期
- **团队面板** — 底部显示项目所有成员

---

## 📄 Papers（论文管理）

**导入方式：**
- ArXiv ID 导入（自动抓取元数据和摘要）
- Zotero 同步（连接个人或 Group 库，每小时自动同步）
- 手动上传

**功能：**
- 论文卡片视图（支持预览图、摘要折叠）
- 按年份、venue、标签筛选和分组
- 复制 BibTeX key（`[[paper_id]]` 格式用于在文档中引用）
- 论文笔记 — 每篇论文有 Markdown 笔记编辑器
- 笔记同步到 Google Drive（以 Markdown 文件形式）
- **AI Generated 区** — 展示 Writing 项目中 `ai-generated.bib` 的待确认文献，可一键确认移入 `reference.bib`

**Zotero 配置：**
- 每个项目可绑定不同的 Zotero 库（个人库或 Group 库）
- 支持 Library ID 和 API Key 独立配置

---

## 📅 Meetings（会议记录）

**团队联系人：**
- 维护 `@handle` → 姓名/邮箱 的联系人列表
- 在会议和文档中用 `@handle` 提及成员

**会议设置（⚙ 齿轮图标）：**
- **默认会议室** — 新建会议时自动填充地点
- **固定会议时间** — 设置每周几几点，新建时自动预填下一次日期和时间
- **时长** — 设置默认时长，自动计算结束时间

**会议文档（三栏式）：**
- `Pre-meeting` — 上周回顾 / 本周进展 / 议程
- `Transcript / Notes` — 会议记录和逐字稿
- `Post-meeting` — 结论 / TODO

**额外功能：**
- 导出 `.ics` 日历文件（支持 Outlook）
- 一键生成 Outlook Web 日历事件链接
- AI 自动分析逐字稿 → 提取决策、行动项、开放问题
- 自定义标签页

**Google Drive 同步：**
- 同步单个会议文档到 Drive
- **MTG Log（Sync Log 按钮）** — 在 Drive Meetings 文件夹生成/更新 `MTG_LOG` 主文档，包含所有会议的日期、标题和 Drive 链接表格

---

## 📝 Docs（文档）

Rich Markdown 编辑器，支持多标签页：

**编辑器功能：**
- 富文本 Markdown 编辑（标题、列表、粗斜体、代码块等）
- `[[paper_id]]` 引用论文 — 悬停显示论文信息卡片，点击打开论文详情
- `@handle` 提及团队成员
- **图片粘贴** — Ctrl+V 直接粘贴截图，自动上传并插入 Markdown 图片链接

**多标签页：**
- 一个文档可有多个标签页（如"背景"、"方法"、"结论"）
- 双击标签页标题重命名，可删除非最后一个标签页

**Google Drive 同步：**
- `linked/new` — 更新已关联的 Drive 文档，或新建并关联
- `new doc` — 强制新建 Drive 文档
- `existing link` — 粘贴已有 Drive 文档 URL 并绑定
- **Smart Sync** — 自动对比本地和 Drive 的修改时间，选择推送或拉取
- 打开文档时如果 Drive 版本更新，自动拉取最新内容

**文件夹组织：**
- 文档可设置文件夹（`folder` 字段）
- Drive 同步时保持相同的文件夹层级

---

## ✍️ Writing（论文写作）

为 LaTeX 论文写作设计的工作区：

**项目结构（自动初始化）：**
```
writing/<project-name>/
├── main.tex              # ACM Conference 格式主文件
├── reference.bib         # Zotero 同步的可信文献（AI 只读）
├── ai-generated.bib      # AI 建议的待确认文献
├── sections/
│   └── introduction.tex
├── images/
└── skills/
    ├── paper-writing-core.md
    └── citation-management.md
```

**两层引用体系：**
- `reference.bib` — 由 Zotero 管理，受写保护，使用 `\cite{key}`
- `ai-generated.bib` — AI Agent 可以写入，使用 `\aicite{key}`（PDF 中渲染为彩色）
- 彩色宏：`\newcommand{\aicite}[1]{\textcolor{Dandelion}{\cite{#1}}}` — 注释掉这行即可关闭颜色

**外部链接：**
- 绑定 GitHub 仓库 URL（一键跳转 clone/push 仓库）
- 绑定 Overleaf URL（一键在 Overleaf 预览/编译）

**文件浏览器：**
- 左侧文件树展示所有 `.tex`、`.bib` 文件
- 点击文件查看内容

**AI 写作规则（写在 skills/ 里）：**
- AI 只能写 `sections/*.tex` 和 `ai-generated.bib`
- 修改笔记时必须标注 `> [AI note — YYYY-MM-DD]: ...`
- 不允许修改 `reference.bib` 和 `main.tex` 的结构部分

---

## 🧪 Coding（质性编码）

定性研究的编码工作台：

**Codebook：**
- 创建编码本，添加编码（Code）和层级（父子关系）
- 每个 Code 可设置颜色、标签、自定义字段

**筛选（Screening）：**
- 多阶段筛选流程（Inclusion/Exclusion criteria）
- 每篇论文可设置 included / excluded / pending
- 支持 `all_pass` / `any_pass` 通过逻辑
- 导出筛选结果为 CSV

**摘录（Excerpt）：**
- 从论文中摘取文本片段，关联到某个 Code
- 支持截图/图片上传到摘录
- 多编码员支持（`coder` 字段）

**逐字稿（Transcript）：**
- 上传音视频转录文本
- 对文本片段进行时间段编码

---

## 🛠 Workspace（工作区）

基于 git 的项目文件管理：

- **目录结构** — `papers/`, `docs/`, `meetings/`, `writing/`, `prototypes/`, `assets/`, `team/`, `skills/`
- **文件索引** — `.researchbuddy/index.json` 维护全项目文件清单
- **Ensure** — 初始化/修复目录结构
- **Google Drive 根目录设置** — 为项目绑定 Drive 文件夹（支持新建、使用已有、或默认创建 `ResearchBuddy/<项目名>/`）
- **批量同步** — 一次性把所有文档或所有会议推送到 Drive
- **Zotero 连接** — 在 Workspace 页面配置项目的 Zotero 库

---

## 💡 Skills（技能库）

可复用的 AI Agent 工作流和团队规范：

- 每个项目 `skills/` 目录存放 Markdown 格式的技能文件
- 支持 YAML frontmatter（title、description、tags）
- Section Resources：可以把特定技能附加到特定模块（Papers / Meetings / Docs 等）
- 平台内置技能：
  - `meeting-transcript/` — 会议纪要分析技能
  - `paper-writing-core.md` — 论文写作核心规则
  - `citation-management.md` — 引用管理指南

---

## 🔗 Google Drive 集成

在 Settings 页面连接 Google 账号后可用：

| 功能 | 说明 |
|---|---|
| 文档同步 | Docs → Google Docs（含多标签页） |
| 会议同步 | Meetings → Google Docs |
| 论文笔记同步 | Paper notes → Drive Markdown 文件 |
| MTG Log | 所有会议的主索引文档 |
| Smart Sync | 自动对比时间戳，智能推送或拉取 |
| 批量同步 | 从 Workspace 一次同步所有文档/会议 |

**注意：** Google Docs 不支持嵌入外部图片，粘贴的截图在同步到 Drive 时会替换为 `[📷 alt]` 占位符。

---

## 🔑 认证与安全

- 邮箱 + 密码注册/登录
- JWT Token（7 天有效期）
- **API Key** — 在 Settings 生成，用于 git clone/push（`rb_` 前缀）或 API 调用
- git 认证：用邮箱+密码，或用 `rb_xxx` API Key 作为密码

---

## 🧑‍💻 给 AI Agent 的注意事项

ResearchBuddy 的项目仓库对 Agent 完全可读：

- 用 `git clone https://research.hopeyuanxu.com/git/<project-id>` 拉取内容
- 论文通过 `[[paper_id]]` 跨引用，BibTeX 在论文文件的 frontmatter 中
- `.researchbuddy/index.json` 是全项目的文件索引
- `writing/skills/` 里有平台预置的写作规则，Agent 应优先读取
- 修改内容后 push 到仓库，ResearchBuddy UI 会实时更新
- AI 不能修改 `reference.bib`，只能写 `ai-generated.bib`
