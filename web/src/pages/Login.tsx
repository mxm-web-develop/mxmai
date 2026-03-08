import { useState } from 'react';
import { login, setBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { setToken, isLoggedIn, logout } = useAuth();
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
      setToken(res.accessToken);
      setMessage('登录成功');
    }
  };

  if (isLoggedIn) {
    return (
      <section className="page-card">
        <h2>已登录</h2>
        <p>Token 已存在，可进行接口调试。</p>
        <button type="button" onClick={logout}>退出登录</button>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h2>登录 &amp; 配置</h2>
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
          <button type="button" onClick={handleSaveBaseUrl}>保存</button>
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
        <button type="submit" disabled={loading}>{loading ? '登录中...' : '登录'}</button>
      </form>
      {message && <p className="message">{message}</p>}
    </section>
  );
}
