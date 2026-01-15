#!/bin/bash

# 测试参考图上传功能
# 使用 nvhai.png 作为 main-subject，beijing.png 作为 background

cd "$(dirname "$0")"

# 检查图片文件是否存在
if [ ! -f "nvhai.png" ] || [ ! -f "beijing.png" ]; then
  echo "错误: 找不到图片文件 nvhai.png 或 beijing.png"
  exit 1
fi

# 将图片转换为 base64
echo "正在读取图片文件..."
NVHAI_BASE64=$(base64 -i nvhai.png)
BEIJING_BASE64=$(base64 -i beijing.png)

# 构建请求 JSON
cat > /tmp/graph-request-test.json << EOF
{
  "type": "portrait",
  "prompt": "街拍",
  "style": "modern",
  "tone": "warm",
  "environment": "indoor",
  "makeup": "natural",
  "pose": "standing",
  "lighting": "soft",
  "quality": "high",
  "aspect_ratio": "16:9",
  "referenceImage": [
    {
      "content": "data:image/png;base64,${NVHAI_BASE64}",
      "type": "main-subject"
    },
    {
      "content": "data:image/png;base64,${BEIJING_BASE64}",
      "type": "background"
    }
  ]
}
EOF

echo "请求文件已创建: /tmp/graph-request-test.json"
echo "文件大小: $(wc -c < /tmp/graph-request-test.json) 字节"
echo ""
echo "发送请求到: http://localhost:3000/api/v1/cgi/graph/photograph"
echo ""

# JWT Token (从用户提供)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzZjZjZjBkNy0xYWM1LTQ0ZWItODM1Yi01YTU5ZWM5NzM5MDkiLCJ1c2VybmFtZSI6Im14bW1vYmlsZSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3Njg0NDA4ODIsImV4cCI6MTc2ODQ5ODQ4Mn0.LMfQsadF1wQnlxAKinx1hIB9_aO9yEQArC1XLSva9dE"

# 发送请求
echo "正在发送请求..."
curl -X POST http://localhost:3000/api/v1/cgi/graph/photograph \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-user-id: 3f6cf0d7-1ac5-44eb-835b-5a59ec973909" \
  -d @/tmp/graph-request-test.json \
  -w "\n\nHTTP Status: %{http_code}\n" \
  | jq '.' 2>/dev/null || cat

echo ""
echo "请求已发送！请检查返回的 taskId，然后查询任务状态。"
