#!/bin/bash
# =====================================================
# 绘心 Flow 一键部署脚本（公开模板 · 不含真实服务器信息）
# 用法: 1) 创建私有配置 .deploy.local.env（已 gitignore，不提交）：
#         FLOW_SERVER=root@你的服务器IP
#         FLOW_REMOTE_APP=/www/wwwroot/你的域名/flow/app
#         FLOW_PID_FILE=/www/server/python_project/vhost/pids/绘心 Flow.pid
#         FLOW_SITE_URL=https://你的域名/flow/app
#      2) ./deploy_flow.sh
# 流程: 本地拉最新 → rsync 上传(保护 data/.env) → HUP 平滑重启
# 说明: 服务器端由宝塔 Python 项目管理器管理, 用 kill -HUP 零停机重载
# =====================================================
set -e

LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 加载本地私有配置（若存在 .deploy.local.env）────────
if [ -f "$LOCAL_DIR/.deploy.local.env" ]; then
  set -a
  source "$LOCAL_DIR/.deploy.local.env"
  set +a
fi

# 必填变量检查（未配置时报错并给出提示）
: "${FLOW_SERVER:?未配置 FLOW_SERVER：请创建 .deploy.local.env 或设置环境变量，格式 root@你的服务器IP}"
: "${FLOW_REMOTE_APP:?未配置 FLOW_REMOTE_APP：请设置服务器应用绝对路径}"
: "${FLOW_PID_FILE:?未配置 FLOW_PID_FILE：请设置 gunicorn PID 文件路径}"
: "${FLOW_SITE_URL:?未配置 FLOW_SITE_URL：请设置线上验证地址，如 https://你的域名/flow/app}"

SERVER="$FLOW_SERVER"
REMOTE_APP="$FLOW_REMOTE_APP"
PID_FILE="$FLOW_PID_FILE"
SITE_URL="$FLOW_SITE_URL"

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
curl -sk -o /dev/null -w "  App 首页: %{http_code}\n" "$SITE_URL/"
curl -sk -o /dev/null -w "  api/stats: %{http_code}\n" "$SITE_URL/api/stats"
