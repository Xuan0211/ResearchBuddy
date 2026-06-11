---
title: 用例：AI 辅助文献综述
---

# 用例：AI 辅助文献综述

这个用例展示了 ResearchBuddy 在**跨模块联动、人机协同编辑**上的优势——你在 Zotero 里维护文献库，AI Agent 读取论文笔记，生成综述文档，自动推送到云端，你和队友在 ResearchBuddy UI 里直接编辑和使用。

---

## 前置准备

1. 完成 Zotero 绑定，同步论文到 Papers 模块（见[项目基础设置](../01-quick-start/03-project-setup)）
2. 在 Workspace 页面 clone 项目到本地（见 [Workspace](../02-modules/08-workspace)）

---

## 操作步骤

### 第 1 步 — 在本地 Agent 中打开项目

在 Claude Code 或其他本地 Agent 中，选择刚 clone 的项目文件夹：

![在本地 Agent 中打开 clone 的项目文件夹，可以看到完整的目录结构](/api/help-images/uc1-open-project.png)

项目里的 `papers/notes/` 包含你所有的论文笔记（Markdown + BibTeX frontmatter），Agent 可以直接读取。

### 第 2 步 — 输入 Prompt

在 Agent 中输入：

> 阅读文献库里的有关文献，告诉我现在生成式界面的大概情况。形成一个文档。

Agent 会自动：
- 扫描 `papers/notes/` 下的所有论文
- 读取摘要、笔记和标签
- 形成结构化综述文档

### 第 3 步 — 本地查看生成结果

Agent 在本地生成的文档，可以先在终端预览：

![Agent 本地生成的文献综述文档，包含研究背景、核心概念分析、技术路线等结构](/api/help-images/uc1-local-output.png)

### 第 4 步 — 推送到 ResearchBuddy

确认结果后，告诉 Agent：

> 帮我同步到 git 上

Agent 自动执行 `git add`、`git commit`、`git push`：

![Agent 完成 git 推送 — 提交并推送，文件已同步到远端](/api/help-images/uc1-push-to-git.png)

### 第 5 步 — 在 ResearchBuddy 里查看和编辑

刷新 ResearchBuddy，在 **Docs** 模块里就能看到这篇文档：

![ResearchBuddy Docs 中显示 AI 生成的文献综述，可以直接编辑、添加 Callout、引用其他论文](/api/help-images/uc1-rb-doc-result.png)

现在你和队友可以在 ResearchBuddy 的富文本编辑器里直接修改——添加评论、插入 `[[论文引用]]`、改写段落，所有修改都会自动 commit 回 git。

---

## 跨模块协作

队友 pull 这个项目后，可以：
- 用自己的 Agent 继续扩展综述
- 在 Papers 模块打开原始论文查看笔记
- 在 Writing 模块将综述转成 LaTeX 论文初稿

这个工作流的核心是：**Agent 和人类共用同一个 git 仓库，彼此的修改互相可见、可追溯。**
