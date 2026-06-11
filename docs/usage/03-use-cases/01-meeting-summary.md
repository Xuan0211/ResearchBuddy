---
title: 用例：自动总结会议
---

# 用例：自动总结会议

ResearchBuddy 可以帮你从会议逐字稿中自动提取关键信息，大幅减少会后整理时间。

## 工作流程

### 1. 创建会议

进入 **Meetings** → 点击 **+** 新建会议，填写日期、参与者。

### 2. 会议中记录逐字稿

在 **Transcript / Notes** 标签页，可以实时粘贴录音转写文本，或者会后统一粘贴。

:::tip
大多数录音工具（如 Otter.ai、飞书妙记、通义听悟）都支持导出文字稿，直接粘贴到这里即可。
:::

### 3. 触发 AI 分析

在 Transcript 标签页，点击工具栏 **AI Analyze** 按钮。

AI 会自动提取并填充：

| 类别 | 示例 |
|---|---|
| 🔑 关键决策 | "确定使用 GPT-4o 作为基础模型" |
| ✅ 行动项 | "@alice 在周五前完成用户研究访谈大纲" |
| ❓ 开放问题 | "如何处理多模态输入的延迟问题？" |

提取结果自动写入 **Post-meeting** 标签页。

### 4. 同步到 Google Drive

点击 **Drive** 按钮，将整个会议（含三个标签页）推送到 Google Drive，方便团队在 Docs 里查阅。

### 5. 更新 MTG Log

在 Meetings 列表页点击 **Sync Log**，Drive 上的 `MTG_LOG` 主文档自动添加这次会议的记录。

## 配合 AI Agent 使用

会议记录以 Markdown 存储在 `meetings/mygdocs/<id>.md`，AI Agent 可以直接读取：

```bash
# Clone 项目后查看会议记录
ls meetings/mygdocs/
cat meetings/mygdocs/<meeting-id>.md
```

Agent 可以进一步对多次会议进行跨会议分析，例如统计某个话题被提到了多少次，或者追踪某个 TODO 的完成情况。
