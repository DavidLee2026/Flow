#!/bin/bash
# =====================================================
# 绘心 Flow 一键部署脚本
# 用法: ./deploy_flow.sh
# 流程: 本地拉最新 → rsync 上传(保护 data/.env) → HUP 平滑重启
# 说明: 服务器端由宝塔 Python 项目管理器管理, 用 kill -HUP 零停机重载
# =====================================================
set -e

SERVER="root@YOUR_SERVER_IP"
REMOTE_APP="/www/wwwroot/leerobert.site/flow/app"
PID_FILE="/www/server/python_project/vhost/pids/绘心 Flow.pid"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "📦 [1/4] 拉取本地最新代码 (git pull)"
cd "$LOCAL_DIR"
git pull origin main

echo "📤 [2/4] 上传代码到服务器 (rsync, 保护 data/ 和 .env)"
rsync -avz --exclude=".git/" \
           --exclude="data/" \
           --exclude=".env" \
           --exclude="*.pid" \
           --exclude="logs/" \
           ./ "$SERVER:$REMOTE_APP/" | tail -5

echo "🔒 [3/4] 修复权限 (data/ 归 www 可写)"
ssh "$SERVER" "chown -R www:www $REMOTE_APP/data 2>/dev/null || true"

echo "🔄 [4/4] HUP 平滑重启 gunicorn (零停机)"
ssh "$SERVER" "MASTER=\$(cat '$PID_FILE'); if [ -n \"\$MASTER\" ] && kill -0 \$MASTER 2>/dev/null; then kill -HUP \$MASTER && echo 'HUP 已发送 (master '\$MASTER')'; else echo '⚠️ master 不在运行, 需在宝塔面板手动启动'; fi"

sleep 2
echo "✅ 部署完成. 验证:"
curl -sk -o /dev/null -w "  App 首页: %{http_code}\n" "https://leerobert.site/flow/app/"
curl -sk -o /dev/null -w "  api/stats: %{http_code}\n" "https://leerobert.site/flow/app/api/stats"
