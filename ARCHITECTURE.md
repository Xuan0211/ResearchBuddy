# ResearchBuddy — 架构文档

> v0.3 · 2026-06-04

## 总体架构

```
Browser / Electron / Claude Code / any editor
         │
         │  HTTPS  │  git HTTP Smart Protocol
         ▼
    ┌─────────────────────────────────────┐
    │           FastAPI (Python)           │
    │                                      │
    │  /auth  /vaults  /papers  /meetings  │
    │  /docs  /images  /zotero  /git/*     │
    └──────┬──────────────────────┬────────┘
           │                      │
       SQLite                 /vaults/
    (users, vaults,          {vault_id}.git/   ← bare git repos
     members, images)        papers/*.md
                             meetings/*.md
                             docs/*.md
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
| 图片存储 | 服务端本地文件系统（后期可换图床） |
| 前端框架 | Next.js 14 (App Router) |
| UI 组件 | shadcn/ui + Tailwind CSS |
| Markdown 编辑器 | TipTap |
| 部署 | nginx + gunicorn + next build，systemd |

---

## 项目结构

```
ResearchBuddy/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── auth.py         # 注册、登录、API Key
│   │   │   ├── vaults.py       # Vault CRUD + 成员管理
│   │   │   ├── papers.py       # 读写 papers/*.md + 图片上传
│   │   │   ├── meetings.py     # 读写 meetings/*.md + .ics 生成
│   │   │   ├── documents.py    # 读写 docs/*.md + /context 端点
│   │   │   └── git.py          # HTTP Smart Protocol 代理
│   │   ├── services/
│   │   │   ├── vault_fs.py     # 文件系统读写 .md
│   │   │   ├── frontmatter.py  # YAML frontmatter 解析/写入
│   │   │   ├── git_service.py  # git add/commit 封装
│   │   │   ├── zotero.py       # Zotero API 同步
│   │   │   └── arxiv.py        # ArXiv 元数据拉取
│   │   ├── models.py           # User, Vault, VaultMember, Image
│   │   └── core/
│   │       ├── config.py
│   │       ├── security.py     # JWT + API Key
│   │       └── db.py
│   ├── vaults/                 # bare git repos
│   ├── images/                 # 上传的论文预览图
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/login, register
│   │   └── (app)/vaults/[id]/
│   │       ├── papers/         # 画廊 + 论文详情
│   │       ├── meetings/       # 会议列表 + 编辑
│   │       └── docs/           # 文档编辑器
│   └── components/
│       ├── paper/PaperCard, PaperGallery, CitationHoverCard
│       ├── meeting/MeetingForm, MeetingDetail
│       └── editor/MarkdownEditor, WikiLinkExtension
│
└── vault-template/             # 新 Vault 的初始文件
    ├── .rbignore
    ├── papers/.gitkeep
    ├── meetings/.gitkeep
    └── docs/.gitkeep
```

---

## 关键 API

```
# Auth
POST /api/auth/register
POST /api/auth/login
POST /api/auth/api-keys

# Vaults
GET/POST      /api/vaults
GET/DELETE    /api/vaults/{id}
POST          /api/vaults/{id}/members

# Papers
GET/POST      /api/vaults/{id}/papers
GET/PATCH     /api/vaults/{id}/papers/{paperId}
POST          /api/vaults/{id}/papers/{paperId}/image   # 上传预览图
GET           /api/vaults/{id}/papers/{paperId}/context # AI 用，返回结构化 JSON

# Meetings
GET/POST      /api/vaults/{id}/meetings
GET/PATCH     /api/vaults/{id}/meetings/{mtgId}
GET           /api/vaults/{id}/meetings/{mtgId}/ics     # 下载 .ics

# Documents
GET/POST      /api/vaults/{id}/docs
GET/PATCH     /api/vaults/{id}/docs/{docId}
GET           /api/vaults/{id}/docs/{docId}/context     # AI 用，含引用论文元数据

# Zotero
POST          /api/vaults/{id}/zotero/config
POST          /api/vaults/{id}/zotero/sync
GET           /api/vaults/{id}/zotero/status

# ArXiv（实时查，不存储）
GET           /api/arxiv/{arxivId}

# Git HTTP Smart Protocol
GET/POST      /git/{vaultId}/...
```

---

## 里程碑

| 里程碑 | 内容 | 预估 |
|--------|------|------|
| M0 | 脚手架：FastAPI + SQLite + Next.js，目录结构，Docker Compose（可选） | 1天 |
| M1 | Auth + Vault CRUD + bare git repo + HTTP git 访问 | 2天 |
| M2 | Papers API + frontmatter 解析 + 图片上传 + 画廊 UI | 3天 |
| M3 | Zotero 同步 + ArXiv 导入 | 3天 |
| M4 | Meetings API + 三段式模板 + .ics 生成 | 2天 |
| M5 | Documents 编辑器 + wiki-link + hover 卡片 + /context 端点 | 3天 |

**MVP (M0–M4)：约 2 周**
