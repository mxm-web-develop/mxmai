#!/bin/bash

# Character模块API测试脚本
# 使用说明：
# 1. 确保gateway和mxmcgi服务已启动
# 2. 确保已创建数据库表（运行数据库迁移）
# 3. 准备一个有效的JWT token（通过登录获取）
# 4. 运行: bash test-character-api.sh

set -e

# 配置
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
MXMCGI_URL="${MXMCGI_URL:-http://localhost:4003}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 提示输入JWT token
echo -e "${YELLOW}请输入JWT token（从登录接口获取）:${NC}"
read -r JWT_TOKEN

if [ -z "$JWT_TOKEN" ]; then
  echo -e "${RED}错误: JWT token不能为空${NC}"
  exit 1
fi

# 从token中提取userId（简单解析，实际应该使用jwt库）
USER_ID=$(echo "$JWT_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | grep -o '"userId":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -z "$USER_ID" ]; then
  echo -e "${YELLOW}警告: 无法从token中提取userId，将使用测试ID${NC}"
  USER_ID="test-user-id"
fi

echo -e "${GREEN}开始测试Character API...${NC}\n"

# 测试计数器
PASSED=0
FAILED=0

# 测试函数
test_api() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4
  local expected_status=${5:-200}
  
  echo -e "\n${YELLOW}测试: $name${NC}"
  echo "请求: $method $url"
  
  if [ -n "$data" ]; then
    echo "数据: $data"
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $JWT_TOKEN" \
      -d "$data")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $JWT_TOKEN")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  echo "HTTP状态码: $http_code"
  echo "响应: $body"
  
  if [ "$http_code" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    PASSED=$((PASSED + 1))
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    return 0
  else
    echo -e "${RED}✗ 失败 (期望状态码: $expected_status, 实际: $http_code)${NC}"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# 存储创建的character ID
CHARACTER_ID=""

echo -e "\n${GREEN}========== 测试1: 创建角色（手动创建）==========${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/v1/characters" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "name": "测试角色",
    "display_name": "测试角色显示名",
    "description": "这是一个测试角色",
    "attributes": {
      "age": "25",
      "appearance": "高个子，黑发，蓝色眼睛",
      "voice_description": "温和的男声",
      "personality": "开朗、友善"
    },
    "category": "test",
    "tags": ["测试", "角色"]
  }')

echo "$CREATE_RESPONSE" | jq '.'
CHARACTER_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$CHARACTER_ID" ] || [ "$CHARACTER_ID" = "null" ]; then
  echo -e "${RED}错误: 无法获取创建的character ID${NC}"
  exit 1
fi

echo -e "${GREEN}创建的Character ID: $CHARACTER_ID${NC}"

echo -e "\n${GREEN}========== 测试2: 获取角色列表${NC}"
test_api "获取角色列表" "GET" "$GATEWAY_URL/api/v1/characters"

echo -e "\n${GREEN}========== 测试3: 按hasProfileImages筛选${NC}"
test_api "筛选有图片的角色" "GET" "$GATEWAY_URL/api/v1/characters?hasProfileImages=false"

echo -e "\n${GREEN}========== 测试4: 获取角色详情${NC}"
test_api "获取角色详情" "GET" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID"

echo -e "\n${GREEN}========== 测试5: 更新角色${NC}"
test_api "更新角色" "PUT" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID" '{
  "description": "更新后的描述",
  "reference_image_url": "https://example.com/image.jpg",
  "has_profile_images": true
}'

echo -e "\n${GREEN}========== 测试6: 验证布尔字段自动更新${NC}"
UPDATED_CHARACTER=$(curl -s -X GET "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")
HAS_IMAGES=$(echo "$UPDATED_CHARACTER" | jq -r '.data.has_profile_images // false')

if [ "$HAS_IMAGES" = "true" ]; then
  echo -e "${GREEN}✓ 布尔字段自动更新成功${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗ 布尔字段未自动更新（期望: true, 实际: $HAS_IMAGES）${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${GREEN}========== 测试7: 关联图片任务（需要先有一个graph任务ID）${NC}"
echo -e "${YELLOW}提示: 此测试需要先创建一个graph任务，获取taskId${NC}"
echo -e "${YELLOW}如果需要测试，请先创建graph任务，然后替换下面的TASK_ID${NC}"
# test_api "关联图片任务" "POST" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID/link-image-task" '{"taskId": "YOUR_GRAPH_TASK_ID"}'

echo -e "\n${GREEN}========== 测试8: 关联音频任务${NC}"
echo -e "${YELLOW}提示: 此测试需要先创建一个audio任务，获取taskId${NC}"
# test_api "关联音频任务" "POST" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID/link-audio-task" '{"taskId": "YOUR_AUDIO_TASK_ID"}'

echo -e "\n${GREEN}========== 测试9: 关联视频任务${NC}"
echo -e "${YELLOW}提示: 此测试需要先创建一个video任务，获取taskId${NC}"
# test_api "关联视频任务" "POST" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID/link-video-task" '{"taskId": "YOUR_VIDEO_TASK_ID"}'

echo -e "\n${GREEN}========== 测试10: 删除角色${NC}"
test_api "删除角色" "DELETE" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID" "" 200

echo -e "\n${GREEN}========== 测试11: 验证角色已删除${NC}"
test_api "验证角色已删除" "GET" "$GATEWAY_URL/api/v1/characters/$CHARACTER_ID" "" 404

# 测试总结
echo -e "\n${GREEN}========== 测试总结 ==========${NC}"
echo -e "${GREEN}通过: $PASSED${NC}"
echo -e "${RED}失败: $FAILED${NC}"
TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
  SUCCESS_RATE=$((PASSED * 100 / TOTAL))
  echo -e "成功率: ${SUCCESS_RATE}%"
fi

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}所有测试通过！${NC}"
  exit 0
else
  echo -e "\n${RED}部分测试失败${NC}"
  exit 1
fi
