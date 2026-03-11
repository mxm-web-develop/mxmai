import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';

export function AdminUsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<any[]>([
    { id: 1, username: 'admin', email: 'admin@example.com', role: '管理员', status: 'active', joinDate: '2024-01-01' },
    { id: 2, username: 'user1', email: 'user1@example.com', role: '用户', status: 'active', joinDate: '2024-02-15' },
    { id: 3, username: 'user2', email: 'user2@example.com', role: '用户', status: 'inactive', joinDate: '2024-03-01' },
  ]);

  return (
    <div className="admin-users-page">
      <div className="page-header">
        <h1>{t('sidebar.users')}</h1>
        <p>管理系统用户和权限</p>
      </div>

      <div className="users-content">
        <div className="users-actions">
          <button className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加用户
          </button>
          <div className="search-box">
            <input type="text" placeholder="搜索用户..." />
          </div>
        </div>

        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>加入时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`user-role ${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`user-status ${user.status}`}>
                      {user.status === 'active' ? '活跃' : '禁用'}
                    </span>
                  </td>
                  <td>{user.joinDate}</td>
                  <td>
                    <div className="user-actions">
                      <button className="btn-small">编辑</button>
                      <button className="btn-small">重置密码</button>
                      <button className="btn-small btn-danger">
                        {user.status === 'active' ? '禁用' : '启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}