import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { login, setBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';

function LoginForm() {
  const { setToken } = useAuth();
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
  const { isLoggedIn, isAdmin, user } = useAuth();
  const baseUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('api_base_url') || '（留空则用当前域名代理）' : '';
  const sessionExpired = useMemo(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return !isLoggedIn && !!sessionStorage.getItem('auth_401');
  }, [isLoggedIn]);

  useEffect(() => {
    if (!sessionExpired) return;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('auth_401');
    }
  }, [sessionExpired]);

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
          <div className="dashboard-hero">
            <div className="dashboard-hero-left">
              <div className="dashboard-hero-kicker">
                <Sparkles size={16} />
                <span>AI Workflow Console</span>
              </div>
              <h3 className="dashboard-hero-title">描述你的目标，我们来生成与编排</h3>
              <p className="dashboard-hero-subtitle">
                从角色设定 → 大纲 → 写作 → 图片/音频/视频，一站式调试与生产。
              </p>
              <div className="dashboard-hero-inputRow">
                <input
                  className="dashboard-hero-input"
                  placeholder="输入一个提示词或任务描述（仅 UI，占位）"
                  aria-label="提示词输入（占位）"
                />
                <button type="button" className="dashboard-hero-cta" aria-label="开始（占位）">
                  开始
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="dashboard-hero-meta">
                <span className="dashboard-hero-pill">已登录 {user?.username ?? ''}</span>
                <span className="dashboard-hero-pill">{isAdmin ? 'Admin' : '普通用户'}</span>
                <span className="dashboard-hero-pill truncate">API: {baseUrl}</span>
              </div>
            </div>
            <div className="dashboard-hero-right">
              <div className="dashboard-miniCard">
                <div className="dashboard-miniCard-label">状态</div>
                <div className="dashboard-miniCard-value">Online</div>
              </div>
              <div className="dashboard-miniCard">
                <div className="dashboard-miniCard-label">建议路径</div>
                <div className="dashboard-miniCard-value">Outline → Writing → Video</div>
              </div>
            </div>
          </div>

          <p className="hint">
            左侧「数据与接口测试」可调试各业务接口；Admin 用户可访问「控制监控」进行用户管理等操作。
          </p>
          <div className="dashboard-bento">
            <h3>快捷入口</h3>
            <div className="bento-grid">
              <div className="bento-card">
                <div className="bento-title">生成任务</div>
                <div className="bento-desc">角色 / 大纲 / 写作 / 图片 / 音频 / 视频</div>
                <div className="bento-foot">从左侧导航进入 <ArrowRight size={14} /></div>
              </div>
              <div className="bento-card">
                <div className="bento-title">资产管理</div>
                <div className="bento-desc">知识库 / 虚拟文件夹 / 账号信息</div>
                <div className="bento-foot">组织你的素材与上下文 <ArrowRight size={14} /></div>
              </div>
              {isAdmin ? (
                <div className="bento-card">
                  <div className="bento-title">管理员</div>
                  <div className="bento-desc">Provider / 用户 / 概览 / 任务 / 提示词工程</div>
                  <div className="bento-foot">监控与配置 <ArrowRight size={14} /></div>
                </div>
              ) : (
                <div className="bento-card">
                  <div className="bento-title">提示</div>
                  <div className="bento-desc">需要 Admin 权限才能访问部分控制台能力</div>
                  <div className="bento-foot">联系管理员开通 <ArrowRight size={14} /></div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
