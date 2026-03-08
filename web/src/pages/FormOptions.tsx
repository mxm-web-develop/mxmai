import { useState } from 'react';
import { getWritingFormOptions, getVideoFormOptions, getGraphFormOptions } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function FormOptions() {
  const { isLoggedIn } = useAuth();
  const [module, setModule] = useState<'writing' | 'video' | 'graph'>('writing');
  const [writingType, setWritingType] = useState('storyboard-scripts');
  const [outlineType, setOutlineType] = useState('short-video-storyboard');
  const [graphType, setGraphType] = useState('photograph');
  const [graphSubType, setGraphSubType] = useState('portrait');
  const [res, setRes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return setRes('请先登录');
    setLoading(true);
    let result;
    if (module === 'writing') {
      result = await getWritingFormOptions({ writing_type: writingType, outline_type: outlineType, lang: 'zh' });
    } else if (module === 'video') {
      result = await getVideoFormOptions({ lang: 'zh' });
    } else {
      result = await getGraphFormOptions({ graphType, type: graphSubType, lang: 'zh' });
    }
    setLoading(false);
    setRes(JSON.stringify(result, null, 2));
  };

  return (
    <div className="page-card admin-form-options-page">
      <h2>表单选项</h2>
      <p className="hint">获取各模块的表单/参数配置，便于与提示词（rules、outputformat）对照优化。写作：getformOptions；视频：getformOptions；图文：getformOptions。</p>
      <div className="admin-form-options-content-wrap">
        <div className="admin-form-options-content-inner">
      <form onSubmit={handleFetch} className="form-group">
        <label>模块</label>
        <select value={module} onChange={(e) => setModule(e.target.value as typeof module)}>
          <option value="writing">写作 writing</option>
          <option value="video">视频 video</option>
          <option value="graph">图文 graph</option>
        </select>
        {module === 'writing' && (
          <>
            <label>writing_type</label>
            <input value={writingType} onChange={(e) => setWritingType(e.target.value)} placeholder="storyboard-scripts" />
            <label>outline_type（可选）</label>
            <input value={outlineType} onChange={(e) => setOutlineType(e.target.value)} placeholder="short-video-storyboard" />
          </>
        )}
        {module === 'graph' && (
          <>
            <label>graphType</label>
            <input value={graphType} onChange={(e) => setGraphType(e.target.value)} placeholder="photograph" />
            <label>type</label>
            <input value={graphSubType} onChange={(e) => setGraphSubType(e.target.value)} placeholder="portrait" />
          </>
        )}
        <button type="submit" disabled={loading}>{loading ? '请求中...' : 'GET 表单选项'}</button>
        {res && <pre className="response">{res}</pre>}
      </form>
        </div>
      </div>
    </div>
  );
}
