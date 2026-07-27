import { useEffect, useState } from 'react';
import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavIcon, type NavPageId } from '../lib/navIcons';
import './AppSidebar.css';

const STORAGE_KEY = 'mxm-sidebar-collapsed';

export interface SidebarNavItem {
  id: NavPageId;
  label: string;
}

export interface SidebarNavGroup {
  title: string;
  items: SidebarNavItem[];
}

interface AppSidebarProps {
  groups: SidebarNavGroup[];
  activePage: NavPageId;
  drawerOpen: boolean;
  onNavigate: (page: NavPageId) => void;
  onCloseDrawer: () => void;
}

export function AppSidebar({
  groups,
  activePage,
  drawerOpen,
  onNavigate,
  onCloseDrawer,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''} ${drawerOpen ? 'app-sidebar--open' : ''}`}
      aria-label={t('shell.sidebar.mainNav')}
    >
      <div className="app-sidebar__head">
        <button
          type="button"
          className="app-sidebar__brand"
          onClick={() => {
            onNavigate('dashboard');
            onCloseDrawer();
          }}
          title={t('shell.sidebar.homeTitle')}
        >
          <span className="app-sidebar__brand-mark" aria-hidden="true">
            MXM
          </span>
          <span className="app-sidebar__brand-text">SuperMXM</span>
        </button>
      </div>

      <nav className="app-sidebar__nav">
        {groups.map((group) => (
          <section key={group.title} className="app-sidebar__group" aria-label={group.title}>
            <h2 className="app-sidebar__group-title">{group.title}</h2>
            <ul className="app-sidebar__list">
              {group.items.map((item) => {
                const isActive = activePage === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`app-sidebar__item ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        onNavigate(item.id);
                        onCloseDrawer();
                      }}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="app-sidebar__icon">
                        <NavIcon id={item.id} />
                      </span>
                      <span className="app-sidebar__label">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <button
          type="button"
          className="app-sidebar__collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('shell.sidebar.expandSidebar') : t('shell.sidebar.collapseSidebar')}
          title={collapsed ? t('shell.sidebar.expandSidebar') : t('shell.sidebar.collapseSidebar')}
        >
          <span className="app-sidebar__collapse-icon" aria-hidden="true">
            {collapsed ? (
              <PanelLeft size={17} strokeWidth={1.65} />
            ) : (
              <PanelLeftClose size={17} strokeWidth={1.65} />
            )}
          </span>
          <span className="app-sidebar__collapse-label">
            {collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
          </span>
        </button>
      </div>
    </aside>
  );
}
