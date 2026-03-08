#!/bin/bash

# Sora 2 Deer 视频生成测试脚本
# 测试 sora-2-deer 模型（带参考图片）

# 配置
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-3f6cf0d7-1ac5-44eb-835b-5a59ec973909}"
TOKEN="${TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzZjZjZjBkNy0xYWM1LTQ0ZWItODM1Yi01YTU5ZWM5NzM5MDkiLCJ1c2VybmFtZSI6Im14bW1vYmlsZSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NjkxMzIwOTMsImV4cCI6MTc2OTE4OTY5M30.hVoAW16aKidi4UNfuL6CqTmPgwq4MmE7zedxeguYaiA}"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_PATH="$SCRIPT_DIR/test4.jpg"

echo "🎬 Sora 2 Deer 视频生成测试"
echo "================================"
echo ""

# 检查图片文件是否存在
if [ ! -f "$IMAGE_PATH" ]; then
  echo "❌ 错误: 找不到参考图片文件: $IMAGE_PATH"
  exit 1
fi

echo "📸 读取参考图片: $IMAGE_PATH"
# 将图片转换为 base64
IMAGE_BASE64=$(base64 -i "$IMAGE_PATH")
IMAGE_DATA_URI="data:image/jpeg;base64,$IMAGE_BASE64"


# 构建请求 JSON（使用 jq 来构建，确保 JSON 格式正确）
REQUEST_JSON=$(jq -n \
  --arg prompt "云南少数民族火把节仪式，火把节现场热闹非凡，人们载歌载舞，欢声笑语，火把节现场热闹非凡，人们载歌载舞，欢声笑语" \
  --arg seconds "15" \
  --arg size "1280x720" \
  --arg input_reference "$IMAGE_DATA_URI" \
  '{
    prompt: $prompt,
    seconds: $seconds,
    size: $size,
    input_reference: $input_reference,
    storeToMinio: true
  }')

echo "📝 测试: sora-2-deer（带参考图片）"
echo ""
echo "🚀 发送请求到: $GATEWAY_URL/api/v1/cgi/video/sora-2-deer"
echo "请求参数:"
echo "$REQUEST_JSON" | jq .
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/v1/cgi/video/sora-2-deer" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$REQUEST_JSON")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "📋 响应状态码: $HTTP_CODE"
echo "📋 响应内容:"
if command -v jq &> /dev/null; then
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
  echo "$BODY"
fi
echo ""

# 检查响应状态码
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ 请求失败，状态码: $HTTP_CODE"
  echo "请检查错误信息"
  exit 1
fi

# 提取 taskId（尝试多种可能的路径）
TASK_ID=$(echo "$BODY" | jq -r '.data.taskId // .taskId // .data.id // empty' 2>/dev/null)

# 如果 jq 失败，尝试用 grep 提取
if [ -z "$TASK_ID" ] || [ "$TASK_ID" == "null" ]; then
  # 尝试从原始响应中提取 taskId
  TASK_ID=$(echo "$BODY" | grep -o '"taskId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "null" ] && [ "$TASK_ID" != "" ]; then
  echo "✅ 任务已创建"
  echo "📌 Task ID: $TASK_ID"
  echo ""
  echo "💡 提示："
  echo "   - 查询任务状态: curl -X GET \"$GATEWAY_URL/api/v1/tasks/$TASK_ID\" -H \"x-user-id: $USER_ID\" -H \"Authorization: Bearer $TOKEN\""
  echo "   - 任务完成后，视频 URL 会在 task.result.mediaUrls 中"
  echo ""
  echo "🔍 快速查询命令："
  echo "   curl -s -X GET \"$GATEWAY_URL/api/v1/tasks/$TASK_ID\" -H \"x-user-id: $USER_ID\" -H \"Authorization: Bearer $TOKEN\" | jq ."
else
  echo "⚠️  未能获取 Task ID"
  echo ""
  echo "🔍 调试信息："
  echo "   - 响应状态码: $HTTP_CODE"
  echo "   - 响应体长度: $(echo -n "$BODY" | wc -c) 字节"
  echo "   - 是否包含 'taskId': $(echo "$BODY" | grep -q "taskId" && echo "是" || echo "否")"
  echo "   - 是否包含 'success': $(echo "$BODY" | grep -q "success" && echo "是" || echo "否")"
  echo ""
  echo "请检查响应内容以确定问题"
fi

echo ""
echo "================================"
echo "✅ 测试完成"
echo ""
