#!/bin/bash

# Sora 视频生成示例（使用参考图）
# 使用方式：bash example_request.sh

GATEWAY_URL="http://localhost:3000"
USER_ID="14da3555-7981-4df4-ac8a-4f6d39513022"
IMAGE_PATH="mxmcgi/src/test/generated_images/flux-kontext-fast/text-to-image-1765354011437-x47loix-1.png"

# 检查图片是否存在
if [ ! -f "$IMAGE_PATH" ]; then
    echo "❌ 图片文件不存在: $IMAGE_PATH"
    echo "请修改 IMAGE_PATH 变量指向正确的图片路径"
    exit 1
fi

echo "📷 读取参考图片: $IMAGE_PATH"

# 将图片转换为 base64（macOS/Linux 通用）
if command -v base64 &> /dev/null; then
    # 使用 base64 命令
    IMAGE_BASE64=$(base64 -i "$IMAGE_PATH" 2>/dev/null || base64 "$IMAGE_PATH")
    IMAGE_BASE64="data:image/png;base64,$IMAGE_BASE64"
elif command -v python3 &> /dev/null; then
    # 使用 Python 转换
    IMAGE_BASE64=$(python3 -c "import base64; print('data:image/png;base64,' + base64.b64encode(open('$IMAGE_PATH', 'rb').read()).decode())")
else
    echo "❌ 需要 base64 命令或 Python3 来转换图片"
    exit 1
fi

echo "✅ 图片已转换为 base64（大小: $(echo -n "$IMAGE_BASE64" | wc -c | xargs) 字符）"
echo ""

# 构建请求 JSON
REQUEST_JSON=$(cat <<EOF
{
  "prompt": "科幻电影风格，高清，蓝色霓虹灯光，未来城市天际线。场景：高空天台，夜晚俯瞰霓虹城市。角色A：未来战士女性，银色短发，穿高科技作战服。角色B：男性AI伙伴，holographic投影，半透明蓝色。[00:00-00:04] 广角静态镜头，天台全景，两人站在边缘，风吹动头发。背景音：低沉电子合成音乐，远处飞行车嗡嗡声，风声。[00:04-00:08] 中景推近，两人面对面。台词：角色A（坚定）：\"我们必须关闭核心。\" 角色B（电子声，平静）：\"风险很高，但我是为你而存在的。\" 音效：全息投影闪烁的电子音，风中金属旗杆碰撞声。背景音：电子音乐渐强，城市低频嗡鸣。",
  "seconds": "8",
  "size": "720x1280",
  "input_reference": "$IMAGE_BASE64",
  "storeToMinio": true
}
EOF
)

echo "🚀 发送请求到: $GATEWAY_URL/api/v1/cgi/video/sora-2-pro"
echo ""

# 发送请求
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/v1/cgi/video/sora-2-pro" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d "$REQUEST_JSON")

# 分离响应体和状态码
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "📋 响应状态码: $HTTP_CODE"
echo "📋 响应内容:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

# 提取任务 ID
TASK_ID=$(echo "$BODY" | jq -r '.data.taskId' 2>/dev/null)

if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "null" ]; then
    echo "✅ 任务创建成功！"
    echo "📝 任务 ID: $TASK_ID"
    echo "🔗 查询任务状态:"
    echo "   curl -H \"x-user-id: $USER_ID\" $GATEWAY_URL/api/v1/cgi-tasks/$TASK_ID"
    echo ""
    echo "💡 或者使用 jq 格式化输出:"
    echo "   curl -s -H \"x-user-id: $USER_ID\" $GATEWAY_URL/api/v1/cgi-tasks/$TASK_ID | jq '.'"
else
    echo "⚠️  未能提取任务 ID，请检查响应内容"
fi
