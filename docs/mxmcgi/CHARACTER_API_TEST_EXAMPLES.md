# Character API 完整测试案例

## 前置准备

### 1. 获取认证 Token
```bash
# 登录获取 JWT token（示例）
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzZjZjZjBkNy0xYWM1LTQ0ZWItODM1Yi01YTU5ZWM5NzM5MDkiLCJ1c2VybmFtZSI6Im14bW1vYmlsZSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NjkzMTI3NDUsImV4cCI6MTc2OTM3MDM0NX0.zbWq9NvrWXcu70EbtYCOqTNS3E-tX6KnxDBeVwV_mdY"
```

### 2. 设置 API 基础 URL
```bash
BASE_URL="http://localhost:3000/api/v1/characters"
```

---

## 测试案例 1: 创建角色 - 最简示例（只有名称）

```bash
curl -X POST ${BASE_URL} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "测试角色-001"
  }'
```

**预期响应：**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "测试角色-001",
    "nickname": null,
    "age": null,
    "category": [],
    "tags": [],
    "is_public": false,
    "appearance": {
      "description": null,
      "reference_images": []
    },
    "voice": {
      "description": null,
      "clone_voiceId": null,
      "voice_example": null
    },
    "clothing_style": {
      "description": null,
      "reference_images": []
    },
    "others": {},
    "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
    "created_at": "2026-01-25T19:50:00.000Z",
    "updated_at": "2026-01-25T19:50:00.000Z"
  }
}
```

---

## 测试案例 2: 创建角色 - 完整示例（包含所有字段）

```bash
curl -X POST ${BASE_URL} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "主角-张三",
    "nickname": "三哥",
    "age": 25,
    "category": ["主角", "男性"],
    "tags": ["勇敢", "正义", "超能力"],
    "is_public": false,
    "appearance": {
      "description": "高个子（180cm），黑发，蓝色眼睛，身材健壮，面部轮廓分明",
      "reference_images": [
        "https://example.com/avatar1.jpg",
        "https://example.com/avatar2.jpg"
      ]
    },
    "voice": {
      "description": "温和的男声，语速适中，带有轻微的北方口音，音调中等",
      "clone_voiceId": "minimax_voice_12345",
      "voice_example": "https://example.com/voice_sample.mp3"
    },
    "clothing_style": {
      "description": "休闲风格，喜欢穿T恤和牛仔裤，偶尔穿运动装",
      "reference_images": [
        "https://example.com/clothing1.jpg",
        "https://example.com/clothing2.jpg",
        "https://example.com/clothing3.jpg"
      ]
    },
    "others": {
      "personality": "开朗、友善、幽默、勇敢、有正义感",
      "hobbies": "阅读、旅行、武术",
      "background": "从小在北方长大，拥有超能力后开始保护城市"
    }
  }'
```

**预期响应：**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "主角-张三",
    "nickname": "三哥",
    "age": 25,
    "category": ["主角", "男性"],
    "tags": ["勇敢", "正义", "超能力"],
    "is_public": false,
    "appearance": {
      "description": "高个子（180cm），黑发，蓝色眼睛，身材健壮，面部轮廓分明",
      "reference_images": [
        "https://example.com/avatar1.jpg",
        "https://example.com/avatar2.jpg"
      ]
    },
    "voice": {
      "description": "温和的男声，语速适中，带有轻微的北方口音，音调中等",
      "clone_voiceId": "minimax_voice_12345",
      "voice_example": "https://example.com/voice_sample.mp3"
    },
    "clothing_style": {
      "description": "休闲风格，喜欢穿T恤和牛仔裤，偶尔穿运动装",
      "reference_images": [
        "https://example.com/clothing1.jpg",
        "https://example.com/clothing2.jpg",
        "https://example.com/clothing3.jpg"
      ]
    },
    "others": {
      "personality": "开朗、友善、幽默、勇敢、有正义感",
      "hobbies": "阅读、旅行、武术",
      "background": "从小在北方长大，拥有超能力后开始保护城市"
    },
    "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
    "created_at": "2026-01-25T19:50:00.000Z",
    "updated_at": "2026-01-25T19:50:00.000Z"
  }
}
```

---

## 测试案例 3: 创建角色 - 只有外表描述（用于大纲生成）

```bash
curl -X POST ${BASE_URL} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "配角-李四",
    "appearance": {
      "description": "中等身材，棕色头发，戴眼镜，文质彬彬"
    },
    "voice": {
      "description": "低沉的男声，语速较慢，带有书卷气"
    },
    "clothing_style": {
      "description": "正式，喜欢穿衬衫和西装"
    },
    "others": {
      "personality": "内向、聪明、谨慎"
    }
  }'
```

---

## 测试案例 4: 更新角色 - 更新基本信息

```bash
# 假设角色ID为 CHARACTER_ID
CHARACTER_ID="your-character-id-here"

curl -X PUT ${BASE_URL}/${CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "主角-张三（更新）",
    "nickname": "三哥（更新）",
    "age": 26,
    "category": ["主角", "男性", "英雄"],
    "tags": ["勇敢", "正义", "超能力", "领导力"]
  }'
```

---

## 测试案例 5: 更新角色 - 更新外表图片

```bash
CHARACTER_ID="your-character-id-here"

curl -X PUT ${BASE_URL}/${CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "appearance": {
      "description": "高个子（180cm），黑发，蓝色眼睛，身材健壮（更新描述）",
      "reference_images": [
        "https://example.com/avatar1.jpg",
        "https://example.com/avatar2.jpg",
        "https://example.com/avatar3_new.jpg"
      ]
    }
  }'
```

**注意：** `reference_images` 数组最多支持 10 张图片。

---

## 测试案例 6: 更新角色 - 更新声音信息

```bash
CHARACTER_ID="your-character-id-here"

curl -X PUT ${BASE_URL}/${CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "voice": {
      "description": "温和的男声，语速适中，带有轻微的北方口音（更新）",
      "clone_voiceId": "minimax_voice_67890",
      "voice_example": "https://example.com/voice_sample_new.mp3"
    }
  }'
```

---

## 测试案例 7: 更新角色 - 更新服装风格

```bash
CHARACTER_ID="your-character-id-here"

curl -X PUT ${BASE_URL}/${CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "clothing_style": {
      "description": "休闲风格，喜欢穿T恤和牛仔裤，偶尔穿运动装（更新）",
      "reference_images": [
        "https://example.com/clothing1.jpg",
        "https://example.com/clothing2.jpg",
        "https://example.com/clothing3.jpg",
        "https://example.com/clothing4_new.jpg"
      ]
    }
  }'
```

---

## 测试案例 8: 更新角色 - 更新其他信息

```bash
CHARACTER_ID="your-character-id-here"

curl -X PUT ${BASE_URL}/${CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "others": {
      "personality": "开朗、友善、幽默、勇敢、有正义感（更新）",
      "hobbies": "阅读、旅行、武术、摄影",
      "background": "从小在北方长大，拥有超能力后开始保护城市，现在是超级英雄联盟的成员",
      "relationships": "有一个妹妹，是主角的好友"
    }
  }'
```

**注意：** `others` 字段是 JSONB，可以包含任意自定义字段。

---

## 测试案例 9: 关联图片任务到角色 - 外表图片

```bash
CHARACTER_ID="your-character-id-here"
GRAPH_TASK_ID="your-graph-task-id-here"

curl -X POST ${BASE_URL}/${CHARACTER_ID}/link-image-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "taskId": "'${GRAPH_TASK_ID}'",
    "imageType": "appearance"
  }'
```

**说明：**
- `imageType` 可以是 `"appearance"` 或 `"clothing_style"`
- 默认值为 `"appearance"`
- 图片会自动从任务结果中获取 URL 并添加到对应的 `reference_images` 数组
- 最多支持 10 张图片

---

## 测试案例 10: 关联图片任务到角色 - 服装风格图片

```bash
CHARACTER_ID="your-character-id-here"
GRAPH_TASK_ID="your-graph-task-id-here"

curl -X POST ${BASE_URL}/${CHARACTER_ID}/link-image-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "taskId": "'${GRAPH_TASK_ID}'",
    "imageType": "clothing_style"
  }'
```

---

## 测试案例 11: 关联音频任务到角色

```bash
CHARACTER_ID="your-character-id-here"
AUDIO_TASK_ID="your-audio-task-id-here"

curl -X POST ${BASE_URL}/${CHARACTER_ID}/link-audio-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "taskId": "'${AUDIO_TASK_ID}'",
    "cloneVoiceId": "minimax_voice_12345"
  }'
```

**说明：**
- `cloneVoiceId` 是可选的，用于存储 Minimax 克隆声音 ID
- 音频 URL 会自动从任务结果中获取并更新到 `voice.voice_example`

---

## 测试案例 12: 获取角色详情（包含媒体URL）

```bash
CHARACTER_ID="your-character-id-here"

curl -X GET ${BASE_URL}/${CHARACTER_ID} \
  -H "Authorization: Bearer ${TOKEN}"
```

**预期响应：**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "主角-张三",
    "nickname": "三哥",
    "age": 25,
    "category": ["主角", "男性"],
    "tags": ["勇敢", "正义", "超能力"],
    "is_public": false,
    "appearance": {
      "description": "高个子（180cm），黑发，蓝色眼睛",
      "reference_images": ["https://example.com/avatar1.jpg"]
    },
    "voice": {
      "description": "温和的男声",
      "clone_voiceId": "minimax_voice_12345",
      "voice_example": "https://example.com/voice_sample.mp3"
    },
    "clothing_style": {
      "description": "休闲风格",
      "reference_images": ["https://example.com/clothing1.jpg"]
    },
    "others": {
      "personality": "开朗、友善"
    },
    "mediaUrls": {
      "appearance_reference_images": ["https://example.com/avatar1.jpg"],
      "clothing_style_reference_images": ["https://example.com/clothing1.jpg"],
      "voice_example": "https://example.com/voice_sample.mp3"
    },
    "user_id": "3f6cf0d7-1ac5-44eb-835b-5a59ec973909",
    "created_at": "2026-01-25T19:50:00.000Z",
    "updated_at": "2026-01-25T19:50:00.000Z"
  }
}
```

---

## 测试案例 13: 获取角色列表

```bash
# 获取所有角色
curl -X GET "${BASE_URL}?page=1&limit=10" \
  -H "Authorization: Bearer ${TOKEN}"

# 按分类筛选
curl -X GET "${BASE_URL}?category=主角&category=男性" \
  -H "Authorization: Bearer ${TOKEN}"

# 按标签筛选
curl -X GET "${BASE_URL}?tags=勇敢&tags=正义" \
  -H "Authorization: Bearer ${TOKEN}"

# 搜索（按名称或昵称）
curl -X GET "${BASE_URL}?search=张三" \
  -H "Authorization: Bearer ${TOKEN}"

# 组合查询
curl -X GET "${BASE_URL}?category=主角&tags=勇敢&search=张&page=1&limit=20" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## 测试案例 14: 删除角色

```bash
CHARACTER_ID="your-character-id-here"

curl -X DELETE ${BASE_URL}/${CHARACTER_ID} \
  -H "Authorization: Bearer ${TOKEN}"
```

**预期响应：**
```json
{
  "success": true,
  "message": "Character deleted successfully"
}
```

---

## 测试案例 15: 完整流程 - 从创建到完善角色

```bash
# 步骤1: 创建基础角色（只有描述）
RESPONSE=$(curl -s -X POST ${BASE_URL} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "新角色-测试",
    "appearance": {
      "description": "高个子，黑发，蓝色眼睛"
    },
    "voice": {
      "description": "温和的男声"
    },
    "clothing_style": {
      "description": "休闲风格"
    },
    "others": {
      "personality": "开朗、友善"
    }
  }')

CHARACTER_ID=$(echo $RESPONSE | jq -r '.data.id')
echo "创建的角色ID: ${CHARACTER_ID}"

# 步骤2: 更新角色，添加分类和标签
curl -X PUT ${BASE_URL}/${CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "category": ["主角"],
    "tags": ["勇敢", "正义"]
  }'

# 步骤3: 关联外表图片（假设有 graph 任务ID）
# GRAPH_TASK_ID="your-graph-task-id"
# curl -X POST ${BASE_URL}/${CHARACTER_ID}/link-image-task \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer ${TOKEN}" \
#   -d '{
#     "taskId": "'${GRAPH_TASK_ID}'",
#     "imageType": "appearance"
#   }'

# 步骤4: 关联服装风格图片
# curl -X POST ${BASE_URL}/${CHARACTER_ID}/link-image-task \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer ${TOKEN}" \
#   -d '{
#     "taskId": "'${GRAPH_TASK_ID}'",
#     "imageType": "clothing_style"
#   }'

# 步骤5: 关联音频任务（假设有 audio 任务ID）
# AUDIO_TASK_ID="your-audio-task-id"
# curl -X POST ${BASE_URL}/${CHARACTER_ID}/link-audio-task \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer ${TOKEN}" \
#   -d '{
#     "taskId": "'${AUDIO_TASK_ID}'",
#     "cloneVoiceId": "minimax_voice_12345"
#   }'

# 步骤6: 获取最终角色信息
curl -X GET ${BASE_URL}/${CHARACTER_ID} \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## 错误处理示例

### 错误1: 缺少认证
```bash
curl -X POST ${BASE_URL} \
  -H "Content-Type: application/json" \
  -d '{"name": "测试"}'
```
**预期响应：** `401 Unauthorized`

### 错误2: 图片数组超过10张
```bash
curl -X POST ${BASE_URL} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "测试",
    "appearance": {
      "reference_images": [
        "url1", "url2", "url3", "url4", "url5",
        "url6", "url7", "url8", "url9", "url10",
        "url11"
      ]
    }
  }'
```
**预期响应：** `500 Internal Server Error` - "外表参考图片最多支持10张"

### 错误3: 角色不存在
```bash
curl -X PUT ${BASE_URL}/invalid-id \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"name": "测试"}'
```
**预期响应：** `404 Not Found`

### 错误4: 无权访问
```bash
# 尝试访问其他用户的角色
curl -X GET ${BASE_URL}/other-user-character-id \
  -H "Authorization: Bearer ${TOKEN}"
```
**预期响应：** `404 Not Found` 或 `403 Forbidden`

---

## 字段说明

### 必填字段
- `name`: 角色名称（字符串，必填）

### 可选字段
- `nickname`: 昵称（字符串）
- `age`: 年龄（数字）
- `category`: 分类（字符串数组，如 `["主角", "男性"]`）
- `tags`: 标签（字符串数组，如 `["勇敢", "正义"]`）
- `is_public`: 是否公开（布尔值，只对admin账号开放）
- `appearance`: 外表对象
  - `description`: 外表描述（字符串）
  - `reference_images`: 参考图片URL数组（最多10张）
- `voice`: 声音对象
  - `description`: 声音描述（字符串）
  - `clone_voiceId`: Minimax克隆声音ID（字符串）
  - `voice_example`: 声音示例URL（字符串）
- `clothing_style`: 服装风格对象
  - `description`: 服装风格描述（字符串）
  - `reference_images`: 参考图片URL数组（最多10张）
- `others`: 其他信息（JSONB对象，可包含任意字段）
  - `personality`: 性格（字符串）
  - 其他自定义字段

---

## 注意事项

1. **图片限制**：`appearance.reference_images` 和 `clothing_style.reference_images` 每个最多支持 10 张图片
2. **音频限制**：`voice.voice_example` 只能有一个 URL
3. **权限控制**：`is_public` 字段只对 admin 账号开放
4. **任务关联**：关联图片/音频任务时，会自动从任务结果中获取 URL
5. **数据验证**：所有字段都会进行验证，不符合要求会返回错误
