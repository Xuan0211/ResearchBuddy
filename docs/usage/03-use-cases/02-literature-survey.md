---
title: 用例：做文献综述（Survey）
---

# 用例：做文献综述（Survey）

ResearchBuddy 提供了一套完整的 Survey 工作流，从文献收集、筛选、编码到写作一站式完成。

## 完整工作流

### 阶段一：建立文献库

**从 Zotero 导入**：
1. 在 Zotero 里创建一个专门的 Group Library（如 `SmartAgent-Survey`）
2. 把候选文献加入这个库
3. 在 ResearchBuddy 项目 Home → Project Settings → Zotero，绑定这个 Group Library
4. Papers 页面点击 🔄 同步

**从 ArXiv 直接导入**：
在 Papers 工具栏输入 ArXiv ID，批量导入目标文献。

---

### 阶段二：筛选文献

进入 **Coding** 模块，创建一个 Codebook，设置筛选标准：

```
Inclusion Criteria:
  - 研究对象是 LLM Agent
  - 发表于 2022 年后
  - 全文可获取

Exclusion Criteria:
  - 纯综述（non-empirical）
  - 工业白皮书
```

逐篇在 Screening 界面标记 Included / Excluded，完成后导出 CSV。

---

### 阶段三：阅读与编码

对纳入的文献：
1. 在 Papers 里打开论文详情，写阅读笔记（支持 `[[引用其他论文]]`）
2. 在 Coding → Excerpt 提取关键摘录，打上编码标签

:::tip
在论文笔记里写 `[[另一篇论文的ID]]` 可以建立论文间的关联，点击时弹出摘要卡片。
:::

---

### 阶段四：写综述

1. 在 **Writing** 模块创建新写作项目
2. `bibs/references.read_only.bib` 已经同步了你的全部文献库
3. 在 `sections/` 目录里写各章节的 `.tex` 文件
4. 用 `\cite{key}` 引用已验证文献，`\aicite{key}` 用于 AI 建议的文献（待确认）
5. 绑定 Overleaf 随时预览编译结果

---

### 配合 AI Agent 加速

Clone 项目仓库后，AI Agent 可以：

1. **批量生成论文摘要** — 读取 `papers/notes/*.md`，对每篇补充摘要、关键贡献
2. **生成综述草稿** — 读取所有笔记 + 编码结果，自动生成各节初稿
3. **管理引用** — 在 `ai_generated.bib` 里添加未在 Zotero 里的文献

Agent 遵循的规则在 `skills/paper-writing-core/` 和 `skills/citation-management/` 目录里定义，建议先读这两个文件。
