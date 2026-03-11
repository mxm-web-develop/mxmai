import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

export function AccountPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'api'>('profile');
  const [profile, setProfile] = useState({
    username: user?.username || '用户',
    email: 'user@example.com',
    phone: '13800138000',
    avatar: 'https://via.placeholder.com/100',
  });

  return (
    <div className="account-page">
      <div className="page-header">
        <h1>{t('sidebar.account')}</h1>
        <p>管理个人资料和账户设置</p>
      </div>

      <div className="account-content">
        <div className="account-tabs">
          <button
            className={`account-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            个人资料
          </button>
          <button
            className={`account-tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            安全设置
          </button>
          <button
            className={`account-tab ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API密钥
          </button>
        </div>

        <div className="account-panel">
          {activeTab === 'profile' && (
            <div className="profile-section">
              <div className="profile-avatar">
                <img src={profile.avatar} alt="头像" />
                <button className="btn-secondary">更换头像</button>
              </div>
              
              <div className="profile-form">
                <div className="form-group">
                  <label>用户名</label>
                  <input type="text" value={profile.username} readOnly />
                </div>
                <div className="form-group">
                  <label>邮箱</label>
                  <input type="email" value={profile.email} />
                </div>
                <div className="form-group">
                  <label>手机号</label>
                  <input type="tel" value={profile.phone} />
                </div>
                <button className="btn-primary">保存更改</button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="security-section">
              <div className="security-item">
                <h3>修改密码</h3>
                <div className="form-group">
                  <label>当前密码</label>
                  <input type="password" />
                </div>
                <div className="form-group">
                  <label>新密码</label>
                  <input type="password" />
                </div>
                <div className="form-group">
                  <label>确认新密码</label>
                  <input type="password" />
                </div>
                <button className="btn-primary">更新密码</button>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="api-section">
              <div className="api-actions">
                <button className="btn-primary">生成新API密钥</button>
              </div>
              
              <div className="api-keys">
                <div className="api-key-item">
                  <div className="api-key-info">
                    <h3>生产环境密钥</h3>
                    <p>sk-*****1234</p>
                    <p>创建时间: 2024-03-01</p>
                  </div>
                  <div className="api-key-actions">
                    <button className="btn-small">复制</button>
                    <button className="btn-small btn-danger">撤销</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}