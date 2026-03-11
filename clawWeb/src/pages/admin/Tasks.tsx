import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';

export function AdminTasksPage() {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<any[]>([
    { id: 1, type: '图片生成', user: 'user1', status: 'completed', progress: 100, startTime: '2024-03-09 10:30', endTime: '2024-03-09 10:35' },
    { id: 2, type: '文本写作', user: 'user2', status: 'processing', progress: 65, startTime: '2024-03-09 11:15', endTime: '-' },
    { id: 3, type: '音频生成', user: 'admin', status: 'failed', progress: 30, startTime: '2024-03-09 09:45', endTime: '2024-03-09 09:50' },
    { id: 4, type: '视频生成', user: 'user3', status: 'pending', progress: 0, startTime: '2024-03-09 12:00', endTime: '-' },
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'processing': return 'warning';
      case 'failed': return 'danger';
      case 'pending': return 'info';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'processing': return '处理中';
      case 'failed': return '失败';
      case 'pending': return '等待中';
      default: return status;
    }
  };

  return (
    <div className="admin-tasks-page">
      <div className="page-header">
        <h1>{t('sidebar.taskMonitor')}</h1>
        <p>监控系统任务执行状态</p>
      </div>

      <div className="tasks-content">
        <div className="tasks-filters">
          <div className="filter-group">
            <label>任务类型</label>
            <select defaultValue="all">
              <option value="all">全部类型</option>
              <option value="image">图片生成</option>
              <option value="text">文本写作</option>
              <option value="audio">音频生成</option>
              <option value="video">视频生成</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>状态</label>
            <select defaultValue="all">
              <option value="all">全部状态</option>
              <option value="completed">已完成</option>
              <option value="processing">处理中</option>
              <option value="failed">失败</option>
              <option value="pending">等待中</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>时间范围</label>
            <select defaultValue="today">
              <option value="today">今天</option>
              <option value="week">本周</option>
              <option value="month">本月</option>
            </select>
          </div>
        </div>

        <div className="tasks-table">
          <table>
            <thead>
              <tr>
                <th>任务ID</th>
                <th>类型</th>
                <th>用户</th>
                <th>状态</th>
                <th>进度</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>#{task.id}</td>
                  <td>{task.type}</td>
                  <td>{task.user}</td>
                  <td>
                    <span className={`task-status ${getStatusColor(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </td>
                  <td>
                    <div className="progress-bar">
                      <div 
                        className={`progress-fill ${getStatusColor(task.status)}`}
                        style={{ width: `${task.progress}%` }}
                      >
                        {task.progress}%
                      </div>
                    </div>
                  </td>
                  <td>{task.startTime}</td>
                  <td>{task.endTime}</td>
                  <td>
                    <div className="task-actions">
                      <button className="btn-small">详情</button>
                      {task.status === 'processing' && (
                        <button className="btn-small btn-danger">取消</button>
                      )}
                      {task.status === 'failed' && (
                        <button className="btn-small">重试</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="tasks-summary">
          <div className="summary-card">
            <h3>任务统计</h3>
            <div className="summary-stats">
              <div className="summary-item">
                <span className="summary-label">今日任务</span>
                <span className="summary-value">42</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">成功率</span>
                <span className="summary-value success">92.5%</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">平均耗时</span>
                <span className="summary-value">3.2分钟</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">队列等待</span>
                <span className="summary-value warning">8</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}