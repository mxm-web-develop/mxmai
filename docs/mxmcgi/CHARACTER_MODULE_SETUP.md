# Character模块部署和测试指南

## 一、数据库初始化

### 1. 执行数据库迁移

```bash
cd mxmdata
pnpm run init-db
# 或
tsx src/scripts/init-database.ts
```

这将自动执行`src/database/schemas/character.sql`，创建`characters`表。

### 2. 验证表创建

```sql
-- 连接到数据库后执行
SELECT * FROM information_schema.tables WHERE table_name = 'characters';
SELECT indexname FROM pg_indexes WHERE tablename = 'characters';
```

## 二、服务启动

### 1. 启动mxmcgi服务

```bash
cd mxmcgi
pnpm run dev
# 服务运行在 http://localhost:4003
```

### 2. 启动gateway服务

```bash
cd gateway
pnpm run dev
# 服务运行在 http://localhost:3000
```

### 3. 验证路由配置

启动gateway后，应该看到日志输出：
```
   - /api/v1/characters -> mxmcgi/characters (http://localhost:4003)
```

## 三、快速测试

### 1. 获取JWT Token

```bash
# 登录
curl -X POST http://localhost:3000/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

### 2. 创建测试角色

```bash
export JWT_TOKEN="your_jwt_token_here"

# 创建简单角色
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "name": "测试角色",
    "nickname": "小测",
    "age": 25,
    "category": ["主角", "男性"],
    "tags": ["勇敢", "正义"],
    "appearance": {
      "description": "高个子，黑发，蓝色眼睛",
      "reference_images": []
    },
    "voice": {
      "description": "温和的男声",
      "clone_voiceId": null,
      "voice_example": null
    },
    "reference_videos": [],
    "clothing_style": {
      "description": "休闲风格",
      "reference_images": []
    },
    "others": {
      "personality": "开朗、友善"
    }
  }'
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "测试角色",
    "nickname": "小测",
    "age": 25,
    "category": ["主角", "男性"],
    "tags": ["勇敢", "正义"],
    "is_public": false,
    "appearance": {
      "description": "高个子，黑发，蓝色眼睛",
      "reference_images": []
    },
    "voice": {
      "description": "温和的男声",
      "clone_voiceId": null,
      "voice_example": null
    },
    "reference_videos": [],
    "clothing_style": {
      "description": "休闲风格",
      "reference_images": []
    },
    "others": {
      "personality": "开朗、友善"
    }
  }
}
```

**注意：** 响应中不包含 `user_id`、`created_at`、`updated_at`、`has_profile_images`、`has_profile_audio`、`has_profile_video` 等系统字段。

### 3. 获取角色列表

```bash
curl -X GET http://localhost:3000/api/v1/characters \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 四、完整测试流程

### 1. 创建完整角色（包含所有字段）

```bash
export JWT_TOKEN="your_jwt_token_here"
export CHARACTER_ID=""

# 创建完整角色
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "name": "主角-张三",
    "nickname": "小张",
    "age": 25,
    "category": ["主角", "男性"],
    "tags": ["勇敢", "超能力", "正义"],
    "is_public": false,
    "appearance": {
      "description": "高个子（180cm），黑发，蓝色眼睛，穿着休闲装，身材健壮",
      "reference_images": [
        "https://example.com/zhangsan_appearance1.jpg",
        "https://example.com/zhangsan_appearance2.png"
      ]
    },
    "voice": {
      "description": "温和的男声，语速适中，带有轻微的北方口音，音调中等",
      "clone_voiceId": "minimax-voice-123",
      "voice_example": "https://example.com/zhangsan_voice.mp3"
    },
    "reference_videos": [
      "https://example.com/zhangsan_video1.mp4",
      "https://example.com/zhangsan_video2.mp4"
    ],
    "clothing_style": {
      "description": "休闲，喜欢穿T恤和牛仔裤",
      "reference_images": [
        "https://example.com/zhangsan_casual1.jpg"
      ]
    },
    "others": {
      "personality": "开朗、友善、幽默、勇敢、有正义感",
      "hobby": "阅读和旅行",
      "background": "来自普通家庭，意外获得超能力"
    }
  }')

echo "$RESPONSE" | python3 -m json.tool
CHARACTER_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])")
echo "Created Character ID: $CHARACTER_ID"
```

### 2. 获取角色列表（支持筛选）

```bash
# 获取所有角色
curl -X GET "http://localhost:3000/api/v1/characters" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool

# 按分类筛选
curl -X GET "http://localhost:3000/api/v1/characters?category=主角&category=男性" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool

# 按标签筛选
curl -X GET "http://localhost:3000/api/v1/characters?tags=勇敢&tags=正义" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool

# 全文搜索
curl -X GET "http://localhost:3000/api/v1/characters?search=张三" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool

# 分页查询
curl -X GET "http://localhost:3000/api/v1/characters?page=1&limit=10" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool
```

### 3. 获取角色详情

```bash
curl -X GET "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool
```

### 4. 更新角色（部分更新）

```bash
# 更新基本信息
curl -X PUT "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "nickname": "张三丰",
    "age": 100,
    "appearance": {
      "description": "仙风道骨，白发长须",
      "reference_images": [
        "https://example.com/zhangsanfeng_appearance.jpg"
      ]
    },
    "others": {
      "personality": "睿智、慈祥",
      "skill": "太极拳"
    }
  }' | python3 -m json.tool

# 更新外表参考图片（添加新图片）
curl -X PUT "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "appearance": {
      "reference_images": [
        "https://example.com/zhangsan_appearance1.jpg",
        "https://example.com/zhangsan_appearance2.png",
        "https://example.com/zhangsan_appearance3.jpg"
      ]
    }
  }' | python3 -m json.tool

# 更新声音信息
curl -X PUT "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "voice": {
      "description": "深沉、威严的声音",
      "clone_voiceId": "minimax-voice-456",
      "voice_example": "https://example.com/zhangsanfeng_voice.mp3"
    }
  }' | python3 -m json.tool

# 更新参考视频
curl -X PUT "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "reference_videos": [
      "https://example.com/zhangsanfeng_video1.mp4",
      "https://example.com/zhangsanfeng_video2.mp4",
      "https://example.com/zhangsanfeng_video3.mp4"
    ]
  }' | python3 -m json.tool
```

### 5. 关联图片任务

```bash
# 关联外表参考图片任务（imageType: 'appearance'）
curl -X POST "http://localhost:3000/api/v1/characters/$CHARACTER_ID/link-image-task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "taskId": "graph-task-id-here",
    "imageType": "appearance"
  }' | python3 -m json.tool

# 关联服装风格参考图片任务（imageType: 'clothing_style'）
curl -X POST "http://localhost:3000/api/v1/characters/$CHARACTER_ID/link-image-task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "taskId": "graph-task-id-here",
    "imageType": "clothing_style"
  }' | python3 -m json.tool
```

### 6. 关联音频任务

```bash
curl -X POST "http://localhost:3000/api/v1/characters/$CHARACTER_ID/link-audio-task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "taskId": "audio-task-id-here",
    "cloneVoiceId": "minimax-voice-789",
    "voiceExampleUrl": "https://example.com/character_voice_example.mp3"
  }' | python3 -m json.tool
```

### 7. 删除角色

```bash
curl -X DELETE "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 8. 大纲生成自动保存角色

```bash
# 生成包含角色的大纲（saveCharactersToModule: true）
curl -X POST "http://localhost:3000/api/v1/writing/outline" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "outline_type": "story-novel",
    "prompt": "一个关于超能力者的故事",
    "saveCharactersToModule": true
  }' | python3 -m json.tool

# 获取生成的角色
curl -X GET "http://localhost:3000/api/v1/characters" \
  -H "Authorization: Bearer $JWT_TOKEN" | python3 -m json.tool
```

### 9. 使用角色进行写作

```bash
# 使用characterIds生成写作
curl -X POST "http://localhost:3000/api/v1/writing/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "outline_task_id": "outline-task-id-here",
    "characterIds": ["character-id-1", "character-id-2"],
    "writing_type": "story-novel"
  }' | python3 -m json.tool
```

### 10. 验证数据结构

```bash
# 获取角色并验证数据结构
RESPONSE=$(curl -s -X GET "http://localhost:3000/api/v1/characters/$CHARACTER_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")

# 验证响应结构
echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
char = data.get('data', {})

# 检查必需字段
required_fields = ['id', 'name', 'appearance', 'voice', 'reference_videos', 'clothing_style', 'others']
missing = [f for f in required_fields if f not in char]
if missing:
    print(f'❌ 缺少字段: {missing}')
else:
    print('✅ 所有必需字段都存在')

# 检查不应包含的字段
excluded_fields = ['user_id', 'created_at', 'updated_at', 'has_profile_images', 'has_profile_audio', 'has_profile_video']
found = [f for f in excluded_fields if f in char]
if found:
    print(f'❌ 不应包含的字段: {found}')
else:
    print('✅ 不包含系统字段')

# 检查嵌套结构
if 'appearance' in char and 'reference_images' in char['appearance']:
    print(f'✅ appearance.reference_images: {len(char[\"appearance\"][\"reference_images\"])} 张图片')
if 'voice' in char and 'voice_example' in char['voice']:
    print(f'✅ voice.voice_example: {char[\"voice\"][\"voice_example\"] or \"未设置\"}')
if 'reference_videos' in char:
    print(f'✅ reference_videos: {len(char[\"reference_videos\"])} 个视频')
"
```

## 五、API端点清单

### 基础CRUD

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/characters` | 获取角色列表 | ✅ |
| POST | `/api/v1/characters` | 创建角色 | ✅ |
| GET | `/api/v1/characters/:id` | 获取角色详情 | ✅ |
| PUT | `/api/v1/characters/:id` | 更新角色 | ✅ |
| DELETE | `/api/v1/characters/:id` | 删除角色 | ✅ |

### 任务关联

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/characters/:id/link-image-task` | 关联图片任务（需指定imageType: 'appearance' 或 'clothing_style'） | ✅ |
| POST | `/api/v1/characters/:id/link-audio-task` | 关联音频任务 | ✅ |

**注意：** 不再支持 `link-video-task` 接口，视频通过 `reference_videos` 数组直接更新。

### 查询参数

- `category`: string[] - 按分类筛选（支持多个，用逗号分隔）
- `tags`: string[] - 按标签筛选（支持多个，用逗号分隔）
- `is_public`: boolean - 筛选公开/私有角色
- `search`: string - 全文搜索（name, nickname）
- `page`: number - 页码（默认1）
- `limit`: number - 每页数量（默认20）

**注意：** 不再支持 `hasProfileImages`、`hasProfileAudio`、`hasProfileVideo` 筛选，前端可以通过检查 `appearance.reference_images`、`voice.voice_example`、`reference_videos` 来判断。

## 六、核心特性

### 1. 数据结构说明

角色数据采用嵌套结构，符合 `test.md` 的设计：

- **appearance** (外表)
  - `description`: 外表描述文本
  - `reference_images`: 参考图片URL数组（最多10张）

- **voice** (声音)
  - `description`: 声音描述文本
  - `clone_voiceId`: Minimax克隆声音ID
  - `voice_example`: 声音示例URL

- **reference_videos** (参考视频)
  - 字符串数组，存储角色短片URL（用于视频生成的角色一致性）

- **clothing_style** (服装风格)
  - `description`: 服装风格描述文本
  - `reference_images`: 参考图片URL数组（最多10张）

- **others** (其他信息)
  - JSONB对象，包含 `personality` 等自定义字段

**注意：** API响应中不包含以下系统字段：
- `user_id`（用户只能看到自己的角色）
- `created_at`、`updated_at`（时间戳）
- `has_profile_images`、`has_profile_audio`、`has_profile_video`（前端可通过数据结构判断）

### 2. 渐进式完善流程

1. **初始状态**（大纲生成或手动创建）
   - 只有描述信息（`appearance.description`、`voice.description` 等）
   - `appearance.reference_images`、`voice.voice_example`、`reference_videos` 为空数组

2. **完善外表图片**
   - 通过生图任务生成角色外表图片
   - 关联graph任务（`imageType: 'appearance'`）
   - `appearance.reference_images` 自动添加图片URL

3. **完善服装风格图片**
   - 通过生图任务生成服装风格图片
   - 关联graph任务（`imageType: 'clothing_style'`）
   - `clothing_style.reference_images` 自动添加图片URL

4. **完善音频**
   - 通过Minimax语音克隆生成角色声音
   - 关联audio任务
   - `voice.clone_voiceId` 和 `voice.voice_example` 自动更新

5. **完善视频**
   - 生成角色短片
   - 直接更新 `reference_videos` 数组

### 3. 与Writing模块集成

- **大纲生成**: 自动保存LLM生成的角色到Character模块
- **写作生成**: 支持通过`characterIds`参数使用Character模块中的角色

## 七、故障排查

### 问题1: 数据库表不存在

**解决方案:**
```bash
cd mxmdata
tsx src/scripts/init-database.ts
```

### 问题2: Gateway路由404

**检查:**
1. gateway服务是否启动
2. 路由是否已添加到`gateway/src/routes/proxy.ts`
3. 检查gateway启动日志中的路由列表

### 问题3: 认证失败

**检查:**
1. JWT token是否有效
2. token是否过期
3. `x-user-id` header是否正确转发

### 问题4: 任务关联失败

**检查:**
1. 任务ID是否存在
2. 任务是否属于当前用户
3. 任务类型是否匹配（graph/audio）
4. 图片任务关联时，`imageType` 参数是否正确（'appearance' 或 'clothing_style'）
5. 图片数组是否已满（最多10张）

### 问题5: PostgREST schema cache 错误

**错误信息:** `"Could not find the 'xxx' column of 'characters' in the schema cache"`

**解决方案:**
```bash
cd mxmdata
# 重新加载 schema cache
docker compose exec postgres psql -U postgres -d postgres -c "SELECT pg_notify('pgrst', 'reload schema');"
# 或重启 PostgREST 容器
docker compose restart postgrest
```

## 八、下一步

1. ✅ 数据库表已创建
2. ✅ Gateway路由已配置
3. ✅ API接口已实现
4. ⏳ 前端集成（角色管理页面）
5. ⏳ 角色选择器组件
6. ⏳ 任务关联UI

## 九、数据结构参考

### 创建角色请求体（CreateCharacterDto）

```json
{
  "name": "string (必需)",
  "nickname": "string (可选)",
  "age": "number (可选)",
  "category": ["string"] (可选),
  "tags": ["string"] (可选),
  "is_public": "boolean (可选，默认false)",
  "appearance": {
    "description": "string (可选)",
    "reference_images": ["string"] (可选，最多10张)
  },
  "voice": {
    "description": "string (可选)",
    "clone_voiceId": "string (可选)",
    "voice_example": "string (可选)"
  },
  "reference_videos": ["string"] (可选),
  "clothing_style": {
    "description": "string (可选)",
    "reference_images": ["string"] (可选，最多10张)
  },
  "others": {
    "personality": "string (可选)",
    "...": "其他自定义字段"
  }
}
```

### 角色响应体（Character）

```json
{
  "id": "uuid",
  "name": "string",
  "nickname": "string | null",
  "age": "number | null",
  "category": ["string"],
  "tags": ["string"],
  "is_public": "boolean",
  "appearance": {
    "description": "string | null",
    "reference_images": ["string"]
  },
  "voice": {
    "description": "string | null",
    "clone_voiceId": "string | null",
    "voice_example": "string | null"
  },
  "reference_videos": ["string"],
  "clothing_style": {
    "description": "string | null",
    "reference_images": ["string"]
  },
  "others": {
    "personality": "string | null",
    "...": "其他自定义字段"
  }
}
```

**注意：** 响应中不包含 `user_id`、`created_at`、`updated_at`、`has_profile_images`、`has_profile_audio`、`has_profile_video`。

## 十、相关文件

- 数据结构设计: `test.md`
- 数据库schema: `mxmdata/src/database/schemas/character.sql`
- Repository接口: `mxmdata/src/interfaces/ICharacterRepository.ts`
- Repository实现: `mxmdata/src/adapters/supabase/SupabaseCharacterRepository.ts`
- Service层: `mxmcgi/src/core/character/character-service.ts`
- API路由: `mxmcgi/src/routes/character.ts`
- Gateway路由: `gateway/src/routes/proxy.ts`
- API测试示例: `mxmcgi/CHARACTER_API_TEST_EXAMPLES.md`
