---
title: Papers — 论文管理
---

# Papers — 论文管理

Papers 是 ResearchBuddy 的文献库，所有论文以 Markdown 文件存储在项目 git 仓库中（`papers/notes/`），对 AI Agent 完全可读可写。

初始进入 Papers 页面时，文献库为空：

![Papers 页面 — 初始空状态，Zotero 同步按钮高亮](/api/help-images/papers-empty.png)

完成 Zotero 同步后，论文卡片会填充进来：

![Papers 页面 — 同步后显示的论文卡片](/api/help-images/papers-loaded.png)

---

## 添加论文

### 从 Zotero 同步

点击右上角 **🔄 刷新** 按钮，从绑定的 Zotero 库批量导入。

:::tip
首次同步前需在 Home → Project Settings 配置 Zotero API Key 和 Library ID。详见[项目基础设置](../01-quick-start/03-project-setup)。
:::

### 从 ArXiv 导入

在工具栏输入 ArXiv ID（如 `2301.00000`），点击 **Import**。系统自动抓取标题、作者、摘要等元数据。

---

## 论文卡片

每张卡片显示标题、作者、年份、Venue，以及 arXiv / DOI / Zotero 链接。

鼠标悬停右下角显示 `@citationkey`，这是在文档中引用这篇论文的格式：`[[citationkey]]`。

---

## BibTeX 同步

Papers 页面下方有 **BibTeX Sync** 状态栏，显示 `papers/bib/references.read_only.bib` 的当前状态（条目数），每次增加/修改论文后自动重建。

:::note
这个文件由系统自动维护，**不要手动编辑**。
:::

---

## 论文笔记

点击卡片进入论文详情页，可以编辑笔记（支持完整 Markdown + Callout 块），同步笔记到 Google Drive，或推送到 Zotero。

---

## AI Generated References

Papers 页面底部的 **AI-generated references** 区域，显示 AI Agent 写入 `bibs/ai_generated.bib` 的待确认文献。点击 **✓ Confirm** 将其移入正式 bib 文件。
