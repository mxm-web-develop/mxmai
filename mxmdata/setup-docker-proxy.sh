#!/bin/bash
# Docker 代理配置脚本（适用于 Clash）

echo "🔧 配置 Docker 使用 Clash 代理..."

# Clash 默认端口
CLASH_HTTP_PORT=${CLASH_HTTP_PORT:-7890}
CLASH_SOCKS_PORT=${CLASH_SOCKS_PORT:-7891}

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "检测到 macOS 系统"
    echo ""
    echo "请手动配置 Docker Desktop:"
    echo "1. 打开 Docker Desktop"
    echo "2. 进入 Settings → Resources → Proxies"
    echo "3. 启用 Manual proxy configuration"
    echo "4. 配置以下代理:"
    echo ""
    echo "   Web Server (HTTP):"
    echo "     http://127.0.0.1:${CLASH_HTTP_PORT}"
    echo ""
    echo "   Secure Web Server (HTTPS):"
    echo "     http://127.0.0.1:${CLASH_HTTP_PORT}"
    echo ""
    echo "5. 点击 Apply & Restart"
    echo ""
    echo "或者使用环境变量方式（需要重启 Docker Desktop）:"
    echo ""
    echo "配置文件位置: ~/.docker/config.json"
    echo "内容:"
    echo '{'
    echo '  "proxies": {'
    echo '    "default": {'
    echo "      \"httpProxy\": \"http://127.0.0.1:${CLASH_HTTP_PORT}\","
    echo "      \"httpsProxy\": \"http://127.0.0.1:${CLASH_HTTP_PORT}\","
    echo '      "noProxy": "localhost,127.0.0.1"'
    echo '    }'
    echo '  }'
    echo '}'
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "检测到 Linux 系统"
    echo ""
    echo "配置 systemd Docker 服务代理..."
    
    PROXY_DIR="/etc/systemd/system/docker.service.d"
    PROXY_FILE="${PROXY_DIR}/http-proxy.conf"
    
    sudo mkdir -p "$PROXY_DIR"
    
    sudo tee "$PROXY_FILE" > /dev/null <<EOF
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:${CLASH_HTTP_PORT}"
Environment="HTTPS_PROXY=http://127.0.0.1:${CLASH_HTTP_PORT}"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF
    
    echo "✅ 代理配置已创建: $PROXY_FILE"
    echo ""
    echo "重启 Docker 服务..."
    sudo systemctl daemon-reload
    sudo systemctl restart docker
    
    echo "✅ Docker 已重启，代理配置已生效"
else
    echo "未识别的操作系统: $OSTYPE"
    exit 1
fi

echo ""
echo "🧪 测试代理连接..."
docker pull hello-world

if [ $? -eq 0 ]; then
    echo "✅ 代理配置成功！"
else
    echo "❌ 代理配置可能有问题，请检查 Clash 是否运行在端口 ${CLASH_HTTP_PORT}"
fi

