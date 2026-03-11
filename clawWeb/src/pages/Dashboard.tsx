import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

export function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();

  return (
    <div className="dashboard">
      <section className="dashboard-greeting">
        <h2>{t('dashboard.welcome')}，{user?.username ?? t('user.guest')}</h2>
        <p>
          {t('dashboard.currentRole')}：{isAdmin ? t('user.admin') : t('user.normal')}。
          {t('dashboard.description')}
        </p>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-card">
          <h3>{t('sidebar.tasks')}</h3>
          <p>{t('dashboard.tasksDesc')}</p>
          <ul>
            <li>{t('dashboard.taskItem1')}</li>
            <li>{t('dashboard.taskItem2')}</li>
            <li>{t('dashboard.taskItem3')}</li>
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>{t('sidebar.assets')}</h3>
          <p>{t('dashboard.assetsDesc')}</p>
          <ul>
            <li>{t('dashboard.assetItem1')}</li>
            <li>{t('dashboard.assetItem2')}</li>
            <li>{t('dashboard.assetItem3')}</li>
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>{t('sidebar.admin')}</h3>
          <p>{t('dashboard.adminDesc')}</p>
          <ul>
            <li>{t('dashboard.adminItem1')}</li>
            <li>{t('dashboard.adminItem2')}</li>
            <li>{t('dashboard.adminItem3')}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

