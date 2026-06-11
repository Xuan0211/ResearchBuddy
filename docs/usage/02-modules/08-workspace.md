---
title: Workspace — 工作区
---

# Workspace — 工作区

Workspace 是每个项目的 git 仓库管理界面，也是 AI Agent 接入项目的入口。

## 目录结构

每个项目仓库遵循 v2 标准结构：

```
papers/notes/         论文笔记（.md，含 BibTeX frontmatter）
papers/bib/           BibTeX 文件（自动维护，勿手动编辑）
document/docs/        项目文档
meetings/mygdocs/     会议记录
writing/Project/      LaTeX 写作项目
coding/Project/       质性编码项目
images/               图片资产
prototype/            原型代码和实验
skills/               AI Agent 技能库
.researchbuddy/       系统元数据
```

每个目录都有 `README.md`，AI Agent 进入目录时应先读取。

## Clone 项目

在 Workspace 页面复制 Clone 命令：

```bash
git clone https://research.arklab-hkustgz.com/git/<project-id>
# 用邮箱 + 密码，或 rb_xxx API Key 作为密码
```

## Push 更新

```bash
git add .
git commit -m "描述改动"
git push
```

Push 后 ResearchBuddy UI 立即更新。

## 文件树

点击 **File tree** 折叠区查看当前 HEAD 的所有文件，确认内容是否正确。

## 版本历史

**Version history** 区域列出所有用户 push 的 commits（不含 ResearchBuddy 内部自动提交）。点击 **Revert to this** 可以把仓库状态回滚到该版本（通过新建一个 commit 实现，不破坏历史）。

## Ensure / Reindex

- **Ensure** — 检查并补全缺失的目录、README、配置文件（新项目或升级后使用）
- **Reindex** — 重建 `.researchbuddy/index.json` 全项目文件索引

## 对 AI Agent 的说明

:::tip
AI Agent 应优先读取 `.researchbuddy/workspace.json`（workspace 结构说明）和各目录的 `README.md`，了解约定后再进行操作。
:::

`*.read_only.*` 命名的文件（如 `papers/bib/references.read_only.bib`、`meetings/manifest.read_only.json`）由 ResearchBuddy 自动维护，**Agent 不应修改**。
