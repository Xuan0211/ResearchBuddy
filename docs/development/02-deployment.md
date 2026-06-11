---
title: 部署指南
---

# 部署指南

## 服务器信息

| 项目 | 值 |
|---|---|
| 服务器 | `ubuntu@43.163.8.22` |
| 应用目录 | `/home/ubuntu/researchbuddy/` |
| 访问地址 | `https://research.arklab-hkustgz.com` |
| compose 文件 | `docker-compose.prod.yml` |

---

## 日常代码更新

```bash
git add -A && git commit -m "描述改动" && git push

./update.sh

ssh ubuntu@43.163.8.22 "sudo docker restart researchbuddy-nginx-1"
```

`update.sh` 做了两件事：
1. `rsync` 把本地代码同步到服务器（跳过数据目录）
2. `docker compose up -d --build` 重新构建并重启服务

**完成后必须重启 nginx**（容器重建后 IP 会变，nginx 缓存旧 IP 导致 502）。

---

## 按需选择重建范围

```bash
# 只改了后端（Python/FastAPI）— 约 1 分钟
ssh ubuntu@43.163.8.22 "cd /home/ubuntu/researchbuddy && \
  sudo docker compose -f docker-compose.prod.yml up -d --build backend"

# 只改了前端（Next.js）— 约 3-4 分钟
ssh ubuntu@43.163.8.22 "cd /home/ubuntu/researchbuddy && \
  sudo docker compose -f docker-compose.prod.yml up -d --build frontend"

# 两者都改了
ssh ubuntu@43.163.8.22 "cd /home/ubuntu/researchbuddy && \
  sudo docker compose -f docker-compose.prod.yml up -d --build"

# 重建后都要重启 nginx
ssh ubuntu@43.163.8.22 "sudo docker restart researchbuddy-nginx-1"
```

---

## rsync 排除的文件（永远不会覆盖）

| 路径 | 原因 |
|---|---|
| `backend/db.sqlite3` | 数据库 |
| `backend/*.sqlite3*` | 数据库及手动备份 |
| `backend/projects/` | 研究项目 git 仓库 |
| `backend/images/` | 用户上传图片 |
| `.env` / `.env.prod` | 生产环境密钥 |
| `node_modules/`, `.next/`, `.venv/` | 构建产物 |

---

## 验证部署是否成功

```bash
ssh ubuntu@43.163.8.22 \
  "curl -sk https://research.arklab-hkustgz.com/api/health"
# 应该返回: {"status":"ok","app":"ResearchBuddy"}
```

查看容器状态：
```bash
ssh ubuntu@43.163.8.22 "sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

---

## 查看日志

```bash
# 后端实时日志（Ctrl+C 退出）
ssh ubuntu@43.163.8.22 "sudo docker logs -f researchbuddy-backend-1"

# 最近 50 行
ssh ubuntu@43.163.8.22 "sudo docker logs --tail=50 researchbuddy-backend-1"

# 只看错误
ssh ubuntu@43.163.8.22 \
  "sudo docker logs researchbuddy-backend-1 2>&1 | grep -i 'error\|exception' | tail -20"
```

---

## 常见问题

### 502 Bad Gateway
```bash
ssh ubuntu@43.163.8.22 "sudo docker restart researchbuddy-nginx-1"
```

### 容器崩溃 / 反复重启
```bash
ssh ubuntu@43.163.8.22 "sudo docker logs researchbuddy-backend-1 --tail=30"
```
常见原因：Python 语法错误、import 失败、`db.sqlite3` 被 Docker 创建成目录（见下）。

### db.sqlite3 被创建成目录
首次部署时如果数据库文件不存在，Docker bind mount 会把挂载点创建成目录：
```bash
ssh ubuntu@43.163.8.22 "
  cd /home/ubuntu/researchbuddy
  sudo docker compose -f docker-compose.prod.yml stop backend
  sudo rmdir backend/db.sqlite3          # 删掉错误的目录
  touch backend/db.sqlite3               # 创建空文件
  sudo docker compose -f docker-compose.prod.yml up -d --force-recreate backend
"
```

---

## SSL 证书

证书保存在服务器 `/etc/letsencrypt/live/research.arklab-hkustgz.com/`，到期日 2026-09-09。

手动续期：
```bash
ssh ubuntu@43.163.8.22 "sudo docker run --rm \
  -p 80:80 \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/lib/letsencrypt:/var/lib/letsencrypt \
  certbot/certbot renew --standalone"
```

---

## 从零全新部署（新服务器）

```bash
./deploy.sh
```

会自动：安装 Docker → 上传 `.env.prod` → 申请 SSL 证书 → 构建并启动所有服务。

**注意**：申请证书前，需确认域名 DNS A 记录已指向目标服务器，且 Cloudflare 代理已关闭（灰色云）。
