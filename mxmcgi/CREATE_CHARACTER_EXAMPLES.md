# 创建角色API完整参数示例

## 基础URL
```
POST http://localhost:3000/api/v1/characters
```

## 必需Headers
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

## 参数说明

### 必需参数
- `name` (string): 角色名称

### 可选参数

#### 基本信息
- `display_name` (string): 显示名称
- `description` (string): 角色描述
- `category` (string): 分类（如：主角、配角、反派等）
- `tags` (string[]): 标签数组
- `is_public` (boolean): 是否公开，默认false

#### 角色属性（attributes对象）
- `age` (string): 年龄
- `appearance` (string): 外貌描述（用于生图）
- `voice_description` (string): 声音描述（用于生音频/语音克隆）
- `clothing_style` (string): 服装风格
- `personality` (string): 性格描述
- `others` (string): 其他信息

#### 媒体URL（直接设置）
- `avatar_url` (string): 头像图片URL
- `reference_image_url` (string): 参考图片URL（样貌）
- `reference_video_url` (string): 参考视频URL（角色短片）
- `reference_audio_url` (string): 参考音频URL（Minimax克隆声音）

#### 关联任务ID（通过任务ID关联）
- `avatar_task_id` (string): 头像对应的graph任务ID
- `reference_image_task_id` (string): 参考图片对应的graph任务ID
- `reference_video_task_id` (string): 参考视频对应的video任务ID
- `reference_audio_task_id` (string): 参考音频对应的audio任务ID

#### 完善标记（布尔字段，系统会自动更新）
- `has_profile_images` (boolean): 是否有角色图片
- `has_profile_audio` (boolean): 是否有角色音频
- `has_profile_video` (boolean): 是否有角色短片

## 示例

### 示例1: 最简创建（只有名称）

```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "测试角色"
  }'
```

### 示例2: 完整创建（包含所有描述字段）

```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "主角-张三",
    "display_name": "张三",
    "description": "故事的主角，一个勇敢的年轻人，拥有超能力",
    "attributes": {
      "age": "25",
      "appearance": "高个子（180cm），黑发，蓝色眼睛，穿着休闲装，身材健壮",
      "voice_description": "温和的男声，语速适中，带有轻微的北方口音，音调中等",
      "clothing_style": "休闲，喜欢穿T恤和牛仔裤",
      "personality": "开朗、友善、幽默、勇敢、有正义感",
      "others": "喜欢阅读和旅行，擅长武术，有一个宠物猫"
    },
    "category": "主角",
    "tags": ["主角", "男性", "勇敢", "超能力"],
    "is_public": false
  }'
```

### 示例3: 带媒体URL的创建

```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "角色-李四",
    "description": "配角和角色，主角的好友",
    "attributes": {
      "age": "30",
      "appearance": "中等身材，棕色头发，戴眼镜",
      "voice_description": "低沉的男声，语速较慢"
    },
    "avatar_url": "https://example.com/avatar.jpg",
    "reference_image_url": "https://example.com/reference.jpg",
    "has_profile_images": true,
    "category": "配角"
  }'
```

### 示例4: 通过任务ID关联媒体

```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "角色-王五",
    "description": "已经生成过图片的角色",
    "attributes": {
      "age": "28",
      "appearance": "高个子，金发，绿色眼睛"
    },
    "reference_image_task_id": "graph-task-id-here",
    "category": "主角"
  }'
```

### 示例5: 从大纲生成的角色（自动保存时使用）

```bash
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "反派-赵六",
    "display_name": "赵六",
    "description": "故事的反派角色",
    "attributes": {
      "age": "40",
      "appearance": "高大威猛，黑发，眼神锐利",
      "voice_description": "低沉的男声，带有威胁感",
      "personality": "冷酷、狡猾、野心勃勃"
    },
    "source_type": "outline",
    "source_outline_task_id": "outline-task-id-here",
    "category": "反派",
    "tags": ["反派", "男性", "冷酷"]
  }'
```

## 响应示例

### 成功响应

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "user_id": "user-id-here",
    "name": "主角-张三",
    "display_name": "张三",
    "description": "故事的主角，一个勇敢的年轻人",
    "attributes": {
      "age": "25",
      "appearance": "高个子（180cm），黑发，蓝色眼睛",
      "voice_description": "温和的男声，语速适中",
      "clothing_style": "休闲",
      "personality": "开朗、友善、幽默、勇敢",
      "others": "喜欢阅读和旅行"
    },
    "avatar_url": null,
    "reference_image_url": null,
    "reference_video_url": null,
    "reference_audio_url": null,
    "avatar_task_id": null,
    "reference_image_task_id": null,
    "reference_video_task_id": null,
    "reference_audio_task_id": null,
    "has_profile_images": false,
    "has_profile_audio": false,
    "has_profile_video": false,
    "tags": ["主角", "男性", "勇敢"],
    "category": "主角",
    "is_public": false,
    "source_type": "manual",
    "source_outline_task_id": null,
    "usage_count": 0,
    "last_used_at": null,
    "created_at": "2026-01-25T04:00:00.000Z",
    "updated_at": "2026-01-25T04:00:00.000Z"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "Failed to create character",
  "message": "错误详情"
}
```

## 注意事项

1. **布尔字段自动同步**: 如果设置了媒体URL或任务ID，系统会自动更新对应的布尔字段（`has_profile_images`、`has_profile_audio`、`has_profile_video`）

2. **user_id自动设置**: 不需要在请求体中提供`user_id`，系统会从JWT token中自动获取

3. **source_type**: 
   - `manual`: 手动创建（默认）
   - `outline`: 从大纲生成
   - `import`: 导入

4. **媒体关联**: 
   - 可以直接设置URL（`avatar_url`等）
   - 也可以通过任务ID关联（`avatar_task_id`等）
   - 系统会优先从任务结果中获取URL

5. **tags**: 必须是字符串数组，例如：`["标签1", "标签2"]`
