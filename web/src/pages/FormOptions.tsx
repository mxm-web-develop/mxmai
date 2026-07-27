import { useState } from 'react';
import { getTaskFormConfig, getTaskFormConfigList } from '../api/client';
import { pageCardTitle } from '../components/PageHint';
import { useAuth } from '../context/AuthContext';

export default function FormOptions() {
  const { isLoggedIn } = useAuth();
  const [scope, setScope] = useState('writing');
  const [taskKey, setTaskKey] = useState('articles');
  const [subtype, setSubtype] = useState('');
  const [res, setRes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFetchList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return setRes('请先登录');
    setLoading(true);
    const result = await getTaskFormConfigList({ scope });
    setLoading(false);
    setRes(JSON.stringify(result, null, 2));
  };

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return setRes('请先登录');
    setLoading(true);
    const result = await getTaskFormConfig({
      scope,
      taskKey,
      subtype: subtype.trim() || undefined,
    });
    setLoading(false);
    setRes(JSON.stringify(result, null, 2));
  };

  return (
    <div className="page-card admin-form-options-page">
      <h2>
        {pageCardTitle('表单选项', {
          title: '接口说明',
          description: (
            <>
              与 Admin 业务管理一致：使用 Task V2 的 <code>GET /api/v2/tasks/form-config/list</code> 与{' '}
              <code>GET /api/v2/tasks/form-config</code>（对应 prompt_engineering_config 中的 formSchema）。
            </>
          ),
        })}
      </h2>
      <div className="admin-form-options-content-wrap">
        <div className="admin-form-options-content-inner">
          <form onSubmit={handleFetchList} className="form-group" style={{ marginBottom: 16 }}>
            <label>scope（列表）</label>
            <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="writing / graph / video …" />
            <button type="submit" disabled={loading}>
              {loading ? '请求中...' : 'GET form-config/list'}
            </button>
          </form>
          <form onSubmit={handleFetch} className="form-group">
            <label>scope</label>
            <input value={scope} onChange={(e) => setScope(e.target.value)} />
            <label>taskKey</label>
            <input value={taskKey} onChange={(e) => setTaskKey(e.target.value)} placeholder="articles / photograph …" />
            <label>subtype（可选）</label>
            <input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="如 graph 子类型 portrait" />
            <button type="submit" disabled={loading}>
              {loading ? '请求中...' : 'GET form-config'}
            </button>
            {res && <pre className="response">{res}</pre>}
          </form>
        </div>
      </div>
    </div>
  );
}
