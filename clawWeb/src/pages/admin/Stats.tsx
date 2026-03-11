import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';

export function AdminStatsPage() {
  const { t } = useI18n();
  const [timeRange, setTimeRange] = useState('7d');

  const stats = {
    totalUsers: 1250,
    activeUsers: 892,
    totalTasks: 5432,
    completedTasks: 5120,
    storageUsed: '45.2GB',
    apiCalls: '1.2M',
  };

  const chartData = [
    { day: '周一', tasks: 120, users: 85 },
    { day: '周二', tasks: 150, users: 92 },
    { day: '周三', tasks: 180, users: 105 },
    { day: '周四', tasks: 210, users: 118 },
    { day: '周五', tasks: 190, users: 110 },
    { day: '周六', tasks: 160, users: 95 },
    { day: '周日', tasks: 130, users: 88 },
  ];

  return (
    <div className="admin-stats-page">
      <div className="page-header">
        <h1>{t('sidebar.stats')}</h1>
        <p>系统使用情况和性能指标</p>
      </div>

      <div className="stats-content">
        <div className="stats-filters">
          <div className="time-range">
            <button 
              className={`time-btn ${timeRange === '7d' ? 'active' : ''}`}
              onClick={() => setTimeRange('7d')}
            >
              7天
            </button>
            <button 
              className={`time-btn ${timeRange === '30d' ? 'active' : ''}`}
              onClick={() => setTimeRange('30d')}
            >
              30天
            </button>
            <button 
              className={`time-btn ${timeRange === '90d' ? 'active' : ''}`}
              onClick={() => setTimeRange('90d')}
            >
              90天
            </button>
          </div>
        </div>

        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="stat-info">
              <h3>总用户数</h3>
              <p className="stat-value">{stats.totalUsers}</p>
              <p className="stat-change">+12% 较上周</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="stat-info">
              <h3>总任务数</h3>
              <p className="stat-value">{stats.totalTasks}</p>
              <p className="stat-change">+8% 较上周</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div className="stat-info">
              <h3>存储使用</h3>
              <p className="stat-value">{stats.storageUsed}</p>
              <p className="stat-change">+5% 较上周</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            </div>
            <div className="stat-info">
              <h3>API调用</h3>
              <p className="stat-value">{stats.apiCalls}</p>
              <p className="stat-change">+15% 较上周</p>
            </div>
          </div>
        </div>

        <div className="stats-chart">
          <h2>使用趋势</h2>
          <div className="chart-container">
            <div className="chart-bars">
              {chartData.map((data, index) => (
                <div key={index} className="chart-bar-group">
                  <div className="chart-bar-label">{data.day}</div>
                  <div className="chart-bar task-bar" style={{ height: `${data.tasks / 3}px` }}>
                    <span className="bar-value">{data.tasks}</span>
                  </div>
                  <div className="chart-bar user-bar" style={{ height: `${data.users * 2}px` }}>
                    <span className="bar-value">{data.users}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-color task-color"></span>
              任务数
            </div>
            <div className="legend-item">
              <span className="legend-color user-color"></span>
              活跃用户
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}