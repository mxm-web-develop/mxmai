import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useTheme } from '../context/ThemeContext';

export function AppLayout() {
  const { user, isAdmin, logout } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // 根据当前路由获取页面标题
  const getPageTitle = () => {
    const path = location.pathname;
    
    if (path === '/') return { title: t('dashboard.title'), subtitle: t('dashboard.subtitle') };
    if (path === '/characters') return { title: t('sidebar.characters'), subtitle: t('page.subtitle.characters') };
    if (path === '/writing') return { title: t('sidebar.writing'), subtitle: t('page.subtitle.writing') };
    if (path === '/graph') return { title: t('sidebar.graph'), subtitle: t('page.subtitle.graph') };
    if (path === '/audio') return { title: t('sidebar.audio'), subtitle: t('page.subtitle.audio') };
    if (path === '/video') return { title: t('sidebar.video'), subtitle: t('page.subtitle.video') };
    if (path === '/knowledge') return { title: t('sidebar.knowledge'), subtitle: t('page.subtitle.knowledge') };
    if (path === '/virtual-folder') return { title: t('sidebar.virtualFolder'), subtitle: t('page.subtitle.virtualFolder') };
    if (path === '/account') return { title: t('sidebar.account'), subtitle: t('page.subtitle.account') };
    if (path === '/admin/users') return { title: t('sidebar.users'), subtitle: t('page.subtitle.users') };
    if (path === '/admin/stats') return { title: t('sidebar.stats'), subtitle: t('page.subtitle.stats') };
    if (path === '/admin/tasks') return { title: t('sidebar.taskMonitor'), subtitle: t('page.subtitle.taskMonitor') };
    
    return { title: t('dashboard.title'), subtitle: t('dashboard.subtitle') };
  };

  const pageTitle = getPageTitle();

  return (
    <div className="app-root">
      <aside className="app-sidebar">
        <div className="app-logo">
          <span className="app-logo-mark">MX</span>
          <div className="app-logo-text">
            <div className="app-logo-title">{t('app.title')}</div>
            <div className="app-logo-subtitle">{t('app.subtitle')}</div>
          </div>
        </div>

        <nav className="app-nav">
          {/* 仪表板 */}
          <div className="app-nav-section-label">{t('sidebar.dashboard')}</div>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>{t('sidebar.dashboard')}</span>
          </NavLink>

          {/* 生成任务 */}
          <div className="app-nav-section-label">{t('sidebar.tasks')}</div>
          
          {/* 角色 */}
          <NavLink
            to="/characters"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{t('sidebar.characters')}</span>
          </NavLink>
          
          {/* 大纲与写作 */}
          <NavLink
            to="/writing"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            <span>{t('sidebar.writing')}</span>
          </NavLink>
          
          {/* 图片生成 */}
          <NavLink
            to="/graph"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>{t('sidebar.graph')}</span>
          </NavLink>
          
          {/* 音频生成 */}
          <NavLink
            to="/audio"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <span>{t('sidebar.audio')}</span>
          </NavLink>
          
          {/* 视频生成 */}
          <NavLink
            to="/video"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span>{t('sidebar.video')}</span>
          </NavLink>

          {/* 资产管理 */}
          <div className="app-nav-section-label">{t('sidebar.assets')}</div>
          
          {/* 知识库 */}
          <NavLink
            to="/knowledge"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span>{t('sidebar.knowledge')}</span>
          </NavLink>
          
          {/* 虚拟文件夹 */}
          <NavLink
            to="/virtual-folder"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>{t('sidebar.virtualFolder')}</span>
          </NavLink>
          
          {/* 账号信息 */}
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{t('sidebar.account')}</span>
          </NavLink>

          {/* 管理员功能 */}
          {isAdmin && (
            <>
              <div className="app-nav-section-label">{t('sidebar.admin')}</div>
              
              {/* 用户管理 */}
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `app-nav-item ${isActive ? 'active' : ''}`
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>{t('sidebar.users')}</span>
              </NavLink>
              
              {/* 系统概览 */}
              <NavLink
                to="/admin/stats"
                className={({ isActive }) =>
                  `app-nav-item ${isActive ? 'active' : ''}`
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>{t('sidebar.stats')}</span>
              </NavLink>
              
              {/* 任务监控 */}
              <NavLink
                to="/admin/tasks"
                className={({ isActive }) =>
                  `app-nav-item ${isActive ? 'active' : ''}`
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span>{t('sidebar.taskMonitor')}</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-user-info">
            <div className="app-user-name">{user?.username ?? t('user.notLoggedIn')}</div>
            <div className="app-user-role">{isAdmin ? t('user.admin') : t('user.normal')}</div>
          </div>
          
          <div className="app-footer-actions">
            <button
              className="app-footer-action-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={t('theme')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {theme === 'dark' ? (
                  <circle cx="12" cy="12" r="5" />
                ) : (
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                )}
              </svg>
            </button>
            
            <button
              className="app-footer-action-btn"
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              title={t('language')}
            >
              {language === 'zh' ? 'EN' : '中'}
            </button>
            
            <button className="app-logout-btn" type="button" onClick={handleLogout}>
              {t('logout')}
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-header-title">
            <h1>{pageTitle.title}</h1>
            <p>{pageTitle.subtitle}</p>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

