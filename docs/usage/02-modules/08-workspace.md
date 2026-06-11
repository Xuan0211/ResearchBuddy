---
title: Workspace — 工作区
---

# Workspace — 工作区

Workspace 是每个项目的 git 仓库管理界面，也是 AI Agent 接入项目的入口。

---

## Clone 项目

在 Workspace 页面复制 Clone 命令，在终端执行：

![Workspace 页面 — 复制 Clone 命令，账号密码就是平台注册的邮箱和密码](/api/help-images/workspace-clone.png)

```bash
git clone https://research.arklab-hkustgz.com/git/<project-id>
```

:::tip
**账号密码就是你在 ResearchBuddy 注册时使用的邮箱和密码。**
也可以用 `rb_xxx` API Key 作为密码（更安全，在 Settings → API Keys 生成）。
:::

---

## 目录结构

每个项目仓库遵循 v2 标准结构：

```
README.md             项目总览（Agent 入口）
papers/notes/         论文笔记（.md，含 BibTeX frontmatter）
papers/bib/           BibTeX 文件（自动维护，勿手动编辑）
document/docs/        项目文档
meetings/mygdocs/     会议记录
meetings/resources/   会议资产（transcript、附件等）
writing/Project/      LaTeX 写作项目
coding/Project/       质性编码项目
images/               图片资产
prototype/            原型代码和实验
skills/               AI Agent 技能库
.researchbuddy/       系统元数据
```

每个目录都有 `README.md`，AI Agent 进入目录时应先读取，了解文件格式和操作约定。

---

## Push 更新

```bash
git add .
git commit -m "描述改动"
git push
```

Push 后 ResearchBuddy UI **立即更新**，团队成员可以看到最新内容。

---

## 文件树

点击 **File tree** 折叠区查看当前 HEAD 的所有文件，确认内容是否正确同步。

---

## 版本历史

**Version history** 列出所有用户 push 的 commits（不含系统自动提交）。  
点击 **Revert to this** 可将仓库回滚到该版本（通过新建 commit 实现，不破坏历史记录）。

---

## Ensure / Reindex

- **Ensure** — 检查并补全缺失的目录、README、配置文件（新项目或升级后使用）
- **Reindex** — 重建 `.researchbuddy/index.json` 全项目文件索引

---

## 对 AI Agent 的说明

:::tip
Agent 克隆项目后，应先读取 `README.md` 和各目录的 `README.md`，了解结构和约定后再操作。
:::

`*.read_only.*` 命名的文件由系统自动维护，**Agent 不应修改**：
- `papers/bib/references.read_only.bib`
- `meetings/manifest.read_only.json`
- `writing/Project/*/manifest.read_only.json`
