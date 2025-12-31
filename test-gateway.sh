#!/bin/bash

# Gateway 测试脚本

GATEWAY_URL="http://localhost:3000"
MXMAUTH_URL="http://localhost:4001"

echo "🧪 开始测试 Gateway 路由..."
echo ""

# 1. 测试 Gateway 健康检查
echo "1️⃣  测试 Gateway 健康检查"
curl -s "$GATEWAY_URL/health" | jq .
echo ""
echo ""

# 2. 测试 Gateway 根路径
echo "2️⃣  测试 Gateway 根路径"
curl -s "$GATEWAY_URL/" | jq .
echo ""
echo ""

# 3. 测试直接访问 mxmauth（对比）
echo "3️⃣  测试直接访问 mxmauth（对比）"
curl -s "$MXMAUTH_URL/health" | jq .
echo ""
echo ""

# 4. 测试通过 Gateway 访问 mxmauth 健康检查
echo "4️⃣  测试通过 Gateway 访问 mxmauth 健康检查"
curl -s "$GATEWAY_URL/api/v1/account/health" | jq .
echo ""
echo ""

# 5. 测试用户注册（不需要认证）
echo "5️⃣  测试用户注册（不需要认证）"
REGISTER_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/v1/account/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "gateway_test_user",
    "email": "gateway_test@example.com",
    "password": "test123456"
  }')
echo "$REGISTER_RESPONSE" | jq .
echo ""
echo ""

# 6. 测试用户登录（不需要认证）
echo "6️⃣  测试用户登录（不需要认证）"
LOGIN_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/v1/account/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "gateway_test_user",
    "password": "test123456"
  }')
echo "$LOGIN_RESPONSE" | jq .

# 提取 token
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.tokens.accessToken // .data.accessToken // empty')
echo ""
echo ""

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ 登录失败，无法获取 token"
  exit 1
fi

echo "✅ 获取到 Token: ${TOKEN:0:50}..."
echo ""
echo ""

# 7. 测试获取用户信息（需要认证）
echo "7️⃣  测试获取用户信息（需要认证）"
curl -s "$GATEWAY_URL/api/v1/account/profile" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo ""
echo ""

# 8. 测试未认证访问（应该返回 401）
echo "8️⃣  测试未认证访问（应该返回 401）"
curl -s "$GATEWAY_URL/api/v1/account/profile" | jq .
echo ""
echo ""

echo "✅ 测试完成！"

