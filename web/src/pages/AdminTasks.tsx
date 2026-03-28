import { useState, useEffect } from 'react';
import { Table, Input, Select, Button, Space, Tooltip } from 'antd';
import { getAdminTasks, cancelTask, recoverTask, retryTask, type AdminTaskItem } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ColumnsType } from 'antd/es/table';

export default function AdminTasks() {
  const { isLoggedIn } = useAuth();
  const [tasks, setTasks] = useState<AdminTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<AdminTaskItem | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<'content' | 'raw'>('content');

  const formatJsonPreview = (input: unknown, maxLen = 220) => {
    if (input == null) return '-';
    try {
      const s = JSON.stringify(input);
      if (!s) return '-';
      return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
    } catch {
      return '[Unserializable JSON]';
    }
  };

  const formatJsonPretty = (input: unknown) => {
    if (input == null) return '';
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return '[Unserializable JSON]';
    }
  };

  const fetchTasks = async () => {
    if (!isLoggedIn) {
      setError('请先使用 Admin 账号登录');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getAdminTasks({
      type: type || undefined,
      status: status || undefined,
      userId: userId.trim() || undefined,
      limit,
      offset,
    });
    setLoading(false);
    if (res.error) {
      setError(res.status === 403 ? '需要 Admin 权限' : res.error);
      return;
    }
    const body = res.data as { success?: boolean; data?: { tasks: AdminTaskItem[]; total: number } };
    const data = body?.data;
    if (data?.tasks) setTasks(data.tasks);
    if (data?.total != null) setTotal(data.total);
  };

  useEffect(() => {
    fetchTasks();
  }, [offset, type, status, userId, isLoggedIn]);

  const handleAction = async (taskId: string, action: 'cancel' | 'recover' | 'retry') => {
    setActionLoading(taskId);
    const fn = action === 'cancel' ? cancelTask : action === 'recover' ? recoverTask : retryTask;
    const res = await fn(taskId);
    setActionLoading(null);
    if (!res.error) fetchTasks();
    else setError(res.error);
  };

  const columns: ColumnsType<AdminTaskItem> = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      key: 'id',
      width: 180,
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <span>{id}</span>
        </Tooltip>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (v: string) => v ?? '-',
    },
    {
      title: '业务类型',
      key: 'businessType',
      width: 100,
      render: (_: unknown, r: AdminTaskItem) => {
        const req = r.requestParams as { graphType?: string; params?: { writing_type?: string } } | undefined;
        if (r.type === 'graph') {
          const raw = (r.metadata as any)?.graphBusinessType ?? req?.graphType;
          if (!raw) return '-';
          const labels: Record<string, string> = {
            photograph: '摄影',
            design: '设计',
            painting: '绘画',
          };
          return labels[raw] ?? raw;
        }
        if (r.type === 'writing') {
          const raw = (r.metadata as any)?.writingBusinessType ?? req?.params?.writing_type;
          if (!raw) return '-';
          const labels: Record<string, string> = {
            outlines: '大纲',
            articles: '文章',
            'voice-scripts': '口播稿',
            'storyboard-scripts': '分镜脚本',
            lyrics: '歌词',
            'suno-lyrics': '歌词',
            'media-post': '媒体帖',
            reviews: '评论',
            resumes: '简历',
          };
          return labels[raw] ?? raw;
        }
        return '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => v ?? '-',
    },
    {
      title: 'Provider',
      key: 'provider',
      width: 100,
      render: (_, r) => r.metadata?.provider ?? '-',
    },
    {
      title: '模型',
      key: 'model',
      width: 140,
      ellipsis: true,
      render: (_, r) => {
        const v = r.metadata?.model ?? '-';
        return typeof v === 'string' && v.length > 24 ? (
          <Tooltip title={v}>
            <span>{v}</span>
          </Tooltip>
        ) : (
          v
        );
      },
    },
    {
      title: '用户',
      key: 'user',
      width: 120,
      render: (_, r) => {
        const name = r.metadata?.userName ?? r.metadata?.userId ?? '-';
        const uid = r.metadata?.userId;
        return uid ? (
          <Tooltip title={`用户 ID: ${uid}`}>
            <span>{name}</span>
          </Tooltip>
        ) : (
          name
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: 'Provider 传参',
      key: 'providerParams',
      width: 200,
      ellipsis: true,
      render: (_, r) => {
        const preview = formatJsonPreview(r.requestParams, 80);
        return preview !== '-' ? <span className="muted">{preview}</span> : '-';
      },
    },
    {
      title: '错误信息',
      key: 'error',
      width: 180,
      ellipsis: true,
      render: (_, r) => {
        const err =
          r.status === 'failed' || r.status === 'network_error' || r.progress?.error
            ? r.progress?.error || '无详细错误'
            : '-';
        return err !== '-' ? (
          <span style={{ color: 'var(--admin-tasks-error-color, #f87171)' }}>{err}</span>
        ) : (
          '-'
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, r) => {
        const loading = actionLoading === r.id;
        return (
          <Space size="small" wrap>
            <Button size="small" onClick={() => { setDetailTask(r); setDetailViewMode('content'); }}>
              查看详情
            </Button>
            {['pending', 'queued', 'processing'].includes(r.status) && (
              <Button size="small" disabled={actionLoading !== null} onClick={() => handleAction(r.id, 'cancel')} loading={loading}>
                取消
              </Button>
            )}
            {r.status === 'processing' && (
              <Button size="small" disabled={actionLoading !== null} onClick={() => handleAction(r.id, 'recover')} loading={loading}>
                恢复
              </Button>
            )}
            {['failed', 'processing'].includes(r.status) && (
              <Button size="small" disabled={actionLoading !== null} onClick={() => handleAction(r.id, 'retry')} loading={loading}>
                重试
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  if (!isLoggedIn) {
    return (
      <div className="page-card">
        <h2>任务监控</h2>
        <p>请先使用 Admin 账号登录后再查看。</p>
      </div>
    );
  }

  return (
    <div className="page-card admin-tasks-page">
      <h2>任务监控（Admin）</h2>
      <p className="hint">Admin 专用，查看所有用户任务，支持筛选与操作。</p>

      <Space wrap size="middle" style={{ marginBottom: 16 }}>
        <Input
          placeholder="用户 ID 筛选"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={{ width: 160 }}
          allowClear
        />
        <Select
          value={type}
          onChange={setType}
          placeholder="全部类型"
          style={{ width: 160 }}
          options={[
            { value: '', label: '全部类型' },
            { value: 'writing', label: 'writing' },
            { value: 'graph', label: 'graph' },
            { value: 'video', label: 'video' },
            { value: 'audio', label: 'audio' },
            { value: 'graph-grid9-parent', label: 'graph-grid9-parent' },
            { value: 'video-batch-parent', label: 'video-batch-parent' },
            { value: 'other', label: 'other' },
          ]}
        />
        <Select
          value={status}
          onChange={setStatus}
          placeholder="全部状态"
          style={{ width: 120 }}
          options={[
            { value: '', label: '全部状态' },
            { value: 'pending', label: 'pending' },
            { value: 'queued', label: 'queued' },
            { value: 'processing', label: 'processing' },
            { value: 'completed', label: 'completed' },
            { value: 'failed', label: 'failed' },
            { value: 'cancelled', label: 'cancelled' },
          ]}
        />
        <Button type="primary" onClick={() => { setOffset(0); fetchTasks(); }} loading={loading}>
          查询
        </Button>
      </Space>

      {error && (
        <div className="admin-tasks-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="admin-tasks-table-wrap">
        <div className="admin-tasks-table-inner">
          <Table<AdminTaskItem>
            columns={columns}
            dataSource={tasks}
            rowKey="id"
            loading={loading}
            scroll={{ x: 900, y: 'calc(100vh - 320px)' }}
            pagination={{
              current: Math.floor(offset / limit) + 1,
              pageSize: limit,
              total,
              showSizeChanger: false,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page) => setOffset((page - 1) * limit),
            }}
            size="small"
          />
        </div>
      </div>

      {detailTask && (
        <>
          <div
            className="admin-task-detail-overlay"
            onClick={() => setDetailTask(null)}
            aria-hidden="true"
          />
          <div className="admin-task-detail-panel">
            <div className="admin-task-detail-header">
              <h3 className="admin-task-detail-title">任务详情 · {detailTask.id}</h3>
              <div className="admin-task-detail-actions">
                <button
                  type="button"
                  className={`admin-task-detail-tab ${detailViewMode === 'content' ? 'active' : ''}`}
                  onClick={() => setDetailViewMode('content')}
                >
                  内容
                </button>
                <button
                  type="button"
                  className={`admin-task-detail-tab ${detailViewMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setDetailViewMode('raw')}
                >
                  查看数据
                </button>
                <button type="button" className="admin-task-detail-close" onClick={() => setDetailTask(null)}>
                  ×
                </button>
              </div>
            </div>
            <div className="admin-task-detail-body">
              {detailViewMode === 'content' ? (
                <div className="admin-task-detail-content">
                  <div className="admin-task-detail-meta">
                    类型: {detailTask.type ?? '-'} · 状态: {detailTask.status ?? '-'} · Provider: {detailTask.metadata?.provider ?? '-'} · 模型: {detailTask.metadata?.model ?? '-'} · 创建: {detailTask.createdAt ? new Date(detailTask.createdAt).toLocaleString() : '-'}
                  </div>
                  <div className="admin-task-detail-block">
                    <div className="admin-task-detail-block-title">Provider 传参</div>
                    <pre className="admin-task-detail-pre">
                      {formatJsonPretty(detailTask.requestParams) || '-'}
                    </pre>
                  </div>
                  <div className="admin-task-detail-block">
                    <div className="admin-task-detail-block-title">错误信息</div>
                    <pre className="admin-task-detail-pre admin-task-detail-error">
                      {detailTask.status === 'failed' || detailTask.status === 'network_error' || detailTask.progress?.error
                        ? detailTask.progress?.error || '无详细错误'
                        : '无'}
                    </pre>
                  </div>
                </div>
              ) : (
                <pre className="admin-task-detail-pre admin-task-detail-raw">
                  {JSON.stringify(detailTask, null, 2)}
                </pre>
              )}
            </div>
            <style>{`
              .admin-task-detail-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.7);
                z-index: 1000;
              }
              .admin-task-detail-panel {
                position: fixed;
                inset: 0;
                z-index: 1001;
                background: hsl(var(--background, 0 0% 9%));
                border: 1px solid hsl(var(--border, 0 0% 22%));
                display: flex;
                flex-direction: column;
                overflow: hidden;
              }
              .admin-task-detail-header {
                flex-shrink: 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 1.25rem;
                border-bottom: 1px solid hsl(var(--border, 0 0% 22%));
              }
              .admin-task-detail-title {
                margin: 0;
                font-size: 1rem;
                color: hsl(var(--foreground, 0 0% 98%));
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 50%;
              }
              .admin-task-detail-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
              }
              .admin-task-detail-tab {
                padding: 0.35rem 0.75rem;
                border-radius: 6px;
                border: 1px solid #444;
                background: transparent;
                color: #888;
                font-size: 0.85rem;
                cursor: pointer;
              }
              .admin-task-detail-tab:hover {
                background: #333;
                color: #e0e0e0;
              }
              .admin-task-detail-tab.active {
                background: #1e3a5f;
                color: #93c5fd;
                border-color: #1e3a5f;
              }
              .admin-task-detail-close {
                background: none;
                border: none;
                color: #888;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0 0.5rem;
                line-height: 1;
              }
              .admin-task-detail-close:hover {
                color: #e0e0e0;
              }
              .admin-task-detail-body {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                padding: 1rem 1.5rem;
              }
              .admin-task-detail-content {
                display: flex;
                flex-direction: column;
                gap: 1rem;
              }
              .admin-task-detail-meta {
                font-size: 0.8rem;
                color: #94a3b8;
              }
              .admin-task-detail-block-title {
                font-weight: 600;
                margin-bottom: 0.5rem;
                color: hsl(var(--foreground, 0 0% 98%));
              }
              .admin-task-detail-pre {
                margin: 0;
                padding: 1rem;
                background: #0f172a;
                border-radius: 8px;
                font-size: 0.8rem;
                color: #e2e8f0;
                overflow: auto;
                white-space: pre-wrap;
                word-break: break-word;
                line-height: 1.5;
                max-height: none;
              }
              .admin-task-detail-error {
                color: #f87171;
              }
              .admin-task-detail-raw {
                max-height: none;
              }
            `}</style>
          </div>
        </>
      )}
    </div>
  );
}
