import { useState } from 'react';
import { getMediaGraph, getMediaVideo, getMediaWriting, getMediaAudio } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Media() {
  const { isLoggedIn } = useAuth();
  const [taskId, setTaskId] = useState('');
  const [mediaType, setMediaType] = useState<'graph' | 'video' | 'writing' | 'audio'>('graph');
  const [res, setRes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !taskId.trim()) return setRes('请先登录并填写任务 ID');
    setLoading(true);
    const fn = mediaType === 'graph' ? getMediaGraph : mediaType === 'video' ? getMediaVideo : mediaType === 'writing' ? getMediaWriting : getMediaAudio;
    const result = await fn(taskId.trim());
    setLoading(false);
    setRes(JSON.stringify(result, null, 2));
  };

  return (
    <section className="page-card">
      <h2>媒体结果</h2>
      <p className="hint">按任务 ID 获取生成结果：GET /api/v1/media/graph|video|writing|audio/:taskId</p>
      <form onSubmit={handleQuery} className="form-group">
        <label>任务 ID</label>
        <input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="cgi-task id" />
        <label>类型</label>
        <select value={mediaType} onChange={(e) => setMediaType(e.target.value as typeof mediaType)}>
          <option value="graph">graph</option>
          <option value="video">video</option>
          <option value="writing">writing</option>
          <option value="audio">audio</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? '查询中...' : '查询'}</button>
        {res && <pre className="response">{res}</pre>}
      </form>
    </section>
  );
}
