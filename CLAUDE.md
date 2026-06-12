# ResearchBuddy — Agent 工作指南

研究团队协作平台。前端 Next.js，后端 FastAPI，数据存储在 SQLite + 每项目一个 git 裸仓库。

## 开发文档

- [docs/development/00-architecture.md](docs/development/00-architecture.md) — 架构、技术栈、API、项目 workspace 结构
- [docs/development/01-getting-started.md](docs/development/01-getting-started.md) — 本地启动、环境变量、代码结构、关键约定
- [docs/development/02-deployment.md](docs/development/02-deployment.md) — **部署和更新线上服务器**
- [docs/development/03-features.md](docs/development/03-features.md) — 功能模块说明
- [docs/development/03-git-workflow.md](docs/development/03-git-workflow.md) — Git 工作流 & 冲突处理
- [docs/development/04-data.md](docs/development/04-data.md) — **数据持久化，备份，不能乱动的路径**

## 关键约定（必读）

- **用户数据**（`backend/projects/`, `backend/images/`, `backend/db.sqlite3`）永远不通过 rsync 同步，不要在本地修改这些目录
- **Docker volumes** 必须挂载到 `/backend/...`（不是 `/app/...`），原因见 `docs/development/04-data.md`
- **容器重建后必须重启 nginx**：`sudo docker restart researchbuddy-nginx-1`
- **发布流程**：代码改完先 `git push`，再 `./update.sh`，最后重启 nginx

## 代码位置

```
backend/app/api/        路由层
backend/app/services/   业务逻辑
backend/app/models.py   数据库模型
backend/app/core/paths.py  ⭐ 项目仓库内所有路径常量
frontend/app/(app)/     主应用页面
frontend/components/    共享组件
frontend/lib/types.ts   TypeScript 类型定义
```
