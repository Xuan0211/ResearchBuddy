---
name: deploy
description: >
  ResearchBuddy 生产环境部署指南。当用户想要把本地代码更新同步到云端服务器、
  问"怎么更新部署"、"怎么部署到服务器"、"update.sh 怎么用"、"服务器数据会丢吗"、
  "怎么备份数据"、"部署之后出错了怎么办"时，使用此 skill。
  也在用户修完 bug 或新增功能、准备推到线上时主动提醒使用。
---

# ResearchBuddy 部署 Skill

## 服务器信息

| 项目 | 值 |
|---|---|
| 服务器 | `ubuntu@43.156.12.203` |
| 应用目录 | `/home/ubuntu/researchbuddy/` |
| 访问地址 | `https://research.hopeyuanxu.com` |
| compose 文件 | `docker-compose.prod.yml` |

---

## 一、日常代码更新（最常用）

```bash
# 在项目根目录运行
./update.sh
```

这个命令做了两件事：
1. `rsync` 把本地代码同步到服务器（自动跳过数据目录）
2. `docker compose up -d --build` 重新构建并重启服务

**完成后需要手动重启 nginx**（因为容器重建后 IP 会变）：

```bash
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

> 💡 **什么时候不需要重启 nginx？** 只有容器 IP 没变时（即没有重建容器，只是重启）。
> 实际上每次 `--build` 都会重建，所以养成习惯每次都重启 nginx 最省事。

---

## 二、按需选择重建范围

只改了后端代码时，不需要重建前端（前端构建很慢，约 3 分钟）：

```bash
# 只改了后端（Python/FastAPI）
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && sudo docker compose -f docker-compose.prod.yml up -d --build backend"

# 只改了前端（Next.js/React）
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && sudo docker compose -f docker-compose.prod.yml up -d --build frontend"

# 两者都改了（或者用 update.sh）
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && sudo docker compose -f docker-compose.prod.yml up -d --build"
```

重建完成后都要重启 nginx：
```bash
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

---

## 三、哪些文件会被同步，哪些不会

`update.sh` 使用 `rsync --delete`（服务器上多余的文件会被删除），但以下路径**永远不会被覆盖**：

| 排除路径 | 原因 |
|---|---|
| `backend/db.sqlite3` | 数据库，存储用户账号和项目元数据 |
| `backend/projects/` | 每个研究项目的 git 仓库（文档、论文内容） |
| `backend/images/` | 用户上传的图片 |
| `.env` / `.env.prod` | 生产环境密钥 |
| `node_modules/`, `.next/`, `.venv/` | 构建产物，不需要传输 |

> ⚠️ **重要**：这三个数据目录在服务器上是持久化挂载卷（`/backend/projects` 等），容器重建不会丢失数据。但如果手动修改 `docker-compose.prod.yml` 里的 volumes 路径，会导致数据丢失。

---

## 四、部署前备份数据（推荐在重大改动前执行）

```bash
# 备份数据库
ssh ubuntu@43.156.12.203 "cp /home/ubuntu/researchbuddy/backend/db.sqlite3 /home/ubuntu/researchbuddy/backend/db.sqlite3.bak"

# 备份所有项目 repo（通常不需要，除非做了结构性改动）
ssh ubuntu@43.156.12.203 "tar -czf /home/ubuntu/backup-projects-\$(date +%Y%m%d).tar.gz -C /home/ubuntu/researchbuddy/backend projects/"
```

把数据库拉到本地（可选）：
```bash
scp ubuntu@43.156.12.203:/home/ubuntu/researchbuddy/backend/db.sqlite3 ./backend/db.sqlite3.bak
```

---

## 五、查看日志（排查问题）

```bash
# 后端实时日志（最常用）
ssh ubuntu@43.156.12.203 "sudo docker logs -f researchbuddy-backend-1"

# 后端最近 50 行
ssh ubuntu@43.156.12.203 "sudo docker logs --tail=50 researchbuddy-backend-1"

# 所有服务日志
ssh ubuntu@43.156.12.203 "cd /home/ubuntu/researchbuddy && sudo docker compose -f docker-compose.prod.yml logs -f"

# 只看错误
ssh ubuntu@43.156.12.203 "sudo docker logs researchbuddy-backend-1 2>&1 | grep -i 'error\|exception\|traceback' | tail -30"
```

按 `Ctrl+C` 退出实时日志。

---

## 六、部署后常见问题排查

### 出现 502 Bad Gateway
nginx 缓存了旧容器 IP，重启 nginx 解决：
```bash
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

### 容器没起来 / 一直 Restarting
查看启动日志找原因：
```bash
ssh ubuntu@43.156.12.203 "sudo docker logs researchbuddy-backend-1 --tail=30"
```
常见原因：Python 语法错误、import 失败、端口冲突。

### 验证服务是否正常
```bash
ssh ubuntu@43.156.12.203 "curl -sk --resolve research.hopeyuanxu.com:443:127.0.0.1 https://research.hopeyuanxu.com/api/health"
# 正常应该返回: {"status":"ok","app":"ResearchBuddy"}
```

### 查看所有容器状态
```bash
ssh ubuntu@43.156.12.203 "sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

---

## 七、同步代码到 GitHub

每次修完代码，建议先提交到 GitHub 再部署：

```bash
git add -A
git commit -m "描述改动"
git push

# 然后再部署
./update.sh
ssh ubuntu@43.156.12.203 "sudo docker restart researchbuddy-nginx-1"
```

---

## 八、完整部署流程速查（从头部署新服务器）

如果需要在新服务器上部署（或完全重置），运行：
```bash
./deploy.sh
```

这个脚本会：
1. rsync 同步文件
2. 上传 `.env.prod` 到服务器的 `.env`
3. 安装 Docker（如果没有）
4. 申请 Let's Encrypt SSL 证书
5. 启动所有服务

SSL 证书自动续期已配置（每天凌晨 2 点检查）。

---

## 九、关键路径速查

| 本地路径 | 服务器路径 | 说明 |
|---|---|---|
| `backend/` | `/home/ubuntu/researchbuddy/backend/` | 后端代码 |
| `frontend/` | `/home/ubuntu/researchbuddy/frontend/` | 前端代码 |
| `nginx/nginx.conf` | `/home/ubuntu/researchbuddy/nginx/nginx.conf` | Nginx 配置 |
| `docker-compose.prod.yml` | `/home/ubuntu/researchbuddy/docker-compose.prod.yml` | 生产 compose |
| *(不同步)* | `/home/ubuntu/researchbuddy/backend/db.sqlite3` | 数据库 |
| *(不同步)* | `/home/ubuntu/researchbuddy/backend/projects/` | 项目 git repos |
| *(不同步)* | `/home/ubuntu/researchbuddy/backend/images/` | 上传图片 |
