import { useState } from 'react';
import { useI18n } from '../context/I18nContext';

export function VirtualFolderPage() {
  const { t } = useI18n();
  const [folders, setFolders] = useState<any[]>([
    { id: 1, name: '项目A', fileCount: 12, size: '45MB', date: '2024-03-09' },
    { id: 2, name: '项目B', fileCount: 8, size: '32MB', date: '2024-03-08' },
    { id: 3, name: '素材库', fileCount: 25, size: '120MB', date: '2024-03-07' },
  ]);

  return (
    <div className="virtual-folder-page">
      <div className="page-header">
        <h1>{t('sidebar.virtualFolder')}</h1>
        <p>管理虚拟文件夹和文件组织</p>
      </div>

      <div className="folder-content">
        <div className="folder-actions">
          <button className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建文件夹
          </button>
          <button className="btn-secondary">上传文件</button>
        </div>

        <div className="folders-grid">
          {folders.map((folder) => (
            <div key={folder.id} className="folder-card">
              <div className="folder-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="folder-info">
                <h3>{folder.name}</h3>
                <p>文件数: {folder.fileCount}</p>
                <p>大小: {folder.size}</p>
                <p>创建: {folder.date}</p>
              </div>
              <div className="folder-actions">
                <button className="btn-small">打开</button>
                <button className="btn-small">重命名</button>
                <button className="btn-small btn-danger">删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}