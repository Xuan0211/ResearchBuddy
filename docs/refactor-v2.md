# ResearchBuddy v2 重构计划

> **版本边界声明**：本次重构为破坏性更新（Breaking Change）。v2 部署时将清空所有现有项目数据。v2 之前创建的项目数据**不迁移、不兼容**。v2 之后的所有新项目遵循本文档定义的结构，并预留向前兼容口子。

---

## 目录

1. [重构目标](#1-重构目标)
2. [执行前备份](#2-执行前备份)
3. [版本边界与数据策略](#3-版本边界与数据策略)
4. [新的 Git Repo 文件结构](#4-新的-git-repo-文件结构)
5. [后端改动清单](#5-后端改动清单)
6. [前端兼容策略](#6-前端兼容策略)
7. [向前兼容口子](#7-向前兼容口子)
8. [执行顺序](#8-执行顺序)
9. [部署步骤](#9-部署步骤)

---

## 1. 重构目标

### 问题
- 当前 project-template 结构混乱：模块没有统一格式，文件 flat 存放缺乏语义
- `.rbignore` 是自造规范，外部工具（AI agents、git 客户端）不识别
- papers/meetings/docs 直接 flat 存在模块根目录，不清晰
- writing 项目的 bib 文件命名和路径不一致（`reference.bib` vs `ai-generated.bib`）
- 没有集中的 bib 管理，写作项目和论文库割裂
- 内部路径字符串散落在各 API 文件，没有统一

### 目标
- 统一所有模块的目录结构（`README.md` + `skills.json` + `docs.json` + `resources/` + `utils.read_only/`）
- 每个模块内容放在语义明确的子目录（`notes/`、`mygdocs/`、`docs/`、`Project/`）
- 用 `.gitignore` 替换 `.rbignore`
- 集中 bib 管理（`papers/bib/`）
- 内部存储路径全部收归常量，方便维护
- **前端逻辑、API 端点完全不变**

---

## 2. 执行前备份

### 2.1 代码备份

```bash
# 在主分支打 tag，锁定 v1 最后状态
git tag v1-final
git push origin v1-final

# 创建重构分支
git checkout -b refactor/v2-structure
```

### 2.2 服务器数据备份（重构前执行）

```bash
# 在服务器上执行，备份所有用户数据
ssh user@43.156.12.203

# 打包所有项目 git 仓库
tar -czf /backup/projects-v1-$(date +%Y%m%d).tar.gz /backend/projects/

# 备份数据库
cp /backend/db.sqlite3 /backup/db-v1-$(date +%Y%m%d).sqlite3

# 备份图片
tar -czf /backup/images-v1-$(date +%Y%m%d).tar.gz /backend/images/
```

> **备份验证**：确认备份文件大小合理、可解压后再继续。

---

## 3. 版本边界与数据策略

### 3.1 破坏性变更

本次部署**清空以下数据**：
- `backend/projects/` — 所有项目 git bare 仓库
- `backend/db.sqlite3` — 数据库（用户账号、项目、成员、Drive 映射等全部重置）
- `backend/images/` — 论文封面图

清空方式（服务器 Docker 部署时执行）：
```bash
# 停服后执行
docker compose down
rm -rf /backend/projects/*
rm -f /backend/db.sqlite3
rm -rf /backend/images/*
docker compose up -d
```

> 用户账号数据同样清空。通知用户重新注册。

### 3.2 向前兼容留口

虽然 v1 数据不迁移，但所有**系统写入文件**均加入 schema 版本字段，为将来的自动迁移预留条件：

```json
// 任何 .json 系统文件均携带
{
  "schema": "researchbuddy.{module}.{type}",
  "version": "2.0",
  ...
}
```

当版本不匹配时，后端打印警告但不崩溃，返回降级数据，不静默失败。

---

## 4. 新的 Git Repo 文件结构

每个 `git clone` 下来的项目 repo 结构如下：

```
{project}/
├── .gitignore                            ← 替换原 .rbignore
│
├── project_info/
│   ├── manifest.read_only.json           ← 项目基础信息（后端写入）
│   ├── team.read_only.json               ← 成员信息（后端写入）
│   └── timeline.read_only.json           ← 时间线（后端写入）
│
├── papers/
│   ├── bib/
│   │   ├── all_references.read_only.bib  ← Zotero 同步时重建（后端写入）
│   │   └── all_ai_generated.bib          ← 汇总各写作项目 AI 引用（后端写入）
│   ├── notes/                            ← 每篇论文 {citationkey}.md（后端读写）
│   ├── images/                           ← 论文封面/截图（后端写入）
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   ├── utils.read_only/
│   │   ├── check_format.sh
│   │   ├── build_all_references_bib.sh
│   │   ├── collect_ai_generated_bib.sh
│   │   └── sync_bib_to_zotero.sh
│   └── README.md
│
├── meetings/
│   ├── manifest.read_only.json           ← 会议设置（原 .researchbuddy/meeting-settings.json）
│   ├── mtglog.json                       ← 会议索引（后端写入）
│   ├── mygdocs/                          ← 每个会议 {id}.md（后端读写）
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   ├── utils.read_only/
│   │   ├── check_format.sh
│   │   ├── update_mtglog.sh
│   │   └── sync_all_to_drive.sh
│   └── README.md
│
├── document/
│   ├── docs/                             ← 每个文档 {id}.md（后端读写）
│   ├── images/
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   ├── utils.read_only/
│   │   ├── check_format.sh
│   │   ├── sync_all_to_drive.sh
│   │   └── export_all_markdown.sh
│   └── README.md
│
├── writing/
│   ├── Project/
│   │   └── {writing_id}/                 ← 每个写作项目（后端读写）
│   │       ├── manifest.read_only.json   ← 项目信息 + GitHub/Overleaf 链接
│   │       ├── bibs/
│   │       │   ├── references.read_only.bib  ← Zotero 管，禁止 AI 写入
│   │       │   └── ai_generated.bib          ← AI 可添加
│   │       ├── main.tex
│   │       ├── sections/
│   │       │   └── introduction.tex
│   │       ├── images/
│   │       ├── other/
│   │       ├── README.md
│   │       └── .gitignore
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   ├── utils.read_only/
│   │   ├── check_format.sh
│   │   ├── sync_references_from_papers.sh
│   │   └── collect_ai_to_papers.sh
│   └── README.md
│
├── coding/
│   ├── Project/
│   │   └── {coding_id}/                  ← 每个编码项目
│   │       ├── screening/
│   │       │   ├── paperlist.csv
│   │       │   └── stages.json
│   │       ├── matrix.csv
│   │       ├── codes.json
│   │       ├── transcripts/
│   │       ├── images/
│   │       └── README.md
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   ├── utils.read_only/
│   │   ├── check_format.sh
│   │   ├── validate_consistency.sh
│   │   ├── validate_paperlist.sh
│   │   └── export_matrix.sh
│   └── README.md
│
├── images/
│   ├── manifest.read_only.md             ← Figma 链接等（后端写入）
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   └── README.md
│
├── prototype/
│   ├── manifest.read_only.md             ← GitHub/部署链接（后端写入）
│   ├── resources/
│   ├── skills.json
│   ├── docs.json
│   └── README.md
│
└── Skills/
    ├── find-citations/SKILL.md
    ├── find-papers/SKILL.md
    ├── meeting-transcript/SKILL.md
    ├── summarize-meeting/SKILL.md
    └── summarize-paper/SKILL.md
```

---

## 5. 后端改动清单

### 5.1 原则

- API 端点（URL）**完全不变**
- 前端调用的所有接口签名**完全不变**
- 只改内部路径字符串和初始化结构
- 所有路径字符串**收归每个 api 文件顶部的常量**，不再散落在函数中

### 5.2 路径常量变更

#### `backend/app/api/papers.py`

```python
# 旧
PAPERS_DIR = "papers"
# paper 文件: f"papers/{paper_id}.md"

# 新
PAPERS_NOTES_DIR = "papers/notes"
PAPERS_BIB_DIR = "papers/bib"
ALL_REFERENCES_BIB = "papers/bib/all_references.read_only.bib"
ALL_AI_GENERATED_BIB = "papers/bib/all_ai_generated.bib"
# paper 文件: f"papers/notes/{paper_id}.md"
```

追加逻辑：Zotero 同步完成后调用 `_rebuild_all_references_bib(project_id)`，将所有 paper frontmatter 写入 `all_references.read_only.bib`。

#### `backend/app/api/meetings.py`

```python
# 旧
MEETING_SETTINGS_PATH = ".researchbuddy/meeting-settings.json"
# meeting 文件: f"meetings/{mtg_id}.md"

# 新
MEETING_SETTINGS_PATH = "meetings/manifest.read_only.json"
MEETINGS_DIR = "meetings/mygdocs"
MTGLOG_PATH = "meetings/mtglog.json"
# meeting 文件: f"meetings/mygdocs/{mtg_id}.md"
```

追加逻辑：每次创建/删除/更新会议后，顺带重写 `meetings/mtglog.json`（包含 id/date/title/drive_link 索引）。

#### `backend/app/api/documents.py`

```python
# 旧
# doc 文件: f"docs/{doc_id}.md"

# 新
DOCS_DIR = "document/docs"
# doc 文件: f"document/docs/{doc_id}.md"
```

#### `backend/app/api/projects.py`（batch sync）

```python
# 旧
rel_dir="docs"
rel_dir="meetings"

# 新
rel_dir="document/docs"
rel_dir="meetings/mygdocs"
```

#### `backend/app/api/writing.py`

```python
# 旧
# writing 文件: f"writing/{writing_id}/manifest.md"
# bib: f"writing/{writing_id}/reference.bib"
# ai-bib: f"writing/{writing_id}/ai-generated.bib"
# list: list_project_dir(project_id, "writing")

# 新
WRITING_BASE = "writing/Project"
WRITING_MANIFEST = "manifest.read_only.json"  # JSON，不再是 markdown frontmatter
WRITING_REFS_BIB = "bibs/references.read_only.bib"
WRITING_AI_BIB = "bibs/ai_generated.bib"
# writing 文件: f"writing/Project/{writing_id}/manifest.read_only.json"
# list: list_project_dir(project_id, "writing/Project")
```

写作项目 manifest 从 markdown frontmatter 改为纯 JSON（前端调用的 API 返回结构不变）。

`_init_latex_structure()` 更新：
- 在 `bibs/` 子目录下创建两个 bib 文件
- 创建 `other/` 目录
- `main.tex` 中 `\bibliography` 改为 `bibs/references,bibs/ai_generated`
- 写 `manifest.read_only.json` 替代 `manifest.md`

#### `backend/app/api/papers.py`（ai-generated 相关）

```python
# 旧
bib_path = f"writing/{body.writing_id}/ai-generated.bib"

# 新
bib_path = f"writing/Project/{body.writing_id}/bibs/ai_generated.bib"
```

#### `backend/app/services/git_service.py`

- 删除模板中的 `.rbignore`，改为拷贝 `.gitignore`
- `_copy_template()` 无其他变化

#### `backend/app/api/projects.py`（home-settings）

```python
# 旧
HOME_SETTINGS_PATH = ".researchbuddy/home-settings.json"

# 新
HOME_SETTINGS_PATH = "project_info/manifest.read_only.json"
```

读取时兼容旧 key，写入时用新路径。

### 5.3 新增逻辑

| 位置 | 新增内容 |
|------|----------|
| `projects.py` `create_project` | 初始化后写入 `project_info/manifest.read_only.json`（含 schema/version/project name） |
| `projects.py` `create_project` | 初始化后写入 `project_info/team.read_only.json`（空列表，schema/version） |
| `meetings.py` 写操作 | 每次写会议后更新 `meetings/mtglog.json` |
| `papers.py` zotero sync | 同步后重建 `papers/bib/all_references.read_only.bib` |
| `writing.py` `create_writing_project` | 初始化 `bibs/` 目录，写两个 bib，写 `manifest.read_only.json` |

### 5.4 需要重写（不可平滑迁移）的部分

| 文件 | 原因 | 策略 |
|------|------|------|
| `writing.py` `list_writing_projects` | 原来扫 `writing/*.md`，现在扫 `writing/Project/*/manifest.read_only.json` | 重写扫描逻辑，返回结构不变 |
| `writing.py` `get_writing_project` | manifest 从 md frontmatter → JSON | 读取方式改为 `json.loads()`，API 返回结构不变 |
| `papers.py` `_list_all_papers` | 原来扫 `papers/*.md`，现在扫 `papers/notes/*.md` | 路径常量替换，逻辑不变 |
| `documents.py` `list_docs` | 原来扫 `docs/*.md`，现在扫 `document/docs/*.md` | 路径常量替换，逻辑不变 |
| `meetings.py` `list_meetings` | 原来扫 `meetings/*.md`，现在扫 `meetings/mygdocs/*.md` | 路径常量替换，逻辑不变 |

---

## 6. 前端兼容策略

**原则：前端代码零修改。**

前端调用的 API 端点、请求体、响应体结构全部不变，变化完全被后端吸收。

| 前端调用 | 变化 | 前端需改 |
|----------|------|----------|
| `GET /projects/{id}/papers` | 内部扫描路径变 | ❌ 无需改 |
| `GET /projects/{id}/meetings` | 内部扫描路径变 | ❌ 无需改 |
| `GET /projects/{id}/docs` | 内部扫描路径变 | ❌ 无需改 |
| `GET /projects/{id}/writing` | 内部扫描路径变 | ❌ 无需改 |
| 所有 PATCH/POST/DELETE | 内部路径变 | ❌ 无需改 |
| Drive sync 批量接口 | 内部 rel_dir 变 | ❌ 无需改 |

**例外情况**（如发现需要改）：在此处补充，当前预期为零。

---

## 7. 向前兼容口子

### 7.1 Schema 版本

所有系统写入的 JSON 文件携带 `version: "2.0"` 字段。后端读取时：

```python
def _load_with_version_check(data: dict, expected_schema: str):
    version = data.get("version", "1.0")
    if version != "2.0":
        logger.warning(f"Schema version mismatch: expected 2.0, got {version}")
        # 降级处理，不崩溃
```

### 7.2 路径常量集中化

所有路径字符串收归到 `backend/app/core/paths.py`（新建）：

```python
# backend/app/core/paths.py
SCHEMA_VERSION = "2.0"

PAPERS_NOTES_DIR = "papers/notes"
PAPERS_BIB_DIR = "papers/bib"
ALL_REFERENCES_BIB = "papers/bib/all_references.read_only.bib"
ALL_AI_GENERATED_BIB = "papers/bib/all_ai_generated.bib"

MEETINGS_DIR = "meetings/mygdocs"
MEETING_SETTINGS_PATH = "meetings/manifest.read_only.json"
MTGLOG_PATH = "meetings/mtglog.json"

DOCS_DIR = "document/docs"

WRITING_BASE = "writing/Project"
WRITING_MANIFEST = "manifest.read_only.json"
WRITING_REFS_BIB = "bibs/references.read_only.bib"
WRITING_AI_BIB = "bibs/ai_generated.bib"

HOME_SETTINGS_PATH = "project_info/manifest.read_only.json"
PROJECT_INFO_DIR = "project_info"
```

未来需要升级路径时，只改这一个文件。

### 7.3 `project_info/manifest.read_only.json` 携带结构版本

```json
{
  "schema": "researchbuddy.project.manifest",
  "version": "2.0",
  "name": "My Project",
  "description": "",
  "created_at": "2026-06-10T00:00:00Z"
}
```

---

## 8. 执行顺序

```
Step 1  备份（服务器数据 + 代码 tag v1-final）
Step 2  新建分支 refactor/v2-structure
Step 3  重写 project-template/（新目录结构 + 所有 README + utils.read_only/ + .gitignore）
Step 4  新建 backend/app/core/paths.py（集中所有路径常量）
Step 5  更新 papers.py（路径常量 + bib 重建逻辑）
Step 6  更新 meetings.py（路径常量 + mtglog 维护逻辑）
Step 7  更新 documents.py（路径常量）
Step 8  更新 writing.py（路径常量 + 初始化结构 + manifest 改 JSON）
Step 9  更新 projects.py（batch sync 路径 + project_info 初始化）
Step 10 更新 git_service.py（模板拷贝，.rbignore → .gitignore）
Step 11 本地测试：新建项目 → clone → 验证结构
Step 12 本地测试：所有 CRUD 操作验证前端正常
Step 13 git push + ./update.sh 部署
Step 14 服务器清空旧数据，重启服务
```

---

## 9. 部署步骤

```bash
# 本地
git push origin refactor/v2-structure
# PR review → merge to main

# 服务器（按顺序）
ssh user@43.156.12.203

# 1. 停服
docker compose -f docker-compose.prod.yml down

# 2. 清空旧数据（不可逆，确认备份已完成再执行）
rm -rf /backend/projects/*
rm -f /backend/db.sqlite3
rm -rf /backend/images/*

# 3. 拉取新代码
cd /path/to/ResearchBuddy
git pull origin main

# 4. 重建容器
docker compose -f docker-compose.prod.yml up -d --build

# 5. 重启 nginx
sudo docker restart researchbuddy-nginx-1

# 6. 验证
curl https://research.hopeyuanxu.com/api/health
```

### 回滚方案

若出现问题，可从 `v1-final` tag 恢复代码，从备份文件恢复数据：

```bash
git checkout v1-final
# 恢复备份数据...
docker compose -f docker-compose.prod.yml up -d --build
```

---

*文档版本：v2.0-draft | 最后更新：2026-06-10*
