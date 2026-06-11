---
title: Skills — 技能库
---

# Skills — 技能库

Skills 是 ResearchBuddy 的 AI Agent 工作流系统。每个 Skill 是一个 Markdown 文件，描述 Agent 应该在什么时候、用什么方式完成特定任务。Skills 既可以是个人项目私有的，也可以发布到所有人都能使用的全局库。

---

## Global Skills Library（全局共享库）

点击顶部导航栏的 **Global Skills** 进入全局技能库：

![全局技能库 — 所有登录用户可见的共享 Skill](/api/help-images/skills-global-overview.png)

任何人都可以向全局库贡献 Skill：填写名称、标签、推荐文档，并选择适用的模块（Papers / Writing / Meetings 等），然后点击 **Add skill**：

![添加全局 Skill — 填写名称、模块归属和 Skill 内容](/api/help-images/skills-global-add.png)

---

## 将全局 Skill 导入项目

在全局库找到需要的 Skill，点击卡片上的 **+ Import**，选择目标项目后确认：

![从全局库导入 Skill 到项目](/api/help-images/skills-import-to-project.png)

导入后，这个 Skill 会出现在项目的 Skills 页面，团队所有成员都可以使用：

![项目 Skills 页 — 显示导入的 Skill 和其他内置 Skill](/api/help-images/skills-project-page.png)

:::tip
左侧侧边栏的 **All / Papers / Writing / Meetings** 等 tab 按模块筛选，快速找到当前场景适用的 Skill。
:::

---

## 将 Skill 附加到模块

导入后，可以把 Skill 挂载到特定模块，让它出现在该模块的 **Module Resources** 面板里：

在项目 **Writing** 页面（或其他模块）的 Module Resources → **Attached Skills** 区域，点击 **+ Add Skill** 搜索并选择：

![Writing 模块的 Module Resources — Attached Skills 区域显示已挂载的 Skill](/api/help-images/skills-attach-to-module.png)

挂载后，你和你的团队成员在该模块工作时，可以一键展开查看 Skill 内容，Agent 也会自动读取并遵循其中的规则。

---

## 项目私有 Skill

在项目 **Skills** 标签页，可以直接创建只属于当前项目的私有 Skill：

- 点击 **+ New skill** 选择模板（AI Task / Research Workflow / Checklist / Blank）
- 编写 Skill 内容（Markdown 格式）
- 设置 `sections` 附加到对应模块

Skill 文件存储在项目 git 仓库的 `skills/` 目录，Agent clone 项目后可以直接读取。

---

## Skill 格式

```markdown
---
title: "Skill 名称"
description: "一行描述，显示在卡片上"
tags: ["ai", "writing"]
sections: ["writing", "papers"]  # 附加到哪些模块
---

# Skill 名称

## When to use
什么时候触发这个 Skill

## Steps
1. 步骤一
2. 步骤二

## Rules
- 约束条件
```

---

## 内置 Skill

ResearchBuddy 预置了几个通用 Skill，在任何项目中都可以使用：

| Skill | 用途 |
|---|---|
| Meeting Transcript Analysis | 从会议逐字稿提取决策、行动项和开放问题 |
| Summarize Meeting | 生成结构化会议纪要 |
| Summarize Paper | 生成论文摘要（贡献、方法、结论） |
| Find Citations for a Claim | 在论文库中搜索支持某个论点的文献 |
| Find Relevant Papers | 按主题筛选相关文献 |
