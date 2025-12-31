#!/bin/bash

# 测试 nano-banana 图片生成接口
# 用于验证是否是 Replicate 的敏感内容检查问题

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-your_token_here}"

echo "测试 nano-banana 图片生成..."
echo "Gateway: $GATEWAY_URL"
echo ""

# 测试 1: 简单的小猫提示词（与 Smartflow 中使用的相同）
echo "=== 测试 1: 小猫提示词 ==="
curl -X POST "$GATEWAY_URL/api/v1/cgi/graph/nano-banana" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一只可爱的小猫坐在窗台上，温馨、自然光",
    "parameters": {
      "aspect_ratio": "16:9",
      "image_size": "2K"
    }
  }' | jq '.'

echo ""
echo ""

# 测试 2: 更简单的提示词
echo "=== 测试 2: 简单风景 ==="
curl -X POST "$GATEWAY_URL/api/v1/cgi/graph/nano-banana" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a beautiful sunset over mountains",
    "parameters": {
      "aspect_ratio": "16:9"
    }
  }' | jq '.'

echo ""
echo ""

# 测试 3: 使用 formatter 输出的提示词（模拟 Smartflow 中的情况）
echo "=== 测试 3: Formatter 输出的提示词 ==="
curl -X POST "$GATEWAY_URL/api/v1/cgi/graph/nano-banana" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "当然，请提供您期望的主题和风格，我将为您生成详细的提示词。以下是一个示例格式，您可以根据需要进行修改：\n\n主题：自然风光  \n风格：超现实主义  \n细节：清晨的雾气笼罩在山谷之间，阳光透过树叶洒下斑驳的光影，远处的湖泊如镜子般反射着蓝天，生动的色彩和奇幻的元素交织在一起。  \n质量要求：hd",
    "parameters": {
      "aspect_ratio": "16:9",
      "image_size": "2K"
    }
  }' | jq '.'

echo ""
echo ""
echo "测试完成！"
echo ""
echo "如果所有测试都返回敏感内容错误，说明是 Replicate 平台的问题。"
echo "如果只有某些测试失败，可能是特定提示词触发了 Replicate 的安全检查。"
