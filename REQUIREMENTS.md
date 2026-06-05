# ResearchBuddy — 需求文档

> v0.3 · 2026-06-04

## 产品定位

研究团队协作平台。核心是一个 **Research Vault**（git 仓库 + Markdown 文件），任何人或 AI 工具可直接读写文件夹。服务器只负责同步和元数据管理。

---

## Vault 文件结构

```
my-project/
├── .rbignore          # 排除 .claude/ .cursor/ .obsidian/ 等
├── papers/
│   └── smith2023.md
├── meetings/
│   └── 2024-01-15-weekly.md
└── docs/
    └── survey.md
```

### papers/smith2023.md
```markdown
---
id: smith2023ddpm
title: "Denoising Diffusion Probabilistic Models"
authors: ["Ho, Jonathan", "Jain, Ajay"]
year: 2023
venue: NeurIPS
arxiv_id: 2006.11239
zotero_key: ABC123
tags: [diffusion, generative-models]
links:
  zotero: "zotero://select/library/items/ABC123"
  arxiv: "https://arxiv.org/abs/2006.11239"
preview_image: "/api/images/smith2023.png"   # 服务端托管，后续可迁图床
added: 2024-01-15
source: zotero
---

## Notes

...

## Related

- [[jones2024consistency]]
```

### meetings/2024-01-15-weekly.md
```markdown
---
id: mtg-2024-01-15
date: 2024-01-15
title: Weekly Sync
attendees: [alice, bob]
links:
  google_drive: "https://drive.google.com/..."
  transcript: ""
---

## Pre-meeting

### Last Week
### This Week
### Agenda

## Transcript / Notes

## Post-meeting

### Conclusions
### TODO
- [ ] @alice —
```

### docs/survey.md
```markdown
---
id: survey-diffusion
title: Diffusion Models Survey
tags: [survey]
papers: [smith2023ddpm, jones2024consistency]
updated: 2024-01-25
---

## Introduction

Key papers: [[smith2023ddpm]], [[jones2024consistency]]
```

---

## 功能模块

### P0 — 认证 + Vault 管理
- 邮箱注册/登录（JWT）
- 创建 Vault → 服务器创建 bare git repo
- 邀请成员（邮件链接，读/写权限）
- 生成 API Key（供 AI 工具访问）
- `git clone/push/pull` 访问 Vault（HTTP Smart Protocol）

### P1 — Literature Log
- **Zotero 同步**：填入 API Key + Library ID → 同步条目到 `papers/*.md`（手动触发或定时）
- **手动导入**：输入 ArXiv ID → 自动拉取元数据 → 生成 `papers/*.md`
- **预览图**：手动上传图片，存服务端，路径写入 `preview_image` 字段
- **画廊 UI**：读取 `papers/` 渲染卡片，按 `tags/year/venue` 筛选
- **笔记编辑**：Web 端编辑论文 Notes，保存后 git commit

### P1 — Meeting Log
- 创建会议 → 生成 `meetings/YYYY-MM-DD-title.md`（三段式模板）
- 填写会后总结 + TODO
- 关联 Google Drive 文件夹链接（只存链接，不集成）
- 上传或粘贴转录文本（存入 `.md` 文件）
- 下载 `.ics` 文件（不接入 Outlook API）

### P2 — Documents
- Markdown 编辑器，支持 `[[wiki-link]]` 引用论文
- hover 显示论文卡片（标题/作者/摘要）
- 双向引用：论文页显示"被哪些文档引用"
- AI 端点：`GET /docs/{id}/context` 返回文档 + 所有引用论文的结构化 JSON

---

## 明确不做（MVP）

- 存储 PDF / 录音（放 Zotero / Google Drive）
- 转录服务（只支持上传已有转录文本）
- Outlook Calendar 真正集成（只生成 .ics）
- Google Drive 深度集成（只存链接）
- 多人冲突解决 UI（用户自己 `git pull` 解决）
- 论文第一图自动提取（手动上传）

---

## Zotero 同步策略

- 手动触发（用户点击"同步"按钮）
- 自动每小时同步一次（APScheduler，per vault）
