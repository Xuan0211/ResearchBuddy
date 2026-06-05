#!/bin/bash
set -e

SERVER="ubuntu@43.156.12.203"
APP_DIR="/home/ubuntu/researchbuddy"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== ResearchBuddy 更新部署 ==="

echo "▶ [1/2] 同步代码到服务器..."
rsync -avz --delete \
  --exclude='.venv' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.DS_Store' \
  --exclude='.git' \
  --exclude='frontend/.git' \
  --exclude='backend/db.sqlite3' \
  --exclude='.env' \
  --exclude='.env.prod' \
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"

echo "▶ [2/2] 重新构建并重启服务..."
ssh "$SERVER" "cd $APP_DIR && sudo docker compose -f docker-compose.prod.yml up -d --build"

echo ""
echo "✓ 更新完成: https://research.hopeyuanxu.com"
