# ResearchBuddy — Agent 工作指南

ResearchBuddy 是一个研究团队协作平台。前端 Next.js，后端 FastAPI，数据存储在 SQLite + 每项目一个 git 裸仓库。

## 文档

开发相关文档在 `docs/` 文件夹：

- `docs/index.md` — 项目概览 + 文档目录
- `docs/deployment.md` — **部署和更新线上服务器**
- `docs/data.md` — **数据持久化，备份，不能乱动的路径**
- `docs/development.md` — 本地开发工作流

## 关键约定

- 用户数据（`backend/projects/`, `backend/images/`, `backend/db.sqlite3`）永远不通过 rsync 同步，不要在本地修改这些目录
- Docker volumes 必须挂载到 `/backend/...`（不是 `/app/...`），原因见 `docs/data.md`
- 每次重建容器后都要重启 nginx：`sudo docker restart researchbuddy-nginx-1`
- 代码改完先 `git push`，再 `./update.sh`

## 代码位置

```
backend/app/api/        路由层
backend/app/services/   业务逻辑
backend/app/models.py   数据库模型
frontend/app/(app)/     主应用页面
frontend/components/    共享组件
frontend/lib/types.ts   TypeScript 类型定义
```
