import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

export function SimpleSettings() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useI18n();

  return (
    <div className="simple-settings">
      <div className="simple-settings-row">
        <div className="simple-settings-group">
          <span className="simple-settings-label">主题</span>
          <div className="simple-settings-buttons">
            <button
              className={`simple-settings-button ${theme === 'dark' ? 'simple-settings-button--active' : ''}`}
              onClick={() => setTheme('dark')}
              title="暗色主题"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </button>
            <button
              className={`simple-settings-button ${theme === 'light' ? 'simple-settings-button--active' : ''}`}
              onClick={() => setTheme('light')}
              title="亮色主题"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          </div>
        </div>

        <div className="simple-settings-group">
          <span className="simple-settings-label">语言</span>
          <div className="simple-settings-buttons">
            <button
              className={`simple-settings-button ${language === 'zh' ? 'simple-settings-button--active' : ''}`}
              onClick={() => setLanguage('zh')}
              title="中文"
            >
              中
            </button>
            <button
              className={`simple-settings-button ${language === 'en' ? 'simple-settings-button--active' : ''}`}
              onClick={() => setLanguage('en')}
              title="English"
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}