---
title: 架构文档
---

# ResearchBuddy — 架构

## 总体架构

```
Browser / Electron / Claude Code / any editor
         │
         │  HTTPS  │  git HTTP Smart Protocol
         ▼
    ┌─────────────────────────────────────┐
    │           FastAPI (Python)           │
    │                                      │
    │  /auth  /projects  /papers           │
    │  /docs  /meetings  /git/*            │
    └──────┬──────────────────────┬────────┘
           │                      │
       SQLite                 /projects/
    (users, projects,         {project_id}.git/   ← bare git repos
     members, images)         papers/notes/*.md
                              meetings/*.md
                              document/docs/*.md
```

**两个进程，零外部依赖：** FastAPI + Next.js。SQLite 管用户/权限，git 管内容。

---

## 技术选型

| 层 | 选择 |
|----|------|
| 后端框架 | FastAPI (Python 3.11) |
| 数据库 | SQLite via SQLModel |
| Git 操作 | GitPython |
| 定时任务 | APScheduler（内嵌，无需 Celery） |
| 图片存储 | 服务端本地文件系统 |
| 前端框架 | Next.js 14 (App Router) |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 富文本编辑器 | Tiptap (Notion-style) |
| 部署 | Docker Compose + nginx |

---

## 代码结构

```
ResearchBuddy/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── auth.py         # 注册、登录、API Key
│   │   │   ├── projects.py     # Project CRUD + Zotero 配置
│   │   │   ├── papers.py       # 论文管理 + BibTeX 生成
│   │   │   ├── documents.py    # 文档编辑
│   │   │   ├── meetings.py     # 会议记录
│   │   │   ├── workspace.py    # git workspace + 文件树
│   │   │   ├── skills.py       # 技能库
│   │   │   └── git.py          # HTTP Smart Protocol 代理
│   │   ├── services/
│   │   │   ├── project_fs.py   # git 仓库读写（project_worktree context manager）
│   │   │   ├── zotero.py       # Zotero API 同步
│   │   │   ├── paper_bib.py    # BibTeX 生成与重建
│   │   │   ├── workspace.py    # workspace 初始化 + README 模板
│   │   │   ├── google_drive.py # Drive 集成
│   │   │   └── frontmatter.py  # YAML frontmatter 读写
│   │   ├── core/
│   │   │   ├── config.py       # Settings（从环境变量读取）
│   │   │   ├── db.py           # SQLite 初始化
│   │   │   ├── paths.py        # ⭐ 项目仓库内所有路径常量
│   │   │   └── security.py     # JWT + password hash
│   │   └── models.py           # SQLModel 数据模型
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── (app)/projects/[id]/  各功能模块页面
│   │   ├── (auth)/               登录/注册
│   │   ├── help/                 平台文档（渲染 docs/*.md）
│   │   └── share/docs/[token]/   共享文档只读视图
│   ├── components/
│   │   ├── editor/NotionEditor.tsx  Tiptap 富文本编辑器
│   │   └── ModuleResourcesPanel.tsx  技能快捷面板
│   └── lib/
│       ├── api.ts                API 客户端
│       └── types.ts              TypeScript 类型定义
│
├── nginx/
├── project-template/             # 新项目的初始文件
└── docs/                         # 开发文档（本目录）
```

---

## 关键 API

```
# Auth
POST /api/auth/register
POST /api/auth/login
POST /api/auth/api-keys

# Projects
GET/POST      /api/projects
GET/DELETE    /api/projects/{id}
POST          /api/projects/{id}/members

# Papers
GET/POST      /api/projects/{id}/papers
GET/PATCH     /api/projects/{id}/papers/{paperId}
POST          /api/projects/{id}/papers/{paperId}/image

# Meetings
GET/POST      /api/projects/{id}/meetings
GET/PATCH     /api/projects/{id}/meetings/{mtgId}
GET           /api/projects/{id}/meetings/{mtgId}/ics

# Documents
GET/POST      /api/projects/{id}/docs
GET/PATCH     /api/projects/{id}/docs/{docId}
GET           /api/projects/{id}/docs/{docId}/context   # AI 用，含引用论文元数据

# Zotero
POST          /api/projects/{id}/zotero/config
POST          /api/projects/{id}/zotero/sync

# Git HTTP Smart Protocol
GET/POST      /git/{projectId}/...
```

后端启动后访问 `http://localhost:8000/docs` 查看完整 API 文档（FastAPI 自动生成）。

---

## Project Workspace 文件结构

每个 Project 的 git 仓库遵循 v2 标准结构，由 `ensure_workspace` 初始化：

```
README.md                   项目总览（Agent 入口）
papers/notes/               论文笔记（.md，含 BibTeX frontmatter）
papers/bib/                 BibTeX（系统维护，勿手动编辑）
papers/images/              论文相关图片
document/docs/              项目文档（.md）
meetings/mygdocs/           会议记录（.md）
meetings/resources/         会议资产（transcript、附件等）
writing/Project/            LaTeX 写作项目
coding/Project/             质性编码项目
images/                     图片资产
prototype/                  原型代码和实验
skills/                     AI Agent 技能库
.researchbuddy/             系统元数据（index.json, workspace.json）
project_info/               项目信息（contacts.json）
```

每个目录都有 `README.md`，说明该目录的文件格式和操作约定。`*.read_only.*` 文件由系统自动维护，**不应手动修改**。

### 文件格式

Markdown + YAML frontmatter 是所有内容的标准格式：

```markdown
---
id: smith2024
title: "Paper Title"
authors: ["Smith, John"]
year: 2024
tags: [hci, ai]
---

Notes can cite [[other-paper-id]].
```

### Sync 模型

ResearchBuddy 把 workspace 文件索引到 `.researchbuddy/index.json`，外部适配器应合并而非覆盖：

- **Zotero** — 更新论文元数据和 tags，保留本地 notes
- **Google Drive** — 镜像 docs、meetings、writing 输出
- **Cloud workers** — 可 pull/push repo 并运行 `ensure` 或 `reindex`
- **团队协作** — 通过 git commit & merge 进行
