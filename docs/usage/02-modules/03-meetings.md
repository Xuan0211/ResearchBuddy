---
title: Meetings — 会议记录
---

# Meetings — 会议记录

Meetings 模块管理所有会议记录，支持三栏结构编辑、Google Drive 同步和 AI 分析。

## 创建会议

点击右上角 **+** 新建会议。自动预填下一次固定会议时间（如果在设置里配置了的话）。

会议默认有三个标签页：

| 标签页 | 用途 |
|---|---|
| **Pre-meeting** | 上周回顾、本周进展、议程 |
| **Transcript / Notes** | 会议记录或逐字稿 |
| **Post-meeting** | 结论、决策、行动项（TODO） |

可以添加自定义标签页（如"Demo"、"Code Review"）。

## 会议设置

点击工具栏的 **⚙ 设置** 图标：

- **默认会议室** — 新建会议自动填充地点
- **固定会议时间** — 设置每周几几点，新建时自动预填下次日期
- **时长** — 自动计算结束时间

## @提及团队成员

在编辑器中输入 `@` 弹出团队成员列表，选择后插入提及。

成员联系人在 **⚙ 设置 → 联系人** 里管理（姓名、邮箱、@handle 映射）。

## AI 分析逐字稿

在 Transcript 标签页粘贴会议录音转写文本，点击 **AI Analyze** 按钮，自动提取：
- 🔑 关键决策
- ✅ 行动项（Action Items）
- ❓ 开放问题

## Google Drive 同步

点击工具栏 **Drive** 按钮，将当前会议推送到 Google Drive（需要先在 Project Settings 连接 Drive）。

**MTG Log**：在 Meetings 列表页点击 **Sync Log** 按钮，在 Drive 中自动维护一个 `MTG_LOG` 主文档，包含所有会议的日期、标题和 Drive 链接列表。

## 日历导出

会议详情页可以：
- 导出 `.ics` 文件（兼容 Outlook、Apple Calendar）
- 生成 Outlook Web 日历事件链接
