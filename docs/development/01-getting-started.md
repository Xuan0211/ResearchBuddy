---
title: 本地开发指南
---

# 本地开发指南

## 快速启动

```bash
# 后端（需要 Python 3.11+）
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端（另开一个终端，需要 Node 20+）
cd frontend
npm install
npm run dev
```

访问 `http://localhost:3000`，后端 API 在 `http://localhost:8000`，Swagger 文档在 `http://localhost:8000/docs`。

---

## 环境变量

复制 `.env.example` 到 `.env` 并填写：

```bash
cp .env.example .env
```

| 变量 | 说明 | 本地默认 |
|---|---|---|
| `SECRET_KEY` | JWT 签名密钥 | 任意随机字符串 |
| `GOOGLE_CLIENT_ID` | Google OAuth | 可不填（Drive 功能不可用） |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | 可不填 |
| `GOOGLE_REDIRECT_URI` | OAuth 回调 | `http://localhost:8000/api/auth/google-drive/callback` |
| `SMTP_*` | 邮件配置 | 可不填（注册邮件不发送） |

生产环境密钥在 `.env.prod`（不提交到 git）。

---

## 代码结构

```
backend/
├── app/
│   ├── api/              路由层
│   │   ├── auth.py       注册/登录/API Key
│   │   ├── projects.py   项目 CRUD + Zotero 配置
│   │   ├── papers.py     论文管理 + BibTeX 生成
│   │   ├── documents.py  文档编辑
│   │   ├── meetings.py   会议记录
│   │   ├── workspace.py  git workspace + 文件树
│   │   ├── skills.py     技能库
│   │   ├── git.py        git smart HTTP
│   │   └── sync.py       跨项目同步状态
│   ├── services/
│   │   ├── project_fs.py  git 仓库读写（project_worktree context manager）
│   │   ├── zotero.py      Zotero API 同步
│   │   ├── paper_bib.py   BibTeX 生成与重建
│   │   ├── workspace.py   workspace 初始化 + README 模板
│   │   ├── google_drive.py  Drive 集成
│   │   └── frontmatter.py   YAML frontmatter 读写
│   ├── core/
│   │   ├── config.py     Settings（从环境变量读取）
│   │   ├── db.py         SQLite 初始化
│   │   ├── paths.py      ⭐ 项目仓库内所有路径常量
│   │   └── security.py   JWT + password hash
│   └── models.py         SQLModel 数据模型
├── Dockerfile
└── requirements.txt

frontend/
├── app/
│   ├── (app)/projects/[id]/  各功能模块页面
│   ├── (auth)/               登录/注册
│   ├── help/                 平台文档（渲染 docs/*.md）
│   └── share/docs/[token]/   共享文档只读视图
├── components/               共享组件
│   ├── editor/NotionEditor.tsx  Tiptap 富文本编辑器
│   └── ModuleResourcesPanel.tsx  技能快捷面板
└── lib/
    ├── api.ts                API 客户端
    └── types.ts              TypeScript 类型定义
```

---

## 关键约定

### project_worktree — 写入 git 仓库的唯一方式

所有对项目仓库的写入都通过 `project_worktree` context manager：

```python
from ..services.project_fs import project_worktree

with project_worktree(project_id) as wt:
    wt.commit_message = "描述这次改动"
    path = wt / "papers/notes/smith2023.md"
    path.write_text("...")
    # 退出 context 时自动 git add -A + commit + push
```

`wt` 是一个实现了 `__truediv__`、`__fspath__`、`__str__` 的包装类，可以直接当 Path 使用。

### paths.py — 唯一的路径来源

项目仓库内所有固定路径都在 `backend/app/core/paths.py` 定义，不要在代码里硬编码字符串。

### paper_bib — bib 文件自动维护

每次增加/修改论文后都要调用 `rebuild_papers_bib_files(Path(str(wt)))`，它会重新生成 `papers/bib/references.read_only.bib`。

---

## 完整发布流程

```bash
# 1. 提交代码
git add -A && git commit -m "描述改动" && git push

# 2. 同步并重建服务器
./update.sh

# 3. 重启 nginx（重要！容器重建后 IP 会变）
ssh ubuntu@43.163.8.22 "sudo docker restart researchbuddy-nginx-1"

# 4. 验证
curl -sk https://research.arklab-hkustgz.com/api/health
```

详细部署说明见 [deployment](deployment)。

---

## 多 Agent 协作

- 每个 Agent 在自己的 git 分支上工作，避免冲突
- 后端改动：修改 `backend/app/` 下的文件，**不要动** `backend/projects/`（用户数据）
- 数据库 schema 变更：修改 `backend/app/models.py`，同时更新 `backend/app/core/db.py`
- 前端改动：修改 `frontend/` 下的文件，类型定义在 `frontend/lib/types.ts`
- 新 API 路由必须在 `backend/app/main.py` 注册

---

## API 文档

后端启动后访问 `http://localhost:8000/docs` 查看所有 API 端点（FastAPI 自动生成）。
