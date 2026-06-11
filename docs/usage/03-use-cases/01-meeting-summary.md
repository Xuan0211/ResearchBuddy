---
title: 用例：AI 生成会议文档
---

# 用例：AI 生成会议文档

这个用例展示了 ResearchBuddy 在**解决繁杂会议记录、辅助项目管理和团队同步**上的优势——把会议转写稿丢给 Agent，它自动生成会议文档、提取 TODO、推送到 git，你在 ResearchBuddy 里看到整理好的内容。

---

## 前置准备

- 已 clone 项目到本地（见 [Workspace](../02-modules/08-workspace)）
- 从会议工具（Otter.ai、飞书妙记、Zoom、通义听悟等）导出逐字稿文本文件

---

## 操作步骤

### 第 1 步 — 把 transcript 放到 resources 目录

在本地 clone 的项目里，把转写文件放到 `meetings/resources/` 目录：

![Finder 中将会议转写文件放入 meetings/resources 目录](/api/help-images/uc2-transcript-resources.png)

:::tip
`meetings/resources/` 专门用于存放会议相关的资产文件（转写稿、附件、录音等），Agent 知道去这里找原始材料。
:::

### 第 2 步 — 在 Agent 中输入 Prompt

在 Claude Code 或本地 Agent 里，打开项目，输入：

> 帮我总结一下这个会议，总结出会议文档，并且同步到 TODO 里，同步到 git 云端。

![Claude Code 中输入会议总结 Prompt，Agent 会读取 transcript 并处理所有步骤](/api/help-images/uc2-agent-prompt.png)

Agent 会自动：
1. 读取 `meetings/resources/` 里的转写文件
2. 生成结构化会议文档（研究目标、讨论要点、决策、行动项）
3. 创建 `meetings/mygdocs/<id>.md`
4. 提取行动项写入 TODO 格式
5. `git add + commit + push`

### 第 3 步 — 等待 Agent 完成

Agent 运行结束后会显示 commit 完成：

![Agent 完成 git 推送 — 文件已同步到远端](/api/help-images/uc2-git-push-done.png)

### 第 4 步 — 在 ResearchBuddy 查看 TODO

打开 ResearchBuddy Home 页，**TODO** 区域已经有了从会议中提取的行动项：

![Home 页 TODO — Agent 从会议中提取的行动项，带有负责人和截止时间](/api/help-images/uc2-todo-result.png)

所有行动项都可以直接在 UI 里编辑、勾选完成、添加截止日期。

### 第 5 步 — 在 ResearchBuddy 查看会议文档

切换到 **Meetings** 标签页，完整的会议文档已经出现：

![Meetings 页 — Agent 生成的结构化会议文档，包含 Pre-meeting/Transcript/Post-meeting 三个标签页](/api/help-images/uc2-meeting-doc.png)

文档有完整的三栏结构（Pre-meeting / Transcript / Post-meeting），可以直接在 ResearchBuddy 里继续编辑。

---

## 进一步操作

在 ResearchBuddy 里，你还可以：
- 点击 **Drive** 同步到 Google Docs，分享给更多人
- 点击 **AI Analyze** 让 AI 进一步提炼决策和风险
- 在 Home 的 TODO 里为每个行动项设置负责人
- 下次会议时，队友 pull 项目就能直接看到所有历史会议记录
