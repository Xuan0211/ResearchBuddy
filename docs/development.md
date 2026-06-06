---
title: 本地开发指南
---

# 本地开发指南

## 本地运行

```bash
# 后端（需要 Python 3.11+）
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端（新开一个终端）
cd frontend
npm install
npm run dev
```

访问 `http://localhost:3000`，API 在 `http://localhost:8000`。

---

## 环境变量

复制 `.env.example` 到 `.env` 并填写：

```
SECRET_KEY=任意随机字符串（本地开发随便填）
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google-drive/callback
```

生产环境密钥在 `.env.prod`（不提交到 git）。

---

## 代码结构

```
backend/
├── app/
│   ├── api/          路由处理器（auth, projects, papers, docs, git…）
│   ├── core/         配置、数据库、安全
│   ├── models.py     SQLModel 数据模型
│   └── services/     业务逻辑（git_service, project_fs, google_drive…）
├── Dockerfile
└── requirements.txt

frontend/
├── app/(app)/        登录后的页面
├── app/(auth)/       登录/注册页面
├── components/       共享组件（NotionEditor, PaperPeekPanel…）
└── lib/              API 客户端、类型定义
```

---

## 修完代码后更新到线上

```bash
git add -A
git commit -m "描述"
git push

./update.sh
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

详细部署流程见 [deployment](deployment)。

---

## 多 Agent 协作

多个 AI Agent 可以并行工作在这个代码库上。约定：

- 每个 Agent 在自己的 git 分支上工作，避免冲突
- 参考 `docs/` 文件夹了解系统架构和部署流程
- 后端改动：修改 `backend/app/` 下的文件，不要动 `backend/projects/`（用户数据）
- 数据库 schema 变更：修改 `backend/app/models.py`，同时更新 `backend/app/core/db.py` 的初始化逻辑
- 前端改动：修改 `frontend/` 下的文件，类型定义在 `frontend/lib/types.ts`

---

## API 文档

后端启动后访问 `http://localhost:8000/docs` 查看所有 API 端点（FastAPI 自动生成）。
