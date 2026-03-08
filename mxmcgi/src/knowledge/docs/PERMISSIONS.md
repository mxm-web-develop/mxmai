# 知识库权限控制说明

## 权限规则

### Admin 账号权限

Admin 账号（`user.role === 'admin'`）拥有以下权限：

1. **创建知识库**
   - ✅ 可以创建公开的知识库（`is_public=true`）
   - ✅ 可以创建私有知识库（`is_public=false`）
   - ✅ 可以创建内置知识库（`is_builtin=true`）

2. **更新知识库**
   - ✅ 可以更新任何知识库
   - ✅ 可以将任何知识库设置为公开

3. **删除知识库**
   - ✅ 可以删除任何知识库

4. **上传文件**
   - ✅ 可以上传文件到任何知识库
   - ✅ 可以上传公开文档

5. **删除文档**
   - ✅ 可以删除任何文档

### 个人账号权限

个人账号（普通用户）拥有以下权限：

1. **创建知识库**
   - ✅ 可以创建私有知识库（`is_public=false`，强制）
   - ❌ **不能**创建公开的知识库（会被拒绝，返回 403）
   - ❌ **不能**创建内置知识库（`is_builtin` 会被强制设置为 `false`）

2. **更新知识库**
   - ✅ 可以更新**自己创建**的知识库
   - ❌ **不能**更新其他用户创建的知识库
   - ❌ **不能**将知识库设置为公开（会被拒绝，返回 403）

3. **删除知识库**
   - ✅ 可以删除**自己创建**的知识库
   - ❌ **不能**删除其他用户创建的知识库

4. **上传文件**
   - ✅ 可以上传文件到**自己创建**的知识库
   - ❌ **不能**上传文件到其他用户创建的知识库
   - ⚠️ 上传的文档默认不公开（`is_public=false`）

5. **删除文档**
   - ✅ 可以删除**自己上传**的文档
   - ❌ **不能**删除其他用户上传的文档

## API 接口权限要求

| 接口 | 方法 | Admin | 个人账号 |
|------|------|-------|----------|
| `/knowledge/bases` | POST | ✅ 可创建公开/私有 | ✅ 只能创建私有 |
| `/knowledge/bases` | GET | ✅ 查看所有 | ✅ 查看所有（过滤） |
| `/knowledge/bases/:name` | GET | ✅ 查看任何 | ✅ 查看任何 |
| `/knowledge/bases/:name` | PUT | ✅ 更新任何 | ✅ 只能更新自己的 |
| `/knowledge/bases/:name` | DELETE | ✅ 删除任何 | ✅ 只能删除自己的 |
| `/knowledge/bases/:name/upload` | POST | ✅ 上传到任何 | ✅ 只能上传到自己的 |
| `/knowledge/bases/:name/documents` | GET | ✅ 查看所有 | ✅ 查看所有（过滤） |
| `/knowledge/documents/:id` | DELETE | ✅ 删除任何 | ✅ 只能删除自己的 |
| `/knowledge/bases/:name/search` | POST | ✅ 搜索任何 | ✅ 搜索任何（过滤） |

## 权限检查实现

权限检查通过以下方式实现：

1. **用户角色检查**：
   ```typescript
   async function isAdminUser(req: Request): Promise<boolean> {
     // 1. 检查请求头中的 x-user-role
     // 2. 查询数据库中的 user.role
     // 3. 检查是否是测试用的 admin-test-user
   }
   ```

2. **资源所有权检查**：
   ```typescript
   // 检查知识库是否属于当前用户
   if (!isAdmin && existingKb.owner_id !== userId) {
     return res.status(403).json({ error: 'Forbidden' });
   }
   ```

3. **公开性限制**：
   ```typescript
   // 非管理员不能创建/更新为公开
   if (!isAdmin && is_public === true) {
     return res.status(403).json({ error: 'Only admin can create public KB' });
   }
   ```

## 测试账号

### Admin 测试账号

使用 `ADMIN_TOKEN` 环境变量进行测试：

```bash
# 设置环境变量
export ADMIN_TOKEN=your-admin-token

# 使用 Admin Token 请求
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "public-kb",
    "display_name": "公开知识库",
    "is_public": true
  }'
```

### 普通用户测试

使用 JWT Token 进行测试：

```bash
# 使用普通用户 Token 请求
curl -X POST http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <user-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "private-kb",
    "display_name": "私有知识库",
    "is_public": false
  }'
```

## 错误响应

### 403 Forbidden

当用户尝试执行没有权限的操作时，返回：

```json
{
  "success": false,
  "error": "Only admin users can create public knowledge bases"
}
```

### 404 Not Found

当资源不存在时，返回：

```json
{
  "success": false,
  "error": "Knowledge base \"xxx\" not found"
}
```

## 注意事项

1. **Gateway 认证**：所有知识库接口都需要通过 Gateway 认证（`authMiddleware`）
2. **用户 ID 传递**：Gateway 会将用户 ID 通过 `x-user-id` header 传递给后端服务
3. **角色查询**：如果 Gateway 没有传递 `x-user-role`，服务会查询数据库获取用户角色
4. **性能考虑**：权限检查会查询数据库，建议在 Gateway 层传递用户角色信息以减少数据库查询

