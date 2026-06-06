#!/bin/bash
set -e

SERVER="ubuntu@43.156.12.203"
DOMAIN="research.hopeyuanxu.com"
EMAIL="mawxuanxuan@gmail.com"
APP_DIR="/home/ubuntu/researchbuddy"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== ResearchBuddy 部署脚本 ==="
echo ""

# ── 1. 同步文件到服务器 ──────────────────────────────────
echo "▶ [1/4] 同步项目文件到服务器..."
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
  --exclude='backend/projects/' \
  --exclude='backend/images/' \
  --exclude='.env' \
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"

echo "▶ 上传生产环境配置..."
scp "$LOCAL_DIR/.env.prod" "$SERVER:$APP_DIR/.env"

# ── 2. 服务器初始化 ──────────────────────────────────────
echo ""
echo "▶ [2/4] 服务器初始化（安装 Docker）..."
ssh "$SERVER" bash << 'SETUP'
set -e
if ! command -v docker &> /dev/null; then
  echo "安装 Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker ubuntu
  echo "Docker 安装完成，需要重新登录才能免 sudo 运行"
fi
echo "Docker 版本: $(sudo docker --version)"
SETUP

# ── 3. 申请 SSL 证书 ─────────────────────────────────────
echo ""
echo "▶ [3/4] 申请 Let's Encrypt SSL 证书..."
ssh "$SERVER" bash << CERTBOT
set -e
DOMAIN="$DOMAIN"
EMAIL="$EMAIL"

if [ -d "/etc/letsencrypt/live/\$DOMAIN" ]; then
  echo "证书已存在，跳过申请"
else
  echo "申请新证书..."
  # 用 certbot standalone 申请（此时 80 端口需空闲）
  sudo docker run --rm \
    -p 80:80 \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    certbot/certbot certonly --standalone \
    --email "\$EMAIL" --agree-tos --no-eff-email \
    -d "\$DOMAIN"
  echo "证书申请成功"
fi
CERTBOT

# ── 4. 启动服务 ──────────────────────────────────────────
echo ""
echo "▶ [4/4] 构建并启动所有服务..."
ssh "$SERVER" bash << DEPLOY
set -e
cd "$APP_DIR"

# 确保数据目录存在
mkdir -p backend/projects backend/images

# 启动（首次构建较慢，约 3-5 分钟）
sudo docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "等待服务就绪..."
sleep 10
sudo docker compose -f docker-compose.prod.yml ps
DEPLOY

echo ""
echo "========================================"
echo "✓ 部署完成！"
echo "  访问地址: https://$DOMAIN"
echo ""
echo "查看日志: ssh $SERVER 'cd $APP_DIR && sudo docker compose -f docker-compose.prod.yml logs -f'"
echo "========================================"
