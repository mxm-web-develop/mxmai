# Character模块全流程测试案例

## 前置准备

### 1. 数据库初始化

```bash
# 进入mxmdata目录
cd mxmdata

# 确保环境变量已配置（SUPABASE_DB_URL或DATABASE_URL）
# 运行数据库初始化脚本
pnpm run init-db
# 或
tsx src/scripts/init-database.ts
```

这将创建`characters`表及其所有索引。

### 2. 启动服务

```bash
# 启动mxmcgi服务（端口4003）
cd mxmcgi
pnpm run dev

# 启动gateway服务（端口3000）
cd gateway
pnpm run dev
```

### 3. 获取JWT Token

```bash
# 登录获取token
curl -X POST http://localhost:3000/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'

# 从响应中提取token
# 响应格式: {"success": true, "data": {"token": "..."}}
```

## 测试流程

### 阶段1: 基础CRUD操作

#### 1.1 创建角色（手动创建）

```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "测试角色",
    "display_name": "测试角色显示名",
    "description": "这是一个测试角色，用于测试Character模块",
    "attributes": {
      "age": "25",
      "appearance": "高个子，黑发，蓝色眼睛，穿着休闲装",
      "voice_description": "温和的男声，语速适中",
      "clothing_style": "休闲",
      "personality": "开朗、友善、幽默",
      "others": "喜欢阅读和旅行"
    },
    "category": "test",
    "tags": ["测试", "角色", "示例"]
  }'
```

**预期响应:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "测试角色",
    "has_profile_images": false,
    "has_profile_audio": false,
    "has_profile_video": false,
    ...
  }
}
```

**保存返回的`id`，后续测试使用。**

#### 1.2 获取角色列表

```bash
curl -X GET http://localhost:3000/api/v1/characters \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**按布尔字段筛选:**
```bash
# 只获取有图片的角色
curl -X GET "http://localhost:3000/api/v1/characters?hasProfileImages=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 只获取有音频的角色
curl -X GET "http://localhost:3000/api/v1/characters?hasProfileAudio=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 只获取有视频的角色
curl -X GET "http://localhost:3000/api/v1/characters?hasProfileVideo=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 1.3 获取角色详情

```bash
curl -X GET http://localhost:3000/api/v1/characters/{CHARACTER_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 1.4 更新角色

```bash
curl -X PUT http://localhost:3000/api/v1/characters/{CHARACTER_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "description": "更新后的描述",
    "reference_image_url": "https://example.com/image.jpg",
    "has_profile_images": true
  }'
```

**验证布尔字段自动更新:**
```bash
# 再次获取角色详情，检查has_profile_images是否为true
curl -X GET http://localhost:3000/api/v1/characters/{CHARACTER_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 1.5 删除角色

```bash
curl -X DELETE http://localhost:3000/api/v1/characters/{CHARACTER_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 阶段2: 大纲生成角色（手动保存）

#### 2.1 生成大纲（包含角色）

```bash
curl -X POST http://localhost:3000/api/v1/writing/outline \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "uid": "test-outline-001",
    "prompt": "写一个关于未来科技的故事，包含3个主要角色",
    "applyto": "storyboard-scripts",
    "total_duration_minutes": 5,
    "writing_type": "storyboard-scripts",
    "outputFormat": "json"
  }'
```

**预期行为:**
- 大纲生成完成后，如果LLM生成了角色，角色信息会包含在大纲结果中（`result.metadata.characters`）
- **注意**：角色不会自动保存到Character模块，需要用户手动保存
- 用户可以在前端编辑页面点击"保存角色"按钮手动保存
- 保存后的角色初始状态：`has_profile_images=false`, `has_profile_audio=false`, `has_profile_video=false`
- 角色来源：`source_type='outline'`, `source_outline_task_id`为大纲任务ID

#### 2.2 手动保存角色（前端操作）

用户需要在前端编辑页面手动保存角色，或通过API手动保存：

```bash
# 手动保存角色（需要先获取大纲任务中的角色信息）
curl -X POST http://localhost:3000/api/v1/characters/save-from-outline \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "characters": [...], // 从大纲结果中获取的角色数组
    "outlineTaskId": "outline-task-id"
  }'
```

#### 2.3 验证角色已保存

```bash
# 获取来自大纲的角色
curl -X GET "http://localhost:3000/api/v1/characters?source_type=outline" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 阶段3: 关联任务完善角色

#### 3.1 生成图片（为角色生成头像）

```bash
# 先创建一个graph任务
curl -X POST http://localhost:3000/api/v1/cgi/graph \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "高个子，黑发，蓝色眼睛，穿着休闲装的男性角色",
    "model": "flux",
    "outputFormat": "json"
  }'
```

**保存返回的`taskId`。**

#### 3.2 关联图片任务到角色

```bash
curl -X POST http://localhost:3000/api/v1/characters/{CHARACTER_ID}/link-image-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "taskId": "YOUR_GRAPH_TASK_ID"
  }'
```

**预期行为:**
- 系统从任务结果中获取图片URL
- 自动更新`reference_image_url`和`reference_image_task_id`
- 自动设置`has_profile_images=true`

#### 3.3 验证图片已关联

```bash
curl -X GET http://localhost:3000/api/v1/characters/{CHARACTER_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**检查响应中的:**
- `has_profile_images: true`
- `reference_image_url`不为空
- `reference_image_task_id`不为空

#### 3.4 关联音频任务（Minimax语音克隆）

```bash
# 先创建audio任务（Minimax语音克隆）
curl -X POST http://localhost:3000/api/v1/cgi/audio \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "text": "测试语音克隆",
    "voice_id": "your_voice_id",
    "outputFormat": "json"
  }'
```

**关联音频任务:**
```bash
curl -X POST http://localhost:3000/api/v1/characters/{CHARACTER_ID}/link-audio-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "taskId": "YOUR_AUDIO_TASK_ID"
  }'
```

#### 3.5 关联视频任务（角色短片）

```bash
# 先创建video任务
curl -X POST http://localhost:3000/api/v1/cgi/video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "角色短片，展示角色外观和动作",
    "outputFormat": "json"
  }'
```

**关联视频任务:**
```bash
curl -X POST http://localhost:3000/api/v1/characters/{CHARACTER_ID}/link-video-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "taskId": "YOUR_VIDEO_TASK_ID"
  }'
```

### 阶段4: 使用角色进行写作生成

#### 4.1 使用characterIds生成写作

```bash
curl -X POST http://localhost:3000/api/v1/writing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "写一个包含这些角色的故事",
    "writing_type": "story-novel",
    "characterIds": ["CHARACTER_ID_1", "CHARACTER_ID_2"],
    "outlines": [...],
    "outputFormat": "json"
  }'
```

**预期行为:**
- 系统从Character模块获取角色信息
- 角色信息被包含在写作提示中
- 角色使用次数自动增加（`usage_count++`）

## 测试检查清单

### 数据库检查

```sql
-- 检查表是否存在
SELECT * FROM information_schema.tables WHERE table_name = 'characters';

-- 检查索引
SELECT indexname FROM pg_indexes WHERE tablename = 'characters';

-- 查看角色数据
SELECT id, name, has_profile_images, has_profile_audio, has_profile_video 
FROM characters 
WHERE user_id = 'YOUR_USER_ID';
```

### API响应检查

1. ✅ 创建角色后，布尔字段默认为`false`
2. ✅ 更新URL后，布尔字段自动更新
3. ✅ 关联任务后，布尔字段自动更新
4. ✅ 从任务结果中正确提取媒体URL
5. ✅ 大纲生成后，角色自动保存
6. ✅ 使用characterIds时，角色信息正确获取
7. ✅ 角色使用次数正确增加

### 错误处理测试

```bash
# 测试1: 无权限访问他人角色
# 使用另一个用户的token访问角色（应该返回403或404）

# 测试2: 关联不存在的任务
curl -X POST http://localhost:3000/api/v1/characters/{CHARACTER_ID}/link-image-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"taskId": "non-existent-task-id"}'
# 应该返回错误

# 测试3: 关联错误类型的任务
# 将audio任务关联到link-image-task（应该返回错误）
```

## 自动化测试脚本

使用提供的`test-character-api.sh`脚本进行自动化测试:

```bash
chmod +x mxmcgi/test-character-api.sh
bash mxmcgi/test-character-api.sh
```

脚本会提示输入JWT token，然后自动执行所有基础CRUD测试。

## 性能测试

```bash
# 批量创建角色
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/v1/characters \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -d "{\"name\": \"角色$i\"}"
done

# 测试列表查询性能
time curl -X GET "http://localhost:3000/api/v1/characters?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 注意事项

1. **JWT Token**: 所有API请求都需要有效的JWT token
2. **用户隔离**: 每个用户只能访问自己的角色（除非角色是公开的）
3. **任务关联**: 关联任务时，任务必须属于当前用户
4. **布尔字段**: 系统会自动同步布尔字段，但也可以手动设置
5. **媒体URL**: 优先使用任务结果中的URL，如果没有则使用直接URL
