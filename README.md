# ResearchBuddy

研究团队协作平台。每个项目是一个 git 仓库，论文、会议记录、文档以 Markdown 文件存储，AI Agent、Zotero、Google Drive 都通过 git 协作。

**线上地址**：[https://research.arklab-hkustgz.com](https://research.arklab-hkustgz.com)

---

## 核心功能

| 模块 | 说明 |
|------|------|
| **Papers** | 论文管理，支持 Zotero 同步、ArXiv 导入、BibTeX 自动生成 |
| **Meetings** | 会议记录，三栏结构（Pre / Notes / Post），Google Drive 同步 |
| **Docs** | 富文本文档编辑器，支持 `[[wiki-link]]` 引用论文 |
| **Writing** | LaTeX 写作工作区，两层引用体系（只读 bib + AI 可写 bib） |
| **Coding** | 质性编码（Codebook / Code / Excerpt / Transcript） |
| **Workspace** | git 仓库管理，版本历史，AI Agent 克隆入口 |
| **Skills** | 团队/Agent 可复用的 Markdown 技能库 |

---

## 技术栈

- **后端**：FastAPI (Python 3.11) + SQLite + GitPython
- **前端**：Next.js 14 (App Router) + shadcn/ui + Tiptap
- **部署**：Docker Compose + nginx

---

## 快速启动（本地开发）

```bash
# 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填写 SECRET_KEY 等
uvicorn app.main:app --reload --port 8000

# 前端（另开终端）
cd frontend
npm install
npm run dev
```

访问 `http://localhost:3000`，API 文档在 `http://localhost:8000/docs`。

---

## 开发文档

| 文档 | 内容 |
|------|------|
| [架构](docs/development/00-architecture.md) | 架构图、技术栈、API 参考、Workspace 结构 |
| [本地开发](docs/development/01-getting-started.md) | 启动步骤、环境变量、代码约定 |
| [部署](docs/development/02-deployment.md) | 线上服务器更新、日志、常见问题 |
| [功能模块](docs/development/03-features.md) | 各模块机制与设计约定 |
| [Git 工作流](docs/development/03-git-workflow.md) | 冲突处理、rebase 指南 |
| [数据持久化](docs/development/04-data.md) | 数据路径、备份、Docker volumes |

---

## Project Workspace 结构

每个 Project 的 git 仓库：

```
README.md               项目总览（Agent 入口）
papers/notes/           论文笔记（.md + YAML frontmatter）
papers/bib/             BibTeX（系统维护）
document/docs/          项目文档
meetings/mygdocs/       会议记录
writing/Project/        LaTeX 写作项目
skills/                 AI Agent 技能库
.researchbuddy/         系统元数据
```

Agent 接入方式：
```bash
git clone https://research.arklab-hkustgz.com/git/<project-id>
# 用户名：注册邮箱，密码：账号密码或 rb_xxx API Key
```
