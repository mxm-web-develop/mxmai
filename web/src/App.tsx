import React, { useState, useMemo, useEffect } from 'react';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import {
  AudioLines,
  BookOpenText,
  Database,
  FileText,
  Gauge,
  Globe,
  ImageIcon,
  ListChecks,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  UserCircle2,
  Users2,
  Video as VideoIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
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
  id: 'tasks',
  items: [
    { id: 'characters' as PageId, labelKey: 'nav.items.characters' },
    { id: 'outline' as PageId, labelKey: 'nav.items.outline' },
    { id: 'writing' as PageId, labelKey: 'nav.items.writing' },
    { id: 'graph' as PageId, labelKey: 'nav.items.graph' },
    { id: 'audio' as PageId, labelKey: 'nav.items.audio' },
    { id: 'video' as PageId, labelKey: 'nav.items.video' },
  ],
};

// 资产管理
const ASSET_GROUP = {
  id: 'assets',
  items: [
    { id: 'knowledge' as PageId, labelKey: 'nav.items.knowledge' },
    { id: 'virtualFolder' as PageId, labelKey: 'nav.items.virtualFolder' },
    { id: 'account' as PageId, labelKey: 'nav.items.account' },
  ],
};

// 仅 Admin 可见
const ADMIN_GROUP = {
  id: 'admin',
  items: [
    { id: 'adminProviders' as PageId, labelKey: 'nav.items.adminProviders' },
    { id: 'users' as PageId, labelKey: 'nav.items.users' },
    { id: 'adminStats' as PageId, labelKey: 'nav.items.adminStats' },
    { id: 'adminTasks' as PageId, labelKey: 'nav.items.adminTasks' },
    { id: 'formOptions' as PageId, labelKey: 'nav.items.formOptions' },
    { id: 'promptConfig' as PageId, labelKey: 'nav.items.promptConfig' },
    { id: 'adminSensitiveWords' as PageId, labelKey: 'nav.items.adminSensitiveWords' },
    { id: 'adminKnowledge' as PageId, labelKey: 'nav.items.adminKnowledge' },
  ],
};

type ThemeMode = 'light' | 'dark';

function applyHtmlClass(isDark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('mxm-theme') as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') return stored;
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  });

  useEffect(() => {
    applyHtmlClass(mode === 'dark');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mxm-theme', mode);
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const stored = window.localStorage.getItem('mxm-theme') as ThemeMode | null;
      if (stored === 'light' || stored === 'dark') return;
      const prefersLight = m.matches;
      const next: ThemeMode = prefersLight ? 'light' : 'dark';
      applyHtmlClass(next === 'dark');
      setModeState(next);
    };
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
  };

  return { mode, isDark: mode === 'dark', setMode };
}

interface AppContentProps {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

function AppContent({ mode, isDark, setMode }: AppContentProps) {
  const [page, setPage] = useState<PageId>('dashboard');
  const { isLoggedIn, isAdmin, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const currentLang: 'zh' | 'en' = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'zh';

  useEffect(() => {
    const on401 = () => {
      logout();
      setPage('dashboard');
    };
    window.addEventListener('auth:401', on401);
    return () => window.removeEventListener('auth:401', on401);
  }, [logout]);

  const pageIconMap: Partial<Record<PageId, React.ReactNode>> = useMemo(
    () => ({
      dashboard: <LayoutDashboard size={16} />,
      characters: <UserCircle2 size={16} />,
      outline: <BookOpenText size={16} />,
      writing: <FileText size={16} />,
      graph: <ImageIcon size={16} />,
      audio: <AudioLines size={16} />,
      video: <VideoIcon size={16} />,
      knowledge: <Database size={16} />,
      virtualFolder: <Network size={16} />,
      account: <ShieldCheck size={16} />,
      users: <Users2 size={16} />,
      adminStats: <Gauge size={16} />,
      adminTasks: <ListChecks size={16} />,
      adminProviders: <Settings2 size={16} />,
      formOptions: <Settings2 size={16} />,
      promptConfig: <Settings2 size={16} />,
      adminSensitiveWords: <ShieldCheck size={16} />,
      adminKnowledge: <Database size={16} />,
    }),
    []
  );

  const sidebarGroups = useMemo(() => {
    const groups: { title: string; items: { id: PageId; label: string }[] }[] = [
      {
        title: t('nav.groups.tasks'),
        items: TASK_GROUP.items.map((item) => ({ id: item.id, label: t(item.labelKey) })),
      },
      {
        title: t('nav.groups.assets'),
        items: ASSET_GROUP.items.map((item) => ({ id: item.id, label: t(item.labelKey) })),
      },
    ];
    if (isAdmin) {
      groups.push({
        title: t('nav.groups.admin'),
        items: ADMIN_GROUP.items.map((item) => ({ id: item.id, label: t(item.labelKey) })),
      });
    }
    return groups;
  }, [isAdmin, t]);

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
    if (!isLoggedIn) {
      return <Landing />;
    }
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

  const pageLabel =
    !isLoggedIn
      ? 'SuperMX'
      : page === 'dashboard'
      ? t('page.dashboard')
      : (() => {
          const key = ((): string => {
            switch (page) {
              case 'characters':
              case 'outline':
              case 'writing':
              case 'video':
              case 'graph':
              case 'audio':
              case 'knowledge':
              case 'virtualFolder':
              case 'account':
              case 'users':
              case 'adminStats':
              case 'adminTasks':
              case 'adminProviders':
              case 'formOptions':
              case 'promptConfig':
              case 'adminSensitiveWords':
              case 'adminKnowledge':
                return `nav.items.${page}`;
              default:
                return page;
            }
          })();
          return t(key);
        })();

  return (
    <div className="app-dashboard">
      {isLoggedIn && (
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
                        {pageIconMap[item.id] && (
                          <span className="nav-item-icon">{pageIconMap[item.id]}</span>
                        )}
                        <span className="nav-item-label">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
      )}
      <div className="main-wrap">
        <header className="dashboard-header">
          <div className="dashboard-title-wrap">
            <h1 className="dashboard-title">{pageLabel}</h1>
            <p className="dashboard-subtitle">{t('header.subtitle')}</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="打开/关闭侧边栏"
            >
              <Menu size={16} />
            </button>
            <div className="header-search" role="search" aria-label="全局搜索">
              <Search size={16} style={{ opacity: 0.75 }} />
              <input placeholder="Search / Prompt…（仅 UI，占位）" />
              <kbd>⌘K</kbd>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setMode(isDark ? 'light' : 'dark')}
              aria-label={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {mode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              <span>{mode === 'dark' ? '深色' : '亮色'}</span>
            </button>
            <button
              type="button"
              className="lang-toggle"
              onClick={() => {
                const next: 'zh' | 'en' = currentLang === 'zh' ? 'en' : 'zh';
                void i18n.changeLanguage(next);
                if (typeof window !== 'undefined') window.localStorage.setItem('mxm-lang', next);
              }}
              aria-label="切换语言（中/EN）"
            >
              <Globe size={16} />
              <span className={`lang-pill ${currentLang === 'zh' ? 'active' : ''}`}>中</span>
              <span className={`lang-pill ${currentLang === 'en' ? 'active' : ''}`}>EN</span>
            </button>
            {isLoggedIn ? (
              <>
                <span className="user-status">{t('auth.loggedIn')}</span>
                <button type="button" className="btn-logout" onClick={logout}>
                  {t('auth.logout')}
                </button>
              </>
            ) : (
              <span className="user-status">{t('auth.loggedOut')}</span>
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

export default function App() {
  const { mode, isDark, setMode } = useThemeMode();
  const { i18n } = useTranslation();
  const currentLang: 'zh' | 'en' = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'zh';
  const themeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorBgContainer: isDark ? '#0F172A' : '#ffffff',
        colorBgElevated: isDark ? '#111B33' : '#f9fafb',
        colorBorder: isDark ? 'rgba(148,163,184,0.24)' : '#e5e7eb',
        colorBorderSecondary: isDark ? 'rgba(148,163,184,0.18)' : '#f3f4f6',
        colorText: isDark ? '#F8FAFC' : '#0f172a',
        colorTextSecondary: isDark ? 'rgba(248,250,252,0.72)' : '#475569',
        colorPrimary: '#22C55E',
        colorSuccess: isDark ? '#4ade80' : '#16a34a',
        colorWarning: isDark ? '#facc15' : '#eab308',
        colorError: isDark ? '#f87171' : '#dc2626',
        colorInfo: isDark ? '#60a5fa' : '#2563eb',
        borderRadius: 8,
        fontSize: 14,
        controlHeight: 36,
        padding: 12,
        fontFamily: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
    }),
    [isDark]
  );

  return (
    <ConfigProvider locale={currentLang === 'en' ? enUS : zhCN} theme={themeConfig}>
      <AntdApp>
        <AuthProvider>
          <AppContent mode={mode} isDark={isDark} setMode={setMode} />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
