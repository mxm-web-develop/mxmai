import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

export function SidebarSettings() {
  const { theme, toggleTheme, setTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sidebar-settings">
      <button 
        className="sidebar-settings-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('settings')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        <span>{t('settings')}</span>
      </button>

      {isOpen && (
        <div className="sidebar-settings-dropdown">
          <div className="sidebar-settings-section">
            <h3 className="sidebar-settings-title">{t('theme')}</h3>
            <div className="sidebar-settings-options">
              <button
                className={`sidebar-settings-option ${theme === 'dark' ? 'sidebar-settings-option--active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                <div className="sidebar-settings-option-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                </div>
                <span>{t('dark')}</span>
              </button>
              <button
                className={`sidebar-settings-option ${theme === 'light' ? 'sidebar-settings-option--active' : ''}`}
                onClick={() => setTheme('light')}
              >
                <div className="sidebar-settings-option-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </div>
                <span>{t('light')}</span>
              </button>
            </div>
          </div>

          <div className="sidebar-settings-section">
            <h3 className="sidebar-settings-title">{t('language')}</h3>
            <div className="sidebar-settings-options">
              <button
                className={`sidebar-settings-option ${language === 'zh' ? 'sidebar-settings-option--active' : ''}`}
                onClick={() => setLanguage('zh')}
              >
                <div className="sidebar-settings-option-icon">
                  <span>中</span>
                </div>
                <span>{t('chinese')}</span>
              </button>
              <button
                className={`sidebar-settings-option ${language === 'en' ? 'sidebar-settings-option--active' : ''}`}
                onClick={() => setLanguage('en')}
              >
                <div className="sidebar-settings-option-icon">
                  <span>EN</span>
                </div>
                <span>{t('english')}</span>
              </button>
            </div>
          </div>

          <div className="sidebar-settings-section">
            <button
              className="sidebar-settings-toggle-theme"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? t('light') : t('dark')} {t('theme')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}