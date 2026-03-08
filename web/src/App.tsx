import { useState, useMemo, useEffect } from 'react';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import Characters from './pages/Characters';
import Outline from './pages/Outline';
import Writing from './pages/Writing';
import Video from './pages/Video';
import Graph from './pages/Graph';
import Audio from './pages/Audio';
import Knowledge from './pages/Knowledge';
import VirtualFolder from './pages/VirtualFolder';
import Account from './pages/Account';
import FormOptions from './pages/FormOptions';
import PromptConfig from './pages/PromptConfig';
import AdminSensitiveWords from './pages/AdminSensitiveWords';
import AdminKnowledgeDefaults from './pages/AdminKnowledgeDefaults';
import Users from './pages/Users';
import AdminStats from './pages/AdminStats';
import AdminTasks from './pages/AdminTasks';
import ProviderRoutes from './pages/ProviderRoutes';
import './App.css';

type PageId =
  | 'dashboard'
  | 'users'
  | 'adminStats'
  | 'adminTasks'
  | 'adminProviders'
  | 'characters'
  | 'outline'
  | 'writing'
  | 'video'
  | 'graph'
  | 'audio'
  | 'knowledge'
  | 'virtualFolder'
  | 'account'
  | 'formOptions'
  | 'promptConfig'
  | 'adminSensitiveWords'
  | 'adminKnowledge';

// 生成任务
const TASK_GROUP = {
  title: '生成任务',
  items: [
    { id: 'characters' as PageId, label: '角色' },
    { id: 'outline' as PageId, label: '大纲' },
    { id: 'writing' as PageId, label: '写作' },
    { id: 'graph' as PageId, label: '图片' },
    { id: 'audio' as PageId, label: '音频' },
    { id: 'video' as PageId, label: '视频' },
  ],
};

// 资产管理
const ASSET_GROUP = {
  title: '资产管理',
  items: [
    { id: 'knowledge' as PageId, label: '知识库' },
    { id: 'virtualFolder' as PageId, label: '虚拟文件夹' },
    { id: 'account' as PageId, label: '我的账号信息' },
  ],
};

// 仅 Admin 可见
const ADMIN_GROUP = {
  title: '管理员操作',
  items: [
    { id: 'adminProviders' as PageId, label: 'Provider 管理' },
    { id: 'users' as PageId, label: '用户管理' },
    { id: 'adminStats' as PageId, label: '系统概览' },
    { id: 'adminTasks' as PageId, label: '任务监控' },
    { id: 'formOptions' as PageId, label: '表单选项' },
    { id: 'promptConfig' as PageId, label: '提示词工程' },
    { id: 'adminSensitiveWords' as PageId, label: '敏感词管理' },
    { id: 'adminKnowledge' as PageId, label: '系统知识库管理' },
  ],
};

function getAllItems(isAdmin: boolean) {
  const items = [...TASK_GROUP.items, ...ASSET_GROUP.items];
  if (isAdmin) {
    items.push(...ADMIN_GROUP.items);
  }
  return items;
}

function AppContent() {
  const [page, setPage] = useState<PageId>('dashboard');
  const { isLoggedIn, isAdmin, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const on401 = () => {
      logout();
      setPage('dashboard');
    };
    window.addEventListener('auth:401', on401);
    return () => window.removeEventListener('auth:401', on401);
  }, [logout]);

  const sidebarGroups = useMemo(() => {
    const groups: { title: string; items: { id: PageId; label: string }[] }[] = [
      TASK_GROUP,
      ASSET_GROUP,
    ];
    if (isAdmin) {
      groups.push(ADMIN_GROUP);
    }
    return groups;
  }, [isAdmin]);

  const adminOnlyPages: PageId[] = [
    'adminProviders',
    'users',
    'adminStats',
    'adminTasks',
    'formOptions',
    'promptConfig',
    'adminSensitiveWords',
    'adminKnowledge',
  ];
  const renderPage = () => {
    if (adminOnlyPages.includes(page) && !isAdmin) {
      return <Dashboard />;
    }
    switch (page) {
      case 'dashboard':
        return <Dashboard />;
      case 'users':
        return <Users />;
      case 'adminStats':
        return <AdminStats />;
      case 'adminTasks':
        return <AdminTasks />;
      case 'adminProviders':
        return <ProviderRoutes />;
      case 'characters':
        return <Characters />;
      case 'outline':
        return <Outline />;
      case 'writing':
        return <Writing />;
      case 'video':
        return <Video />;
      case 'graph':
        return <Graph />;
      case 'audio':
        return <Audio />;
      case 'knowledge':
        return <Knowledge />;
      case 'virtualFolder':
        return <VirtualFolder />;
      case 'account':
        return <Account />;
      case 'formOptions':
        return <FormOptions />;
      case 'promptConfig':
        return <PromptConfig />;
      case 'adminSensitiveWords':
        return <AdminSensitiveWords />;
      case 'adminKnowledge':
        return <AdminKnowledgeDefaults />;
      default:
        return <Dashboard />;
    }
  };

  const pageLabel = getAllItems(!!isAdmin).find((i) => i.id === page)?.label ?? page;

  return (
    <div className="app-dashboard">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <button
          type="button"
          className="sidebar-brand"
          onClick={() => {
            setPage('dashboard');
            setSidebarOpen(false);
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        >
          SuperMX
        </button>
        <nav className="sidebar-nav">
          {sidebarGroups.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              <ul className="nav-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={page === item.id ? 'active' : ''}
                      onClick={() => {
                        setPage(item.id);
                        setSidebarOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="main-wrap">
        <header className="dashboard-header">
          <h1 className="dashboard-title">{page === 'dashboard' ? '首页' : pageLabel}</h1>
          <div className="header-actions">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              ☰
            </button>
            {isLoggedIn ? (
              <>
                <span className="user-status">已登录</span>
                <button type="button" className="btn-logout" onClick={logout}>
                  退出
                </button>
              </>
            ) : (
              <span className="user-status">未登录</span>
            )}
          </div>
        </header>
        <main className="dashboard-main">
          <div className="dashboard-main-inner">{renderPage()}</div>
        </main>
      </div>
    </div>
  );
}

/** 与 App.css 一致：非 light 偏好时使用 dark（默认深色） */
function usePrefersDark() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(prefers-color-scheme: light)').matches;
  });
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setDark(!m.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);
  return dark;
}

export default function App() {
  const isDark = usePrefersDark();
  const themeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        // 深色为主，同时为未来浅色主题保留结构
        colorBgContainer: isDark ? '#1e1e1e' : '#ffffff',
        colorBgElevated: isDark ? '#252525' : '#f7f7f7',
        colorBorder: isDark ? '#333333' : '#d0d0d0',
        colorBorderSecondary: isDark ? '#444444' : '#e0e0e0',
        colorPrimary: '#6366f1',
        borderRadius: 8,
        fontSize: 14,
        controlHeight: 36,
        padding: 12,
      },
    }),
    [isDark]
  );

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntdApp>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
