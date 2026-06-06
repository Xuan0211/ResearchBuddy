---
title: ResearchBuddy 文档中心
---

# ResearchBuddy 文档

本目录是 ResearchBuddy 开发与运维的文档中心，供开发者和 AI Agent 协作参考。

## 文档列表

| 文档 | 说明 |
|---|---|
| [deployment](deployment) | 生产环境部署、更新、回滚 |
| [data](data) | 数据持久化、备份、恢复 |
| [development](development) | 本地开发环境搭建与工作流 |

## 项目概览

**技术栈**
- 前端：Next.js 16 (App Router) + Tailwind CSS + Tiptap 编辑器
- 后端：FastAPI + SQLModel + SQLite + GitPython
- 部署：Docker Compose + Nginx + Let's Encrypt
- 托管：腾讯云 Ubuntu `43.156.12.203`，域名 `research.hopeyuanxu.com`

**代码仓库**：https://github.com/Xuan0211/ResearchBuddy

**核心架构**：每个研究项目在服务器上是一个裸 git 仓库（`/backend/projects/<uuid>.git`），
通过 git smart HTTP 协议提供 clone/push/pull，认证使用用户的 ResearchBuddy 账号密码。
