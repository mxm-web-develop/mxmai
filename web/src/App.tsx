import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import zhTW from 'antd/locale/zh_TW';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import type { Locale } from 'antd/es/locale';
import { normalizeAppLocale, type AppLocale } from './i18n/appLocale';
import { ImageIcon, LayoutDashboard, Menu, MessageSquare, ShieldCheck, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { KnowledgeBaseParseProvider } from './context/KnowledgeBaseParseContext';
const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Writing = lazy(() => import('./pages/Writing'));
const Video = lazy(() => import('./pages/Video'));
const Graph = lazy(() => import('./pages/Graph'));
const Audio = lazy(() => import('./pages/Audio'));
const Music = lazy(() => import('./pages/Music'));
const Smartflow = lazy(() => import('./pages/Smartflow'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBase'));
const UploadManager = lazy(() => import('./pages/UploadManager'));
const Account = lazy(() => import('./pages/Account'));
const AdminOps = lazy(() => import('./pages/AdminOps'));
const ProviderRoutes = lazy(() => import('./pages/ProviderRoutes'));
const AdminBusiness = lazy(() => import('./pages/AdminBusiness'));
const AdminQualityEval = lazy(() => import('./pages/AdminQualityEval'));
const AgentChat = lazy(() => import('./pages/AgentChat'));
import './App.css';
import './styles/shell.css';
import './styles/generation-console.css';
import './styles/console-controls.css';
import './styles/console-table.css';
import './styles/admin-console.css';
import './styles/asset-center.css';
import './styles/smartflow-shell.css';
import './styles/generation-media-forms.css';
import './components/task-list/generation-task-cards.css';
import './styles/writing-task-cards.css';
import './styles/dashboard-console.css';
import './styles/dashboard-visual.css';
import './styles/mobile-overrides.css';
import './styles/legacy-pages.css';
import './styles/two-pane.css';
import './styles/outline-form.css';
import './styles/legacy-light-mode.css';
import './styles/mobile-pages.css';
import './styles/admin-mobile.css';
import PageLoading, { LazyRouteReady, resolvePageLoadingVariant } from './components/PageLoading';
import BrandLoading from './components/BrandLoading';
import { AppShellHeader } from './components/AppShellHeader';
import { AppSidebar } from './components/AppSidebar';
import type { NavPageId } from './lib/navIcons';
import { peekOpenApiTaskNav } from './lib/openApiTaskNavigation';
import {
  applyHtmlThemeClass,
  persistLanguagePreference,
  persistThemePreference,
  readThemePreference,
  type ThemeMode,
} from './lib/clientPreferences';

type PageId = NavPageId;

// 已隐藏：characters（未开发）、outline（由 text 分形替代）
const HIDDEN_PAGES: PageId[] = ['characters', 'outline'];

// 生成任务
const TASK_GROUP = {
  id: 'tasks',
  items: [
    { id: 'writing' as PageId, labelKey: 'nav.items.writing' },
    { id: 'graph' as PageId, labelKey: 'nav.items.graph' },
    { id: 'audio' as PageId, labelKey: 'nav.items.audio' },
    { id: 'music' as PageId, labelKey: 'nav.items.music' },
    { id: 'video' as PageId, labelKey: 'nav.items.video' },
    { id: 'agentChat' as PageId, labelKey: 'nav.items.agentChat' },
  ],
};

// 资产管理
const ASSET_GROUP = {
  id: 'assets',
  items: [
    { id: 'knowledgeBase' as PageId, labelKey: 'nav.items.knowledgeBase' },
    { id: 'uploadManager' as PageId, labelKey: 'nav.items.uploadManager' },
    { id: 'account' as PageId, labelKey: 'nav.items.account' },
  ],
};

// 仅 Admin 可见
const ADMIN_GROUP = {
  id: 'admin',
  items: [
    { id: 'adminProviders' as PageId, labelKey: 'nav.items.adminProviders' },
    { id: 'adminBusiness' as PageId, labelKey: 'nav.items.adminBusiness' },
    { id: 'adminQualityEval' as PageId, labelKey: 'nav.items.adminQualityEval' },
    { id: 'adminOps' as PageId, labelKey: 'nav.items.adminOps' },
    { id: 'smartflow' as PageId, labelKey: 'nav.items.smartflow' },
    // v2：敏感词 / 系统知识库迁移到业务管理页
  ],
};

function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemePreference());

  useEffect(() => {
    applyHtmlThemeClass(mode === 'dark');
  }, [mode]);

  const setMode = (next: ThemeMode, options?: { manual?: boolean }) => {
    setModeState(next);
    if (options?.manual) persistThemePreference(next);
  };

  return { mode, isDark: mode === 'dark', setMode };
}

interface AppContentProps {
  isDark: boolean;
  setMode: (mode: ThemeMode, options?: { manual?: boolean }) => void;
}

function AppContent({ isDark, setMode }: AppContentProps) {
  const [page, setPage] = useState<PageId>('dashboard');
  const { isLoggedIn, isAdmin, logout, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const currentLang: AppLocale = normalizeAppLocale(i18n.language);

  const handleThemeChange = (next: ThemeMode) => setMode(next, { manual: true });
  const handleLanguageChange = (lang: AppLocale) => {
    void i18n.changeLanguage(lang);
    persistLanguagePreference(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'zh-TW' ? 'zh-TW' : lang === 'ja' ? 'ja' : 'en';
    }
  };

  useEffect(() => {
    const on401 = () => {
      logout();
      setPage('dashboard');
    };
    window.addEventListener('auth:401', on401);
    return () => window.removeEventListener('auth:401', on401);
  }, [logout]);

  useEffect(() => {
    const onOpenApiNav = () => {
      const pending = peekOpenApiTaskNav();
      if (pending?.page) setPage(pending.page as PageId);
    };
    window.addEventListener('mxm-request-nav', onOpenApiNav);
    return () => window.removeEventListener('mxm-request-nav', onOpenApiNav);
  }, []);

  useEffect(() => {
    if (HIDDEN_PAGES.includes(page)) setPage('dashboard');
  }, [page]);

  useEffect(() => {
    (window as Window & { __setPage?: (id: string) => void }).__setPage = (id: string) => {
      if (HIDDEN_PAGES.includes(id as PageId)) return;
      setPage(id as PageId);
    };
    return () => {
      delete (window as Window & { __setPage?: (id: string) => void }).__setPage;
    };
  }, []);

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
    'adminBusiness',
    'adminQualityEval',
    'adminOps',
    'users',
    'adminSensitiveWords',
    'smartflow',
  ];

  if (!isLoggedIn) {
    return (
      <Suspense fallback={<PageLoading variant={resolvePageLoadingVariant()} />}>
        <LazyRouteReady>
          <Landing
            isDark={isDark}
            currentLang={currentLang}
            onThemeChange={handleThemeChange}
            onLanguageChange={handleLanguageChange}
          />
        </LazyRouteReady>
      </Suspense>
    );
  }

  const renderPage = () => {
    let content: React.ReactNode;
    if (HIDDEN_PAGES.includes(page) || (adminOnlyPages.includes(page) && !isAdmin)) {
      content = <Dashboard />;
    } else {
      switch (page) {
        case 'dashboard':
          content = <Dashboard />;
          break;
        case 'users':
          content = <AdminOps />;
          break;
        case 'adminOps':
          content = <AdminOps />;
          break;
        case 'adminProviders':
          content = <ProviderRoutes />;
          break;
        case 'adminBusiness':
          content = <AdminBusiness />;
          break;
        case 'adminQualityEval':
          content = <AdminQualityEval />;
          break;
        case 'writing':
          content = <Writing />;
          break;
        case 'video':
          content = <Video />;
          break;
        case 'graph':
          content = <Graph />;
          break;
        case 'audio':
          content = <Audio />;
          break;
        case 'music':
          content = <Music />;
          break;
        case 'smartflow':
          content = <Smartflow />;
          break;
        case 'knowledgeBase':
          content = <KnowledgeBasePage />;
          break;
        case 'uploadManager':
          content = <UploadManager />;
          break;
        case 'account':
          content = <Account />;
          break;
        case 'agentChat':
          content = <AgentChat />;
          break;
        case 'adminSensitiveWords':
          content = <AdminBusiness />;
          break;
        default:
          content = <Dashboard />;
      }
    }
    return (
      <Suspense fallback={<PageLoading variant={resolvePageLoadingVariant()} />}>
        <LazyRouteReady>{content}</LazyRouteReady>
      </Suspense>
    );
  };

  const pageLabel =
    page === 'dashboard'
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
              case 'music':
              case 'smartflow':
              case 'knowledgeBase':
              case 'uploadManager':
              case 'account':
              case 'agentChat':
              case 'users':
              case 'adminOps':
              case 'adminProviders':
              case 'adminBusiness':
              case 'adminQualityEval':
              case 'adminSensitiveWords':
                return `nav.items.${page}`;
              default:
                return page;
            }
          })();
          return t(key);
        })();

  return (
    <KnowledgeBaseParseProvider onNavigateToKnowledgeBase={() => setPage('knowledgeBase')}>
    <div className={`app-dashboard${page === 'agentChat' ? ' app-dashboard--agent-chat' : ''}`}>
      {/* 移动端 Sidebar 遮罩 */}
      {isLoggedIn && sidebarOpen && (
        <div
          className="app-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      {isLoggedIn && (
        <AppSidebar
          groups={sidebarGroups}
          activePage={page}
          drawerOpen={sidebarOpen}
          onNavigate={setPage}
          onCloseDrawer={() => setSidebarOpen(false)}
        />
      )}
      <div className="main-wrap">
        <AppShellHeader
          title={pageLabel}
          subtitle={t('header.subtitle')}
          isLoggedIn={isLoggedIn}
          user={user}
          isDark={isDark}
          currentLang={currentLang}
          onThemeChange={handleThemeChange}
          onLanguageChange={handleLanguageChange}
          onLogout={logout}
          onNavigateToAccount={() => setPage('account')}
          showSidebarToggle={isLoggedIn}
          onSidebarToggle={() => setSidebarOpen((v) => !v)}
        />
        <main className="dashboard-main">
          <div className="dashboard-main-inner">{renderPage()}</div>
        </main>

        {/* 移动端底部导航（聊天页全屏，不显示） */}
        {isLoggedIn && page !== 'agentChat' && (
          <nav className="mobile-bottom-nav" aria-label="移动端导航">
            <button
              type="button"
              className={`mobile-nav-item ${page === 'dashboard' ? 'active' : ''}`}
              onClick={() => setPage('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>首页</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${['graph', 'video', 'audio', 'music'].includes(page) ? 'active' : ''}`}
              onClick={() => setPage('graph')}
            >
              <ImageIcon size={18} />
              <span>创作</span>
            </button>
            {isAdmin ? (
              <button
                type="button"
                className={`mobile-nav-item ${page === 'smartflow' ? 'active' : ''}`}
                onClick={() => setPage('smartflow')}
              >
                <Workflow size={18} />
                <span>工作流</span>
              </button>
            ) : (
              <button
                type="button"
                className={`mobile-nav-item ${page === 'account' ? 'active' : ''}`}
                onClick={() => setPage('account')}
              >
                <ShieldCheck size={18} />
                <span>账号</span>
              </button>
            )}
            <button
              type="button"
              className={`mobile-nav-item ${page === 'agentChat' ? 'active' : ''}`}
              onClick={() => setPage('agentChat')}
            >
              <MessageSquare size={18} />
              <span>Agent</span>
            </button>
            <button
              type="button"
              className="mobile-nav-item"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
              <span>更多</span>
            </button>
          </nav>
        )}
      </div>
    </div>
    </KnowledgeBaseParseProvider>
  );
}

function antdLocaleFor(lang: AppLocale): Locale {
  switch (lang) {
    case 'en':
      return enUS;
    case 'zh-TW':
      return zhTW;
    case 'ja':
      return jaJP;
    case 'zh':
    default:
      return zhCN;
  }
}

export default function App() {
  const { isDark, setMode } = useThemeMode();
  const { i18n } = useTranslation();
  const currentLang = normalizeAppLocale(i18n.language);
  const themeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorBgContainer: isDark ? '#0F172A' : '#ffffff',
        colorBgElevated: isDark ? '#111B33' : '#f9fafb',
        colorBorder: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.14)',
        colorBorderSecondary: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.08)',
        colorText: isDark ? '#F8FAFC' : '#0f172a',
        colorTextSecondary: isDark ? 'rgba(248,250,252,0.72)' : '#475569',
        colorPrimary: '#0284c7',
        colorSuccess: isDark ? '#4ade80' : '#047857',
        colorWarning: isDark ? '#fde68a' : '#b45309',
        colorError: isDark ? '#fecaca' : '#b91c1c',
        colorInfo: isDark ? '#60a5fa' : '#2563eb',
        borderRadius: 10,
        fontSize: 14,
        controlHeight: 36,
        padding: 12,
        fontFamily: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
      components: {
        Button: { borderRadius: 10, controlHeight: 36, paddingInline: 16 },
        Modal: { borderRadiusLG: 20, paddingContentHorizontal: 24 },
        Drawer: { borderRadiusLG: 14 },
        Select: { borderRadius: 6, controlHeight: 36 },
        Input: { borderRadius: 6, controlHeight: 36 },
        Card: { borderRadiusLG: 14 },
      },
    }),
    [isDark]
  );

  return (
    <ConfigProvider
      locale={antdLocaleFor(currentLang)}
      theme={themeConfig}
      spin={{ indicator: <BrandLoading /> }}
    >
      <AntdApp>
        <AuthProvider>
          <AppContent isDark={isDark} setMode={setMode} />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
