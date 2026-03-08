import { useState, useEffect } from 'react';
import { login, setBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';

function LoginForm() {
  const { setToken, logout } = useAuth();
  const [baseUrl, setBaseUrlState] = useState(localStorage.getItem('api_base_url') ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveBaseUrl = () => {
    setBaseUrl(baseUrl);
    setMessage('Base URL 已保存');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const res = await login(username, password);
    setLoading(false);
    if (res.error) {
      setMessage('登录失败: ' + res.error);
      return;
    }
    if ('ok' in res && res.ok && res.accessToken) {
      setToken(res.accessToken, res.user ?? null);
      setMessage('登录成功');
    }
  };

  return (
    <div className="login-form">
      <h3>配置与登录</h3>
      <div className="form-group">
        <label>API Base URL（Gateway 地址）</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrlState(e.target.value)}
            placeholder="留空则用当前域名（Vite 代理到 localhost:3000）"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={handleSaveBaseUrl}>
            保存
          </button>
        </div>
      </div>
      <form onSubmit={handleLogin} className="form-group">
        <label>用户名</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <label>密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { isLoggedIn, isAdmin, user, logout } = useAuth();
  const [sessionExpired, setSessionExpired] = useState(false);
  const baseUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('api_base_url') || '（留空则用当前域名代理）' : '';

  useEffect(() => {
    if (!isLoggedIn && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_401')) {
      sessionStorage.removeItem('auth_401');
      setSessionExpired(true);
    }
  }, [isLoggedIn]);

  return (
    <section className="page-card dashboard-home">
      <h2>首页</h2>

      {!isLoggedIn ? (
        <>
          {sessionExpired && <p className="message" style={{ color: 'var(--color-warning, #faad14)' }}>登录已过期，请重新登录</p>}
          <LoginForm />
        </>
      ) : (
        <>
          <div className="dashboard-stats">
            <div className="stat-card">
              <span className="stat-label">登录状态</span>
              <span className="stat-value">已登录 {user?.username ?? ''}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">角色</span>
              <span className="stat-value">{isAdmin ? 'Admin' : '普通用户'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">API Base URL</span>
              <span className="stat-value truncate">{baseUrl}</span>
            </div>
          </div>
          <div className="header-actions" style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn-logout" onClick={logout}>
              退出登录
            </button>
          </div>
          <p className="hint">
            左侧「数据与接口测试」可调试各业务接口；Admin 用户可访问「控制监控」进行用户管理等操作。
          </p>
          <div className="quick-links">
            <h3>快捷入口</h3>
            <ul>
              <li>角色 / 大纲 / 写作 / 任务 / 视频 — 全流程测试（大纲→写作→视频）</li>
              <li>图文 / 文本 / 音频 / 知识库 / 媒体 — 其他接口调试</li>
              <li>表单选项 — 获取写作/视频/图文表单参数</li>
              <li>提示词 · 配置管理 — Admin 编辑 rules_i18n / output_format_i18n</li>
              <li>提示词 · 索引说明 — 配置文件路径与优化说明</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
