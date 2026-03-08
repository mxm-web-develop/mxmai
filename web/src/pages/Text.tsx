import { useState } from 'react';
import { postTextModel } from '../api/client';
import { useAuth } from '../context/AuthContext';

const defaultBody = `{
  "prompt": "用一句话介绍什么是提示词工程",
  "max_tokens": 500
}`;

export default function Text() {
  const { isLoggedIn } = useAuth();
  const [modelName, setModelName] = useState('default');
  const [body, setBody] = useState(defaultBody);
  const [res, setRes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return setRes('请先登录');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      setRes('JSON 格式错误');
      return;
    }
    setLoading(true);
    const result = await postTextModel(modelName, parsed);
    setLoading(false);
    setRes(JSON.stringify(result, null, 2));
  };

  return (
    <section className="page-card">
      <h2>文本生成</h2>
      <p className="hint">POST /api/v1/cgi/text/:modelName — 通用文本生成，按后端配置的模型名调用。</p>
      <form onSubmit={handleSubmit} className="form-group">
        <label>模型名（path 参数）</label>
        <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="例如 default" />
        <label>请求体（JSON）</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} spellCheck={false} />
        <button type="submit" disabled={loading}>{loading ? '提交中...' : '提交'}</button>
        {res && <pre className="response">{res}</pre>}
      </form>
    </section>
  );
}
