# Postman 测试参考图上传功能

## 方法一：使用 Base64 编码的图片（推荐）

### 步骤 1: 准备图片的 Base64 数据

在终端中运行：

```bash
cd /Users/mxm_pro/Desktop/codes/supermxmai/mxmcgi

# 将图片转换为 base64（包含 data URI 前缀）
base64 -i nvhai.png | awk '{printf "data:image/png;base64,%s", $0}' > nvhai_base64.txt
base64 -i beijing.png | awk '{printf "data:image/png;base64,%s", $0}' > beijing_base64.txt
```

### 步骤 2: 在 Postman 中配置请求

1. **Method**: `POST`
2. **URL**: `http://localhost:3000/api/v1/cgi/graph/photograph`
3. **Headers**:
   - `Content-Type`: `application/json`
   - `Authorization`: `Bearer <你的JWT_TOKEN>`
   - `x-user-id`: `3f6cf0d7-1ac5-44eb-835b-5a59ec973909`

4. **Body** (选择 `raw` -> `JSON`):

```json
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
      "content": "<从 nvhai_base64.txt 复制的内容>",
      "type": "main-subject"
    },
    {
      "content": "<从 beijing_base64.txt 复制的内容>",
      "type": "background"
    }
  ]
}
```

**注意**: 将 `<从 nvhai_base64.txt 复制的内容>` 替换为实际的文件内容（整个 data URI 字符串）。

---

## 方法二：使用 Node.js 脚本（最简单）

直接运行：

```bash
cd /Users/mxm_pro/Desktop/codes/supermxmai/mxmcgi
node test-reference-image.js
```

脚本会自动：
1. 读取 `nvhai.png` 和 `beijing.png`
2. 转换为 base64
3. 构建请求
4. 发送到服务器

**注意**: 需要先更新脚本中的 `token` 为有效的 JWT token。

---

## 方法三：使用 URL（如果图片已上传到服务器）

如果图片已经上传到服务器（MinIO 或其他存储），可以直接使用 URL：

```json
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
      "content": "http://localhost:9000/user-media/path/to/nvhai.png",
      "type": "main-subject"
    },
    {
      "content": "http://localhost:9000/user-media/path/to/beijing.png",
      "type": "background"
    }
  ]
}
```

---

## 获取新的 JWT Token

如果 token 过期，需要重新登录获取：

```bash
# 通过登录接口获取新 token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "mxmmobile",
    "password": "your_password"
  }'
```

---

## 测试脚本说明

`test-reference-image.js` 脚本功能：
- ✅ 自动读取本地图片文件
- ✅ 转换为 base64 data URI
- ✅ 构建完整的请求 JSON
- ✅ 发送 HTTP 请求
- ✅ 显示响应结果和任务 ID

只需更新脚本中的 `token` 即可使用。
