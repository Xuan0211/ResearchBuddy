---
title: 部署指南
---

# 部署指南

## 服务器信息

| 项目 | 值 |
|---|---|
| 服务器 | `ubuntu@43.156.12.203` |
| 应用目录 | `/home/ubuntu/researchbuddy/` |
| 访问地址 | `https://research.hopeyuanxu.com` |
| compose 文件 | `docker-compose.prod.yml` |

---

## 日常代码更新

```bash
# 在项目根目录运行
./update.sh
```

脚本做了两件事：
1. `rsync` 把本地代码同步到服务器（跳过数据目录）
2. `docker compose up -d --build` 重新构建并重启服务

**完成后必须重启 nginx**（容器重建后 IP 会变，nginx 缓存旧 IP 导致 502）：

```bash
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

---

## 按需选择重建范围

```bash
# 只改了后端（Python/FastAPI）— 约 1 分钟
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && \
  sudo docker compose -f docker-compose.prod.yml up -d --build backend"

# 只改了前端（Next.js）— 约 3-4 分钟
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && \
  sudo docker compose -f docker-compose.prod.yml up -d --build frontend"

# 两者都改了
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && \
  sudo docker compose -f docker-compose.prod.yml up -d --build"

# 重建后都要重启 nginx
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

---

## rsync 排除的文件（永远不会覆盖）

| 路径 | 原因 |
|---|---|
| `backend/db.sqlite3` | 数据库 |
| `backend/projects/` | 研究项目 git 仓库 |
| `backend/images/` | 用户上传图片 |
| `.env` / `.env.prod` | 生产环境密钥 |
| `node_modules/`, `.next/`, `.venv/` | 构建产物 |

---

## 验证部署是否成功

```bash
ssh ubuntu@43.156.12.203 \
  "curl -sk --resolve research.hopeyuanxu.com:443:127.0.0.1 \
   https://research.hopeyuanxu.com/api/health"
# 应该返回: {"status":"ok","app":"ResearchBuddy"}
```

查看容器状态：
```bash
ssh ubuntu@43.156.12.203 "sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

---

## 查看日志

```bash
# 后端实时日志（Ctrl+C 退出）
ssh ubuntu@43.156.12.203 "sudo docker logs -f researchbuddy-backend-1"

# 最近 50 行
ssh ubuntu@43.156.12.203 "sudo docker logs --tail=50 researchbuddy-backend-1"

# 只看错误
ssh ubuntu@43.156.12.203 \
  "sudo docker logs researchbuddy-backend-1 2>&1 | grep -i 'error\|exception' | tail -20"
```

---

## 常见问题

### 502 Bad Gateway
```bash
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

### 容器崩溃 / 反复重启
```bash
ssh ubuntu@43.156.12.203 "sudo docker logs researchbuddy-backend-1 --tail=30"
```
常见原因：Python 语法错误、import 失败。

---

## 推代码 + 部署完整流程

```bash
git add -A
git commit -m "描述改动"
git push                    # 推到 GitHub

./update.sh                 # 同步并重建

ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"  # 重启 nginx
```

---

## 从零全新部署

```bash
./deploy.sh
```

会自动：安装 Docker → 申请 SSL 证书 → 启动所有服务。

SSL 证书每天凌晨 2 点自动检查续期。
