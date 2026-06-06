---
title: 数据持久化与备份
---

# 数据持久化与备份

## 数据存储位置

ResearchBuddy 的所有用户数据在服务器上存储在三个路径，通过 Docker bind mount 挂载：

| 服务器路径 | 容器内路径 | 内容 |
|---|---|---|
| `/home/ubuntu/researchbuddy/backend/db.sqlite3` | `/backend/db.sqlite3` | 用户账号、项目元数据、成员关系 |
| `/home/ubuntu/researchbuddy/backend/projects/` | `/backend/projects/` | 每个研究项目的裸 git 仓库（文档、论文等） |
| `/home/ubuntu/researchbuddy/backend/images/` | `/backend/images/` | 用户上传的图片 |

> ⚠️ **重要**：容器重建（`docker compose up --build`）不会丢失这些数据，因为它们是宿主机 bind mount，不在容器内部。

---

## 为什么不能改 docker-compose.prod.yml 的 volumes 路径

`config.py` 在 Docker 容器里计算出的 `BASE_DIR = /`，所以数据路径是 `/backend/...`（容器内）。
`docker-compose.prod.yml` 里的 volumes 必须挂载到 `/backend/...`：

```yaml
volumes:
  - ./backend/db.sqlite3:/backend/db.sqlite3   ← 正确
  - ./backend/projects:/backend/projects        ← 正确
  - ./backend/images:/backend/images            ← 正确
```

如果改成 `/app/...`，数据就存在容器内部，重建后丢失。

---

## 备份

```bash
# 备份数据库
ssh ubuntu@43.156.12.203 \
  "cp /home/ubuntu/researchbuddy/backend/db.sqlite3 \
      /home/ubuntu/researchbuddy/backend/db.sqlite3.bak"

# 打包所有项目 repo
ssh ubuntu@43.156.12.203 \
  "tar -czf /home/ubuntu/backup-\$(date +%Y%m%d).tar.gz \
   -C /home/ubuntu/researchbuddy/backend projects/ images/"

# 把数据库拉到本地
scp ubuntu@43.156.12.203:/home/ubuntu/researchbuddy/backend/db.sqlite3 \
    ./backend/db.sqlite3.bak
```

---

## 从容器内紧急导出数据

如果宿主机挂载出问题，数据可能还在容器内，可以用 `docker cp` 导出：

```bash
# 导出数据库
sudo docker cp researchbuddy-backend-1:/backend/db.sqlite3 /home/ubuntu/db_emergency.sqlite3

# 导出项目 repos
sudo docker cp researchbuddy-backend-1:/backend/projects /home/ubuntu/projects_emergency/
```

---

## rsync 部署不会覆盖数据

`update.sh` 和 `deploy.sh` 的 rsync 命令都明确排除了数据目录：

```bash
--exclude='backend/db.sqlite3'
--exclude='backend/projects/'
--exclude='backend/images/'
```

只有代码文件会被同步，数据文件永远不从本地同步到服务器。
