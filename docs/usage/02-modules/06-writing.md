---
title: Writing — 论文写作
---

# Writing — 论文写作

Writing 模块是为 LaTeX 论文写作设计的工作区，集成了两层引用管理和 AI 写作规范。

## 创建写作项目

点击 **+ New writing project**，输入项目名称（如 `CHI2025-SmartAgent`）。

系统自动初始化标准目录结构：

```
writing/Project/<name>/
├── main.tex                       # ACM Conference 格式主文件
├── bibs/
│   ├── references.read_only.bib   # 来自 Papers 模块，只读
│   └── ai_generated.bib           # AI 写入，待确认
├── sections/
│   └── introduction.tex
├── images/
├── other/
└── skills/
    ├── paper-writing-core/
    └── citation-management/
```

## 两层引用体系

:::warning
这是 Writing 模块的核心设计，AI Agent 必须遵守。
:::

| 文件 | 谁写 | LaTeX 命令 |
|---|---|---|
| `bibs/references.read_only.bib` | ResearchBuddy（从 Papers 同步） | `\cite{key}` |
| `bibs/ai_generated.bib` | AI Agent | `\aicite{key}` |

`\aicite{}` 在 PDF 中渲染为橙色，让读者一眼看出哪些是 AI 建议的文献。确认后在 Papers → AI Generated References 区域点击 **✓ Confirm**，文献会移入正式 bib 文件。

## 同步 Bib 文件

当你在 Papers 里新增或更新文献后，在项目 Workspace 里运行：

```bash
sh writing/utils.read_only/sync_bibs_from_papers.sh <project-name> references
```

或者在 Writing 工作区点击 **Sync bib** 按钮。

## 外部工具

Writing 工作区支持绑定：
- **GitHub 仓库 URL** — 一键跳转 clone/push
- **Overleaf URL** — 一键在 Overleaf 编译预览

## 文件浏览器

左侧文件树展示所有 `.tex` 和 `.bib` 文件，点击查看内容。

## AI 写作规范

`skills/` 目录里有两个内置规范文件，AI Agent 应在写作前读取：
- `paper-writing-core/` — 核心写作规则（只能写 sections/ 和 ai_generated.bib）
- `citation-management/` — 引用管理指南
